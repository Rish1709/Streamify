import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { withCache } from '../../lib/cache.js';

export const AUTH_COOKIE = 'streamify_token';

export function signToken(userId) {
  const jti = crypto.randomUUID();
  return jwt.sign({ sub: userId, jti }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.JWT_EXPIRES_IN_SEC,
  });
}

export const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax',
  path: '/',
  maxAge: config.JWT_EXPIRES_IN_SEC * 1000,
});

// Logout denylist: JWTs are stateless, so logging out records the token id until it
// would have expired anyway. Redis is used when available (shared across instances);
// otherwise an in-process map gives the same behaviour for a single server.
const localDenylist = new Map();

export async function revokeToken(payload) {
  const ttl = Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
  localDenylist.set(payload.jti, payload.exp * 1000);
  await withCache((c) => c.set(`auth:revoked:${payload.jti}`, '1', 'EX', ttl), null);
}

async function isRevoked(jti) {
  const localExp = localDenylist.get(jti);
  if (localExp) {
    if (localExp > Date.now()) return true;
    localDenylist.delete(jti);
  }
  return (await withCache((c) => c.exists(`auth:revoked:${jti}`), 0)) === 1;
}

/** Returns the verified payload or null. Never throws. */
export async function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload.sub || !payload.jti) return null;
    if (await isRevoked(payload.jti)) return null;
    return payload;
  } catch {
    return null;
  }
}
