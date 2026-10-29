import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { tracksApi } from '../api/index.js';
import { Icon } from '../components/Icon.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { EmptyState, ErrorState, TrackListSkeleton } from '../components/States.jsx';
import { TrackList } from '../components/TrackList.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { plural } from '../lib/format.js';

const PAGE_SIZE = 12;
const SORTS = [
  { value: '', label: 'Best match / newest' },
  { value: 'popular', label: 'Most played' },
  { value: 'title', label: 'Title A–Z' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function BrowsePage() {
  const { user } = useAuth();
  // Filters live in the URL so searches are shareable and survive refresh/back.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const genre = params.get('genre') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number(params.get('page') ?? 1) || 1;
  const [input, setInput] = useState(q);
  const debounced = useDebounce(input, 300);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page'); // new filter -> back to page 1
    setParams(next, { replace: 'q' in changes });
  };

  useEffect(() => {
    if (debounced.trim() !== q) update({ q: debounced.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const genres = useAsync(() => tracksApi.genres(), []);
  const tracks = useAsync(
    (signal) => tracksApi.list({ q, genre, sort, page, limit: PAGE_SIZE }, signal),
    [q, genre, sort, page],
  );

  return (
    <div className="page">
      <header className="page__header">
        <h1>{user ? `${greeting()}, ${user.username}` : 'Discover music'}</h1>
        <p className="muted">
          Browse the catalogue, build playlists, and listen together in rooms.
        </p>
      </header>

      <div className="toolbar" role="search">
        <div className="search">
          <Icon name="search" />
          <label htmlFor="search" className="sr-only">
            Search tracks, artists, albums or tags
          </label>
          <input
            id="search"
            type="search"
            placeholder="Search tracks, artists, albums, tags…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </div>
        <label className="select">
          <span className="sr-only">Sort by</span>
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chips" role="group" aria-label="Filter by genre">
        <button
          className={`chip ${genre ? '' : 'is-active'}`}
          aria-pressed={!genre}
          onClick={() => update({ genre: '' })}
        >
          All
        </button>
        {genres.data?.items.map((g) => (
          <button
            key={g.genre}
            className={`chip ${genre === g.genre ? 'is-active' : ''}`}
            aria-pressed={genre === g.genre}
            onClick={() => update({ genre: genre === g.genre ? '' : g.genre })}
          >
            {g.genre} <span className="chip__count">{g.count}</span>
          </button>
        ))}
      </div>

      <section aria-labelledby="results-heading" aria-busy={tracks.loading}>
        <h2 id="results-heading" className="section-title">
          {q
            ? `Results for “${q}”`
            : genre
              ? `${genre[0].toUpperCase()}${genre.slice(1)}`
              : 'All tracks'}
          {tracks.data && (
            <span className="muted"> · {plural(tracks.data.pagination.total, 'track')}</span>
          )}
        </h2>
        {tracks.error ? (
          <ErrorState
            error={tracks.error}
            onRetry={tracks.reload}
            title="Couldn’t load the catalogue"
          />
        ) : tracks.loading && !tracks.data ? (
          <TrackListSkeleton />
        ) : tracks.data.items.length === 0 ? (
          <EmptyState icon="search" title="No tracks found">
            {q
              ? `Nothing matches “${q}”. Try another word or clear the filters.`
              : 'The catalogue is empty. Run the seed script.'}
          </EmptyState>
        ) : (
          <>
            <TrackList
              tracks={tracks.data.items}
              startIndex={(page - 1) * PAGE_SIZE}
              label="Search results"
            />
            <Pagination
              pagination={tracks.data.pagination}
              onChange={(p) => update({ page: String(p) })}
            />
          </>
        )}
      </section>
    </div>
  );
}
