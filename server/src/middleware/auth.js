import { User } from '../models/index.js';
import { unauthorized } from '../lib/errors.js';
import { AUTH_COOKIE, verifyToken } from '../modules/auth/token.js';

// Token comes from the httpOnly cookie (browser) or a Bearer header (API clients, tests).
export function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[AUTH_COOKIE] ?? null;
}

async function resolveUser(req) {
  const payload = await verifyToken(extractToken(req));
  if (!payload) return null;
  const user = await User.findById(payload.sub);
  if (!user) return null;
  req.user = user;
  req.tokenPayload = payload;
  return user;
}

export async function requireAuth(req, _res, next) {
  if (!(await resolveUser(req))) throw unauthorized();
  next();
}

export async function optionalAuth(req, _res, next) {
  await resolveUser(req);
  next();
}
