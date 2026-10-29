import { useState } from 'react';
import { Link } from 'react-router';
import { Cover } from '../components/Cover.jsx';
import { Icon } from '../components/Icon.jsx';
import { Spinner } from '../components/States.jsx';
import { LikeButton } from '../components/TrackList.jsx';
import { formatTime } from '../lib/format.js';
import { usePlayer } from './PlayerContext.jsx';
import { QueuePanel } from './QueuePanel.jsx';

export function SeekBar({ disabled, label = 'Seek' }) {
  const { time, seek, current } = usePlayer();
  const [dragValue, setDragValue] = useState(null);
  const duration = time.duration || current?.durationSec || 0;
  const value = dragValue ?? Math.min(time.current, duration);
  const pct = duration ? (value / duration) * 100 : 0;
  const bufferedPct = duration ? Math.min(100, (time.buffered / duration) * 100) : 0;
  const commit = () => {
    if (dragValue !== null) seek(dragValue);
    setDragValue(null);
  };
  return (
    <div className="seek">
      <span className="seek__time">{formatTime(value)}</span>
      <input
        type="range"
        className="range"
        min={0}
        max={duration || 1}
        step={0.5}
        value={value}
        disabled={disabled || !current}
        aria-label={label}
        aria-valuetext={`${formatTime(value)} of ${formatTime(duration)}`}
        style={{ '--pct': `${pct}%`, '--buf': `${bufferedPct}%` }}
        onChange={(e) => setDragValue(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="seek__time">{formatTime(duration)}</span>
    </div>
  );
}

export function PlayerBar() {
  const p = usePlayer();
  const [queueOpen, setQueueOpen] = useState(false);
  const { current, status, remote } = p;
  const canControl = !remote || remote.canControl;
  const controlHint = canControl ? undefined : 'Only the host can control playback in this room';
  const isPlaying = status === 'playing';

  return (
    <section className={`player ${current ? '' : 'player--empty'}`} aria-label="Player">
      <div className="player__track">
        {current ? (
          <>
            <Cover hue={current.coverHue} size={52} />
            <div className="player__meta">
              <span className="player__title">{current.title}</span>
              <span className="player__artist">{current.artist}</span>
              {remote && (
                <Link to={`/rooms/${remote.code}`} className="live-badge">
                  <span className="live-dot" aria-hidden="true" /> Live in {remote.roomName}
                </Link>
              )}
            </div>
            <LikeButton track={current} />
          </>
        ) : (
          <p className="muted player__idle">
            {remote
              ? `Waiting for the host to pick a track in ${remote.roomName}`
              : 'Pick a track to start listening'}
          </p>
        )}
      </div>

      <div className="player__center">
        <div className="player__controls" title={controlHint}>
          <button
            className="icon-btn"
            onClick={p.prev}
            disabled={!current || !canControl}
            aria-label="Previous track"
          >
            <Icon name="prev" />
          </button>
          <button
            className="play-btn"
            onClick={p.toggle}
            disabled={!current || !canControl || status === 'error'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {status === 'loading' ? (
              <Spinner label="Buffering" />
            ) : (
              <Icon name={isPlaying ? 'pause' : 'play'} size={22} />
            )}
          </button>
          <button
            className="icon-btn"
            onClick={p.next}
            disabled={!current || !canControl}
            aria-label="Next track"
          >
            <Icon name="next" />
          </button>
        </div>
        {status === 'error' ? (
          <div className="player__error" role="alert">
            <Icon name="alert" size={16} /> {p.error}
            {!remote && (
              <button className="btn btn--ghost btn--sm" onClick={p.retry}>
                Retry
              </button>
            )}
          </div>
        ) : p.blocked ? (
          <button className="btn btn--primary btn--sm" onClick={p.unlock}>
            Your browser paused autoplay. Click to start listening
          </button>
        ) : (
          <SeekBar disabled={!canControl} />
        )}
      </div>

      <div className="player__extras">
        <button
          className="icon-btn"
          onClick={p.toggleMute}
          aria-label={p.muted ? 'Unmute' : 'Mute'}
          aria-pressed={p.muted}
        >
          <Icon name={p.muted || p.volume === 0 ? 'mute' : 'volume'} />
        </button>
        <input
          type="range"
          className="range range--volume"
          min={0}
          max={1}
          step={0.01}
          value={p.muted ? 0 : p.volume}
          onChange={(e) => p.setVolume(Number(e.target.value))}
          aria-label="Volume"
          aria-valuetext={`${Math.round((p.muted ? 0 : p.volume) * 100)}%`}
          style={{ '--pct': `${(p.muted ? 0 : p.volume) * 100}%` }}
        />
        {!remote && (
          <button
            className={`icon-btn ${queueOpen ? 'is-active' : ''}`}
            onClick={() => setQueueOpen((o) => !o)}
            aria-label="Queue"
            aria-expanded={queueOpen}
            aria-controls="queue-panel"
          >
            <Icon name="queue" />
          </button>
        )}
      </div>
      {queueOpen && !remote && <QueuePanel onClose={() => setQueueOpen(false)} />}
    </section>
  );
}
