import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, client, signUp, useTestDb } from './helpers.js';

useTestDb();

describe('auth', () => {
  it('registers a user, sets an httpOnly cookie and never returns the password hash', async () => {
    const c = client();
    const res = await c
      .post('/api/v1/auth/register')
      .send({ username: 'alice', email: 'Alice@Example.com', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: expect.any(String), username: 'alice', email: 'alice@example.com' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|token/i);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^streamify_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await c.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('alice');
  });

  it('rejects duplicate emails and usernames (case-insensitive)', async () => {
    await signUp(client(), { username: 'bob', email: 'bob@test.local' });
    const dupEmail = await client()
      .post('/api/v1/auth/register')
      .send({ username: 'bobby', email: 'BOB@test.local', password: 'secret123' });
    expect(dupEmail.status).toBe(409);
    const dupName = await client()
      .post('/api/v1/auth/register')
      .send({ username: 'BOB', email: 'other@test.local', password: 'secret123' });
    expect(dupName.status).toBe(409);
    expect(dupName.body.error.message).toMatch(/username/i);
  });

  it('validates registration input with field-level details', async () => {
    const res = await client()
      .post('/api/v1/auth/register')
      .send({ username: 'x', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['username', 'email', 'password']));
  });

  it('logs in with correct credentials and rejects wrong ones with a generic message', async () => {
    await signUp(client(), { email: 'carol@test.local', password: 'password123' });
    const ok = await client()
      .post('/api/v1/auth/login')
      .send({ email: 'carol@test.local', password: 'password123' });
    expect(ok.status).toBe(200);

    const wrong = await client()
      .post('/api/v1/auth/login')
      .send({ email: 'carol@test.local', password: 'wrongpass1' });
    const unknown = await client()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.local', password: 'wrongpass1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('protects /me and revokes the token on logout', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);

    const c = await signUp();
    const stolenCookie = c.cookie;
    expect((await c.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await c.get('/api/v1/auth/me')).status).toBe(401);
    // Re-using the old token after logout must fail too (server-side revocation).
    const replay = await request(app).get('/api/v1/auth/me').set('Cookie', stolenCookie);
    expect(replay.status).toBe(401);
  });

  it('rejects tampered tokens', async () => {
    const c = await signUp();
    const tampered = `${c.cookie.slice(0, -4)}AAAA`;
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', tampered);
    expect(res.status).toBe(401);
  });

  it('requires the CSRF header on state-changing requests', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
