import { Icon } from './Icon.jsx';

/** Prev/next pagination with a page indicator. `pagination` is the API's page meta. */
export function Pagination({ pagination, onChange, label = 'Pagination' }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, hasPrev, hasNext } = pagination;
  return (
    <nav className="pagination" aria-label={label}>
      <button className="btn btn--ghost" disabled={!hasPrev} onClick={() => onChange(page - 1)}>
        <Icon name="left" size={16} /> Previous
      </button>
      <span className="pagination__info" aria-current="page">
        Page {page} of {totalPages}
      </span>
      <button className="btn btn--ghost" disabled={!hasNext} onClick={() => onChange(page + 1)}>
        Next <Icon name="right" size={16} />
      </button>
    </nav>
  );
}
