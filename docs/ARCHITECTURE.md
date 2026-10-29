# Streamify architecture

This document explains how the pieces fit together and why they were built this way.
The README covers how to run things.

## High-level view

```
 Browser (React SPA)                         Node.js process
 ┌──────────────────────────┐   HTTPS/JSON   ┌─────────────────────────────────────┐
 │ Pages / components       │ ─────────────▶ │ Express 5  /api/v1                   │
 │ AuthContext  Library ctx │   cookie auth  │  helmet · cors · csrf header check   │
 │ PlayerContext (<audio>)  │ ◀───────────── │  zod validation · pino logging       │
 │ useRoom (socket.io)      │   Range audio  │  modules: auth tracks playlists rooms│
 └──────────┬───────────────┘                │                                     │
            │ WebSocket (same cookie)        │ Socket.IO server (rooms, chat, sync) │
            └──────────────────────────────▶ │  presence (in-memory)                │
                                             └──────┬──────────────┬───────────────┘
                                                    │              │
                                               MongoDB         Redis (optional)
                                          users, tracks,     catalogue cache,
                                          playlists, likes,  logout denylist
                                          rooms, chat
```

In Docker, nginx serves the built SPA and reverse-proxies `/api` and `/socket.io` to the
API container. The browser therefore talks to a single origin.

## Backend layout (`server/src`)

| Path          | Responsibility                                                                       |
| ------------- | ------------------------------------------------------------------------------------ |
| `config/`     | Reads and validates environment variables with zod at startup; bad config fails fast |
| `lib/`        | Logger (pino with redaction), DB connection, Redis cache helper, errors, pagination  |
| `middleware/` | `validate` (zod), `requireAuth`, CSRF header check, error/404 handlers               |
| `models/`     | Mongoose schemas **and their indexes**                                               |
| `modules/*`   | One folder per feature: routes, plus a service when logic is shared                  |
| `realtime/`   | Socket.IO server, event schemas, presence tracking, emitter used by REST             |

Every module follows the same pattern: validate input → authorize → act → shape a DTO.
Errors are thrown as `AppError(status, code, message)` and converted by one error handler
into `{ "error": { "code", "message", "details?" } }`. Express 5 forwards rejected
promises from async handlers on its own, so there is no `try/catch` boilerplate.

## Authentication and authorization

- **Passwords**: bcrypt (cost 12; 4 in tests for speed). The hash field has `select: false`,
  so it never leaves the database unless a query asks for it explicitly.
- **Sessions**: a JWT (HS256, 7-day default) stored in an **httpOnly, SameSite=Lax** cookie,
  with `Secure` in production. The token is never returned in a JSON body, so page JavaScript
  cannot read it. The same cookie authenticates the Socket.IO handshake.
- **Logout**: the token's `jti` goes on a denylist until the token's natural expiry. The
  denylist lives in Redis when Redis is available (shared across instances) and is always
  mirrored in process memory. Without Redis, revocation therefore covers a single instance only.
- **CSRF**: SameSite=Lax already stops cookies being sent on cross-site POSTs. As a second
  layer, every state-changing request must carry `X-Requested-With: streamify`. A cross-origin
  page can't send a custom header without a CORS preflight, and CORS only allows the
  configured client origin(s).
- **Brute force**: `express-rate-limit` on `/auth/login` and `/auth/register`.
- **Login timing**: an unknown email still runs a bcrypt compare against a dummy hash, and
  both failures return the same message.
- **Authorization lives on the server**:
  - Playlists: every mutation loads the playlist and checks `owner == user`. If someone else
    owns it, you get 403, except for a private playlist, which returns 404 so its existence
    isn't revealed. Reading is allowed for the owner, or for anyone when the playlist is public.
  - Rooms: one reducer (`rooms.service.js`) applies every playback action and checks
    `canControl = isHost || controlMode === 'everyone'`. REST and socket entry points share it,
    so the two paths can't drift apart. Only the host can change settings or close the room.

## Data model and indexes

| Collection     | Key fields                                  | Indexes (and the query each serves)                                                                                                                            |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`        | username, email, passwordHash               | unique `email` (login); unique case-insensitive `username` (collation strength 2)                                                                              |
| `tracks`       | metadata, `audioFile`, `playCount`          | weighted text index (search); `{genre, createdAt}`, `{genre, playCount}`, `{genre, title}` plus the same sorts without genre (filtered/sorted catalogue pages) |
| `playlists`    | owner, name, isPublic, `tracks[]` (ordered) | `{owner, updatedAt}` (“my playlists”, newest first)                                                                                                            |
| `likes`        | user, track                                 | unique `{user, track}` (idempotent like); `{user, createdAt}` (liked songs page)                                                                               |
| `rooms`        | code, host, controlMode, queue, playback    | unique `code` (join); `{isPublic, lastActiveAt}` (public room list); `{host, createdAt}`                                                                       |
| `chatmessages` | room, user, username, text                  | `{room, createdAt, _id}` (cursor-paginated history)                                                                                                            |

Design choices:

- **Likes are a separate collection** rather than an array on the user. User documents
  stay small, and likes can be paginated by time.
- **Playlists embed an ordered array of track ids**, capped at 500. Order is the playlist's
  identity, and a bounded array is cheaper than a join collection at this scale. The size cap
  is enforced atomically: the update only matches if `tracks.499` doesn't exist yet.
- **Chat stores `username`** on each message. History renders without a join, at the cost of
  showing old names after a rename (renames aren't supported anyway).

## Pagination

- **Catalogue, playlists, likes, rooms**: offset pagination (`page`, `limit ≤ 50`). The response
  carries `{ page, limit, total, totalPages, hasNext, hasPrev }`. Offsets are simple and allow
  "page N of M" in the UI. The cost is that deep pages scan skipped documents, which is fine
  for a catalogue this size.
- **Chat history**: cursor pagination (`before=<messageId>`, sorted on `(createdAt, _id)`).
  New messages arrive constantly, so offsets would shift and duplicate or skip messages.
  Cursors stay stable.

## Search

1. `$text` search on the weighted text index, ranked by relevance (or by an explicit sort).
2. Text search only matches whole words, so if it returns nothing, the server falls back to a
   case-insensitive word-prefix regex (`midn` → "Midnight Static"). User input is
   regex-escaped first. The fallback is a collection scan, acceptable for a demo catalogue;
   a large catalogue would use Atlas Search, Elasticsearch or Meilisearch instead.

## Redis caching

Cache-aside via `getOrSet(key, ttl, compute)`. Responses carry an `X-Cache` header of
`HIT`, `MISS` or `BYPASS` so the behaviour can be shown in a demo.

| Data                    | Key pattern                                    | TTL                      |
| ----------------------- | ---------------------------------------------- | ------------------------ |
| Catalogue list / search | `tracks:list:v{ver}:[q,genre,sort,page,limit]` | 60 s                     |
| Track detail            | `tracks:id:v{ver}:{id}`                        | 300 s                    |
| Genre counts            | `tracks:genres:v{ver}`                         | 600 s                    |
| Logout denylist         | `auth:revoked:{jti}`                           | remaining token lifetime |

- **Invalidation**: each key includes a namespace version (`ns:tracks:v`). A catalogue write
  (the seed script) runs `INCR` on that version, so every old key becomes unreachable at once
  and then expires through its TTL. There's no `KEYS`/`SCAN` and no risk of missing a key.
- **Deliberate staleness**: play counts don't invalidate the cache, so the "Most played" sort
  can lag by up to 60 s. That trades a little freshness for a much better hit rate.
- **What isn't cached**: playlists, likes and rooms are per-user or change often. Caching them
  would add invalidation complexity for little gain.
- **Graceful fallback**: ioredis runs with `enableOfflineQueue: false` and
  `maxRetriesPerRequest: 1`. If Redis is down, commands fail fast, the helper returns
  `BYPASS`, and the request goes straight to MongoDB. Setting `REDIS_URL=` (empty) turns
  caching off entirely. `/api/v1/health` then reports `"status": "degraded"`. Both
  behaviours have tests.

## Real-time listening rooms

### Events

| Direction       | Event               | Payload / ack                                                                                                   |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| client → server | `room:join`         | `{ code }` → `{ ok, state, participants, messages }`                                                            |
| client → server | `room:leave`        | –                                                                                                               |
| client → server | `chat:send`         | `{ text }` (1–500 chars, 5 msgs / 5 s) → `{ ok, message }`                                                      |
| client → server | `playback:action`   | `{ type: play\|pause\|seek\|setTrack\|next\|prev\|queueAdd\|queueRemove\|ended, … }` → `{ ok, applied, state }` |
| client → server | `room:settings`     | `{ controlMode }` (host only)                                                                                   |
| client → server | `time:sync`         | → `{ serverTime }`                                                                                              |
| server → room   | `room:state`        | full room state (queue + playback + `serverTime`)                                                               |
| server → room   | `room:participants` | `{ participants: [{ id, username }] }`                                                                          |
| server → room   | `chat:message`      | `{ id, userId, username, text, createdAt }`                                                                     |
| server → room   | `room:closed`       | `{ code, reason }`                                                                                              |

Every payload is validated with zod (a discriminated union for playback actions). Each
socket is in at most one Socket.IO room (`room:<CODE>`), and every broadcast is
`io.to('room:<CODE>')`, so events never leak to other rooms. A test checks this explicitly.
Handlers always reply through an ack, `{ ok: false, error: { code, message } }` on failure,
so the client can show a precise error.

### Synchronisation model

The room stores `playback = { trackId, isPlaying, positionSec, updatedAt, version }`.

- The server is the source of truth. A client never trusts another client's clock; it
  extrapolates `position = positionSec + (serverNow − updatedAt)` while playing.
- **Clock offset**: on connect, the client sends three `time:sync` pings and keeps the sample
  with the lowest round-trip time. Its offset is `serverTime − (sentAt + rtt/2)`, the same
  idea as NTP.
- **Drift correction**: on every state update, and every 4 s while playing, the client compares
  its `<audio>.currentTime` to the expected position and seeks only if they differ by more
  than 0.75 s. This avoids audible stutter from constant tiny seeks.
- **Track end**: any participant may report `ended`, but only with the `version` it was
  playing. The server ignores stale or duplicate reports, so a track ending on five devices
  advances the queue exactly once. A test covers this race.
- **Concurrency**: updates use optimistic concurrency on `playback.version`
  (`findOneAndUpdate` filtered by version, with up to 3 retries).
- **Reconnects**: Socket.IO reconnects automatically. On every `connect` the client re-runs
  clock sync and `room:join` and receives a complete fresh state, so there's no replay or
  missed-event bookkeeping. Presence is reference-counted per user across sockets, so a
  second tab doesn't double-count and closing one tab doesn't mark you as gone.
- **Autoplay policy**: browsers may reject `audio.play()` until the user interacts with the
  page. The player detects `NotAllowedError` and shows a "Click to enable audio" button.

**Limits:** accuracy depends on network jitter, device audio latency and buffering. In
local testing (two Chromium clients on one machine), measured drift was about 10–25 ms.
Across real networks, expect anything from tens to a few hundred milliseconds. This is
"listening together", not sample-accurate sync.

### Scaling beyond one process

Presence and the chat rate limiter live in process memory, so the app is designed for one
API instance. To scale out you would need to:

1. add `@socket.io/redis-adapter` so broadcasts reach sockets on every instance,
2. move presence into Redis (a hash per room plus socket heartbeats), and
3. use sticky sessions at the load balancer for Socket.IO's HTTP long-polling fallback.

Room state itself already lives in MongoDB, so it needs no change.

## Frontend layout (`client/src`)

| Path          | Responsibility                                                                         |
| ------------- | -------------------------------------------------------------------------------------- |
| `api/`        | `http()` fetch wrapper (cookies, CSRF header, typed `ApiError`) and endpoint functions |
| `context/`    | Auth, toasts, library (liked ids and playlists shared by every track row)              |
| `player/`     | `PlayerContext` owns the app's single `<audio>` element; `PlayerBar`, `QueuePanel`     |
| `rooms/`      | `useRoom` (socket lifecycle, sync, controller), chat, track picker                     |
| `pages/`      | Route components                                                                       |
| `components/` | Reusable, accessible building blocks (Menu, Dialog, Field, TrackList…)                 |
| `lib/`        | Pure helpers, including the sync maths (unit tested)                                   |

The player has two modes:

- **Local**: your own queue.
- **Remote**: a room drives the same `<audio>` element through `syncTo()`, and player-bar
  controls are forwarded to the room as socket actions. They're disabled when you lack
  control.

This keeps one audio pipeline and one persistent player UI across the whole app.

Accessibility measures:

- Semantic landmarks and a skip link.
- Every icon button has an `aria-label`; toggles use `aria-pressed`.
- The menu follows the WAI-ARIA menu-button pattern (arrow keys, Escape).
- Dialogs use the native `<dialog>`, which provides focus trapping.
- Toasts and chat are live regions.
- Form errors are linked with `aria-describedby`.
- Global keyboard shortcuts are ignored while typing.
- Animations respect `prefers-reduced-motion`.

## Audio and licensing

`server/scripts/synth.js` generates every demo track from code: oscillators, noise drums, a
seeded PRNG, and a hand-written WAV encoder. The audio is therefore original to this
repository and released as CC0. Nothing is downloaded or sampled. Files are 22.05 kHz mono
16-bit WAV, about 2.6 MB per minute and about 47 MB for all 18 tracks. They're generated at
seed time and git-ignored.

Streaming uses `res.sendFile` with HTTP Range support. The browser fetches byte ranges,
which makes seeking instant and avoids downloading whole files. The `Track` model also
supports an `audioUrl` for externally hosted, properly licensed audio; the stream endpoint
redirects to it.

## Key tradeoffs

| Decision                        | Why                                                        | Cost / alternative                                                    |
| ------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| JWT in httpOnly cookie          | Stateless, works for REST and WebSocket, XSS can't read it | Needs a denylist for logout; server sessions in Redis would also work |
| Single `<audio>` element        | One pipeline; the player persists across routes            | Room mode replaces the local queue (not restored after leaving)       |
| Offset pagination for catalogue | Simple, supports page numbers                              | Deep pages get slower; switch to keyset at scale                      |
| Text index + regex fallback     | Zero extra infrastructure                                  | Fallback scans; use a search engine at scale                          |
| Namespace-versioned cache keys  | O(1) invalidation, no key scanning                         | Old keys linger until TTL (bounded memory with LRU)                   |
| In-memory presence              | Simple and fast for one instance                           | Needs Redis + adapter to scale horizontally                           |
| Generated WAV audio             | Legally clean, offline, deterministic                      | Synth music, larger than MP3                                          |
