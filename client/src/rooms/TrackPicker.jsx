import { useState } from 'react';
import { tracksApi } from '../api/index.js';
import { Cover } from '../components/Cover.jsx';
import { Icon } from '../components/Icon.jsx';
import { Spinner } from '../components/States.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { formatTime } from '../lib/format.js';

/** Search the catalogue and add tracks to the room queue (controllers only). */
export function TrackPicker({ queueIds, onAdd, onPlayNow }) {
  const [q, setQ] = useState('');
  const debounced = useDebounce(q.trim(), 300);
  const results = useAsync(
    (signal) => tracksApi.list({ q: debounced, limit: 8 }, signal),
    [debounced],
  );

  return (
    <section className="panel" aria-labelledby="picker-heading">
      <h2 id="picker-heading" className="panel__title">
        Add music
      </h2>
      <div className="search search--compact">
        <Icon name="search" />
        <label htmlFor="picker-search" className="sr-only">
          Search tracks to add
        </label>
        <input
          id="picker-search"
          type="search"
          value={q}
          placeholder="Search the catalogue"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {results.loading && !results.data ? (
        <div className="state state--center">
          <Spinner />
        </div>
      ) : results.error ? (
        <p className="field__error">{results.error.message}</p>
      ) : results.data.items.length === 0 ? (
        <p className="muted">No tracks match.</p>
      ) : (
        <ul className="mini-list">
          {results.data.items.map((t) => {
            const queued = queueIds.has(t.id);
            return (
              <li key={t.id} className="mini-row">
                <Cover hue={t.coverHue} size={36} rounded={6} />
                <span className="mini-row__meta">
                  <span className="mini-row__title">{t.title}</span>
                  <span className="muted small">
                    {t.artist} · {formatTime(t.durationSec)}
                  </span>
                </span>
                <button
                  className="icon-btn icon-btn--sm"
                  onClick={() => onPlayNow(t)}
                  aria-label={`Play ${t.title} now`}
                >
                  <Icon name="play" size={16} />
                </button>
                <button
                  className="icon-btn icon-btn--sm"
                  disabled={queued}
                  onClick={() => onAdd(t)}
                  aria-label={
                    queued ? `${t.title} is already queued` : `Add ${t.title} to room queue`
                  }
                >
                  <Icon name={queued ? 'check' : 'plus'} size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
