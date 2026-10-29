import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { roomsApi } from '../api/index.js';
import { Cover } from '../components/Cover.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { Toggle } from '../components/Field.jsx';
import { Icon } from '../components/Icon.jsx';
import { EmptyState, ErrorState, PageLoader, Spinner } from '../components/States.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatTime } from '../lib/format.js';
import { SeekBar } from '../player/PlayerBar.jsx';
import { usePlayer } from '../player/PlayerContext.jsx';
import { RoomChat } from '../rooms/RoomChat.jsx';
import { TrackPicker } from '../rooms/TrackPicker.jsx';
import { useRoom } from '../rooms/useRoom.js';

function ConnectionBanner({ conn, rttMs }) {
  if (conn === 'reconnecting') {
    return (
      <p className="banner banner--warn" role="status">
        <Spinner size={14} label="Reconnecting" /> Connection lost. Reconnecting… Playback will
        re-sync when you’re back.
      </p>
    );
  }
  if (conn === 'joined' && rttMs !== null) {
    return (
      <p
        className="muted small sync-info"
        title="Round-trip time to the server, used to align playback"
      >
        <span className="live-dot" aria-hidden="true" /> Live · sync latency ~{Math.round(rttMs)} ms
      </p>
    );
  }
  return null;
}

export function RoomPage() {
  const { code: rawCode } = useParams();
  const code = rawCode.toUpperCase();
  const navigate = useNavigate();
  const toast = useToast();
  const player = usePlayer();
  const r = useRoom(code);
  const [confirmClose, setConfirmClose] = useState(false);

  if (r.conn === 'notfound') {
    return (
      <EmptyState
        icon="radio"
        title={`Room ${code} doesn’t exist`}
        action={
          <Link className="btn btn--secondary" to="/rooms">
            See all rooms
          </Link>
        }
      >
        Check the code, or the host may have closed it.
      </EmptyState>
    );
  }
  if (r.conn === 'closed') {
    return (
      <EmptyState
        icon="radio"
        title="This room has closed"
        action={
          <Link className="btn btn--secondary" to="/rooms">
            Find another room
          </Link>
        }
      >
        {r.error?.message}
      </EmptyState>
    );
  }
  if (r.conn === 'error') return <ErrorState error={r.error} title="Couldn’t join the room" />;
  if (!r.room) return <PageLoader label="Joining room" />;

  const { room } = r;
  const track = room.playback.track;
  const isPlaying = room.playback.isPlaying;
  const disconnected = r.conn !== 'joined';
  const queueIds = new Set(room.queue.map((t) => t.id));
  const controlsDisabled = !r.canControl || disconnected;

  const copyInvite = async () => {
    const url = `${window.location.origin}/rooms/${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Invite link copied');
    } catch {
      toast.info(`Share this code: ${room.code}`);
    }
  };

  const closeRoom = async () => {
    try {
      await roomsApi.remove(room.code);
      toast.success('Room closed');
      navigate('/rooms');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="page room">
      <header className="page__header page__header--row">
        <div>
          <p className="eyebrow">
            <Icon name={room.isPublic ? 'globe' : 'lock'} size={14} />{' '}
            {room.isPublic ? 'Public' : 'Private'} room · code{' '}
            <strong className="mono">{room.code}</strong>
          </p>
          <h1>{room.name}</h1>
          <ConnectionBanner conn={r.conn} rttMs={r.rttMs} />
        </div>
        <div className="room__header-actions">
          <button className="btn btn--secondary btn--sm" onClick={copyInvite}>
            <Icon name="copy" size={16} /> Invite
          </button>
          {r.isHost && (
            <button className="btn btn--danger-ghost btn--sm" onClick={() => setConfirmClose(true)}>
              Close room
            </button>
          )}
        </div>
      </header>

      <div className="room__grid">
        <div className="room__main">
          <section className="panel now-playing" aria-labelledby="np-heading">
            <h2 id="np-heading" className="sr-only">
              Now playing
            </h2>
            {track ? (
              <>
                <Cover
                  hue={track.coverHue}
                  size={120}
                  rounded={14}
                  className={isPlaying ? 'is-spinning' : ''}
                />
                <div className="now-playing__info">
                  <p className="eyebrow">{isPlaying ? 'Now playing' : 'Paused'}</p>
                  <p className="now-playing__title">{track.title}</p>
                  <p className="muted">
                    {track.artist} · {track.album}
                  </p>
                  {player.blocked && (
                    <button className="btn btn--primary btn--sm" onClick={player.unlock}>
                      <Icon name="volume" size={16} /> Click to enable audio
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="muted">
                {r.canControl
                  ? 'Search below and pick a track to start the session.'
                  : `Waiting for ${room.hostName} to pick a track…`}
              </p>
            )}
            <div
              className="now-playing__controls"
              title={r.canControl ? undefined : 'Only the host can control playback'}
            >
              <button
                className="icon-btn"
                disabled={controlsDisabled || !track}
                onClick={() => r.sendAction({ type: 'prev' })}
                aria-label="Previous track"
              >
                <Icon name="prev" />
              </button>
              <button
                className="play-btn"
                disabled={controlsDisabled || !track}
                onClick={() =>
                  r.sendAction({
                    type: isPlaying ? 'pause' : 'play',
                    positionSec: player.getPosition(),
                  })
                }
                aria-label={isPlaying ? 'Pause for everyone' : 'Play for everyone'}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={22} />
              </button>
              <button
                className="icon-btn"
                disabled={controlsDisabled || !track}
                onClick={() => r.sendAction({ type: 'next' })}
                aria-label="Next track"
              >
                <Icon name="next" />
              </button>
            </div>
            {track && <SeekBar disabled={controlsDisabled} label="Seek room playback" />}
            {!r.canControl && (
              <p className="muted small">
                The host controls playback in this room. You’ll hear what they hear.
              </p>
            )}
          </section>

          <section className="panel" aria-labelledby="queue-heading">
            <h2 id="queue-heading" className="panel__title">
              Room queue <span className="muted">· {room.queue.length}</span>
            </h2>
            {room.queue.length === 0 ? (
              <p className="muted">The queue is empty.</p>
            ) : (
              <ol className="mini-list">
                {room.queue.map((t, i) => {
                  const current = t.id === track?.id;
                  return (
                    <li key={t.id} className={`mini-row ${current ? 'is-current' : ''}`}>
                      <span className="mini-row__num">
                        {current && isPlaying ? <span className="eq" /> : i + 1}
                      </span>
                      <Cover hue={t.coverHue} size={36} rounded={6} />
                      <span className="mini-row__meta">
                        <span className="mini-row__title">{t.title}</span>
                        <span className="muted small">
                          {t.artist} · {formatTime(t.durationSec)}
                        </span>
                      </span>
                      {r.canControl && !current && (
                        <>
                          <button
                            className="icon-btn icon-btn--sm"
                            disabled={disconnected}
                            onClick={() => r.sendAction({ type: 'setTrack', trackId: t.id })}
                            aria-label={`Play ${t.title} now`}
                          >
                            <Icon name="play" size={16} />
                          </button>
                          <button
                            className="icon-btn icon-btn--sm"
                            disabled={disconnected}
                            onClick={() => r.sendAction({ type: 'queueRemove', trackId: t.id })}
                            aria-label={`Remove ${t.title} from room queue`}
                          >
                            <Icon name="x" size={16} />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {r.canControl && (
            <TrackPicker
              queueIds={queueIds}
              onAdd={async (t) =>
                (await r.sendAction({ type: 'queueAdd', trackId: t.id })).ok &&
                toast.success(`Queued “${t.title}”`)
              }
              onPlayNow={(t) => r.sendAction({ type: 'setTrack', trackId: t.id })}
            />
          )}
        </div>

        <div className="room__side">
          <section className="panel" aria-labelledby="people-heading">
            <h2 id="people-heading" className="panel__title">
              Listening now <span className="muted">· {r.participants.length}</span>
            </h2>
            <ul className="people">
              {r.participants.map((p) => (
                <li key={p.id} className="person">
                  <span className="avatar" aria-hidden="true">
                    {p.username[0].toUpperCase()}
                  </span>
                  <span>{p.username}</span>
                  {p.id === room.hostId && (
                    <span className="pill pill--host">
                      <Icon name="crown" size={12} /> Host
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {r.isHost && (
              <Toggle
                label="Let everyone control playback"
                checked={room.controlMode === 'everyone'}
                onChange={(on) => r.setControlMode(on ? 'everyone' : 'host')}
              />
            )}
          </section>
          <RoomChat
            messages={r.messages}
            onSend={r.sendMessage}
            hasOlder={r.hasOlder}
            onLoadOlder={r.loadOlder}
            disabled={disconnected}
          />
        </div>
      </div>

      <Dialog open={confirmClose} onClose={() => setConfirmClose(false)} title="Close this room?">
        <p>Everyone will be disconnected and the chat history will be deleted.</p>
        <div className="form__actions">
          <button className="btn btn--ghost" onClick={() => setConfirmClose(false)}>
            Cancel
          </button>
          <button className="btn btn--danger" onClick={closeRoom}>
            Close room
          </button>
        </div>
      </Dialog>
    </div>
  );
}
