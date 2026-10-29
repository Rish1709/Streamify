import { useEffect, useRef } from 'react';
import { Cover } from '../components/Cover.jsx';
import { Icon } from '../components/Icon.jsx';
import { formatTime } from '../lib/format.js';
import { usePlayer } from './PlayerContext.jsx';

export function QueuePanel({ onClose }) {
  const { queue, index, jumpTo, removeFromQueue, clearQueue } = usePlayer();
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const upcoming = queue.slice(index + 1);
  return (
    <aside id="queue-panel" className="queue" aria-label="Play queue" tabIndex={-1} ref={ref}>
      <header className="queue__header">
        <h2>Queue</h2>
        <div>
          {upcoming.length > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={clearQueue}>
              Clear upcoming
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Close queue">
            <Icon name="x" />
          </button>
        </div>
      </header>
      {queue.length === 0 ? (
        <p className="muted queue__empty">
          Your queue is empty. Play a track or use “Add to queue”.
        </p>
      ) : (
        <ol className="queue__list">
          {queue.map((t, i) => (
            <li
              key={`${t.id}-${i}`}
              className={`queue__item ${i === index ? 'is-current' : ''} ${i < index ? 'is-past' : ''}`}
            >
              <button
                className="queue__jump"
                onClick={() => jumpTo(i)}
                aria-current={i === index ? 'true' : undefined}
              >
                <Cover hue={t.coverHue} size={36} rounded={6} />
                <span className="queue__meta">
                  <span className="queue__title">{t.title}</span>
                  <span className="muted">{t.artist}</span>
                </span>
                <span className="muted">{formatTime(t.durationSec)}</span>
              </button>
              {i !== index && (
                <button
                  className="icon-btn icon-btn--sm"
                  onClick={() => removeFromQueue(i)}
                  aria-label={`Remove ${t.title} from queue`}
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="queue__hint muted">
        Shortcuts: <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> seek 5s ·{' '}
        <kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd> prev/next · <kbd>M</kbd> mute
      </p>
    </aside>
  );
}
