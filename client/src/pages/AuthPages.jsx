import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Logo } from '../components/AppShell.jsx';
import { Field } from '../components/Field.jsx';
import { Spinner } from '../components/States.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

function useAuthForm(initial, submit) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const onChange = (e) => {
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
    setErrors((er) => ({ ...er, [e.target.name]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await submit(values);
      navigate(location.state?.from?.pathname ?? '/', { replace: true });
    } catch (err) {
      const fields = err.fieldErrors?.() ?? {};
      setErrors(fields);
      setFormError(Object.keys(fields).length ? 'Please fix the highlighted fields.' : err.message);
    } finally {
      setSubmitting(false);
    }
  };
  return { values, errors, formError, submitting, onChange, onSubmit };
}

function AuthLayout({ title, subtitle, children, footer }) {
  const { user, status } = useAuth();
  if (status === 'ready' && user) return <Navigate to="/" replace />;
  return (
    <div className="auth">
      <div className="auth__card">
        <Logo />
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
        <p className="auth__footer">{footer}</p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const f = useAuthForm({ email: '', password: '' }, async (v) => {
    const user = await login(v);
    toast.success(`Welcome back, ${user.username}`);
  });
  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back. Pick up where you left off."
      footer={
        <>
          New to Streamify? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <form onSubmit={f.onSubmit} noValidate className="form">
        {f.formError && (
          <p className="form__error" role="alert">
            {f.formError}
          </p>
        )}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={f.values.email}
          onChange={f.onChange}
          error={f.errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={f.values.password}
          onChange={f.onChange}
          error={f.errors.password}
        />
        <button className="btn btn--primary btn--block" disabled={f.submitting}>
          {f.submitting ? <Spinner label="Logging in" size={16} /> : 'Log in'}
        </button>
        <p className="muted small">Local demo account: demo@streamify.local / demo1234</p>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const f = useAuthForm({ username: '', email: '', password: '' }, async (v) => {
    const user = await register(v);
    toast.success(`Welcome to Streamify, ${user.username}!`);
  });
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free forever. Your playlists, your rooms."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form onSubmit={f.onSubmit} noValidate className="form">
        {f.formError && (
          <p className="form__error" role="alert">
            {f.formError}
          </p>
        )}
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          required
          minLength={3}
          maxLength={30}
          value={f.values.username}
          onChange={f.onChange}
          error={f.errors.username}
          hint="3–30 characters: letters, numbers, . _ -"
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={f.values.email}
          onChange={f.onChange}
          error={f.errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          value={f.values.password}
          onChange={f.onChange}
          error={f.errors.password}
          hint="At least 8 characters, with a letter and a number"
        />
        <button className="btn btn--primary btn--block" disabled={f.submitting}>
          {f.submitting ? <Spinner label="Creating account" size={16} /> : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
