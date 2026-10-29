import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { PageLoader } from './States.jsx';

// Client-side guard for UX only; the server enforces authentication on every request.
export function ProtectedRoute({ children }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
