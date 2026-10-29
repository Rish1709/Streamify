import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../../config/env.js';
import { User } from '../../models/index.js';
import { conflict, unauthorized } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { AUTH_COOKIE, cookieOptions, revokeToken, signToken } from './token.js';

const BCRYPT_ROUNDS = config.isTest ? 4 : 12;

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Only letters, numbers, dot, dash and underscore'),
  email: z.email('Enter a valid email').trim().toLowerCase().max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters') // bcrypt input limit
    .regex(/[A-Za-z]/, 'Password needs a letter')
    .regex(/\d/, 'Password needs a number'),
});

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(72),
});

// Brute-force protection on credential endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

// Equalise timing between "unknown email" and "wrong password".
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// The JWT is only ever sent as an httpOnly cookie, never in a JSON body, so page
// JavaScript (and therefore XSS) cannot read it.
function issueSession(res, user) {
  res.cookie(AUTH_COOKIE, signToken(user._id.toString()), cookieOptions());
}

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), async (req, res) => {
  const { username, email, password } = req.valid.body;
  const existing = await User.findOne({ $or: [{ email }, { username }] })
    .collation({ locale: 'en', strength: 2 })
    .lean();
  if (existing) {
    throw conflict(existing.email === email ? 'Email is already registered' : 'Username is taken');
  }
  const user = await User.create({
    username,
    email,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
  });
  issueSession(res, user);
  res.status(201).json({ user: user.toPublic() });
});

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');
  issueSession(res, user);
  res.json({ user: user.toPublic() });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await revokeToken(req.tokenPayload);
  const { maxAge: _maxAge, ...opts } = cookieOptions();
  res.clearCookie(AUTH_COOKIE, opts);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});
