// Thin fetch wrapper: JSON in/out, cookies included, and a typed error that carries
// the server's { error: { code, message, details } } payload.
export const API_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/v1`;

export class ApiError extends Error {
  constructor(status, { code = 'ERROR', message = 'Request failed', details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Map validation details to { field: message } for forms. */
  fieldErrors() {
    return Object.fromEntries((this.details ?? []).map((d) => [d.path, d.message]));
  }
}

export async function http(path, { method = 'GET', body, query, signal } = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  let res;
  try {
    res = await fetch(url, {
      method,
      signal,
      credentials: 'include',
      headers: {
        // Required by the server's CSRF check on state-changing requests.
        'X-Requested-With': 'streamify',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, {
      code: 'NETWORK',
      message: 'Cannot reach the server. Check your connection.',
    });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error);
  return data;
}
