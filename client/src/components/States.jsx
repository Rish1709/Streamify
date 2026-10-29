import { Icon } from './Icon.jsx';

export function Spinner({ label = 'Loading', size = 20 }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    />
  );
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="state state--center">
      <Spinner label={label} size={32} />
    </div>
  );
}

export function EmptyState({ icon = 'music', title, children, action }) {
  return (
    <div className="state">
      <div className="state__icon">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="state state--error" role="alert">
      <div className="state__icon">
        <Icon name="alert" size={28} />
      </div>
      <h3>{title}</h3>
      <p className="muted">{error?.message ?? 'Please try again.'}</p>
      {onRetry && (
        <button className="btn btn--secondary" onClick={onRetry}>
          <Icon name="refresh" size={16} /> Try again
        </button>
      )}
    </div>
  );
}

export function TrackListSkeleton({ rows = 6 }) {
  return (
    <ul className="track-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="track-row track-row--skeleton">
          <span className="skeleton" style={{ width: 20, height: 14 }} />
          <span className="skeleton" style={{ width: 44, height: 44, borderRadius: 8 }} />
          <span className="track-row__meta">
            <span className="skeleton" style={{ width: '45%', height: 14 }} />
            <span className="skeleton" style={{ width: '30%', height: 12, marginTop: 6 }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
