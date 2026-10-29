import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext.jsx';
import { ToastProvider } from '../context/ToastContext.jsx';
import { LoginPage, RegisterPage } from './AuthPages.jsx';

function mockFetch(routes) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
    const path = new URL(url).pathname;
    const key = `${init.method ?? 'GET'} ${path}`;
    const [status, body] = routes[key] ?? [404, { error: { code: 'NOT_FOUND', message: 'nope' } }];
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/" element={<p>Home page</p>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('auth pages', () => {
  it('shows field-level validation errors returned by the API', async () => {
    mockFetch({
      'GET /api/v1/auth/me': [
        401,
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      ],
      'POST /api/v1/auth/register': [
        400,
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: [{ path: 'password', message: 'Password needs a number' }],
          },
        },
      ],
    });
    renderAt('/register');
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Email'), 'alice@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Password needs a number')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields.');
  });

  it('logs in, sends the CSRF header and redirects home', async () => {
    const fetchSpy = mockFetch({
      'GET /api/v1/auth/me': [401, { error: { code: 'UNAUTHORIZED', message: 'no' } }],
      'POST /api/v1/auth/login': [200, { user: { id: '1', username: 'demo', email: 'demo@x.io' } }],
    });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'demo@x.io');
    await userEvent.type(screen.getByLabelText('Password'), 'demo1234');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Home page')).toBeInTheDocument();
    const [, init] = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/auth/login'));
    expect(init.headers['X-Requested-With']).toBe('streamify');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ email: 'demo@x.io', password: 'demo1234' });
  });

  it('shows a generic error for wrong credentials', async () => {
    mockFetch({
      'GET /api/v1/auth/me': [401, { error: { code: 'UNAUTHORIZED', message: 'no' } }],
      'POST /api/v1/auth/login': [
        401,
        { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } },
      ],
    });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'demo@x.io');
    await userEvent.type(screen.getByLabelText('Password'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});
