import { Link } from 'react-router';
import { EmptyState } from '../components/States.jsx';

export function NotFoundPage() {
  return (
    <EmptyState
      icon="music"
      title="Page not found"
      action={
        <Link className="btn btn--secondary" to="/">
          Back to browsing
        </Link>
      }
    >
      This page skipped a beat. The link may be broken.
    </EmptyState>
  );
}
