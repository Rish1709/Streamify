import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defence in depth on top of SameSite=Lax cookies: state-changing requests must send a
// custom header. Browsers cannot add custom headers cross-origin without a CORS
// preflight, and the CORS policy only allows our own client origin(s).
export function requireCsrfHeader(req, _res, next) {
  if (SAFE_METHODS.has(req.method) || req.get('x-requested-with') === 'streamify') return next();
  next(new AppError(403, 'CSRF_HEADER_MISSING', 'Missing X-Requested-With header'));
}
