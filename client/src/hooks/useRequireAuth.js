import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/** Wraps an action so signed-out users are sent to /login (and back afterwards). */
export function useRequireAuth() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  return useCallback(
    (fn, message = 'Log in to do that') =>
      (...args) => {
        if (!user) {
          toast.info(message);
          navigate('/login', { state: { from: location } });
          return;
        }
        return fn(...args);
      },
    [user, navigate, location, toast],
  );
}
