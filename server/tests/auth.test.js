import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { freshApp, login, as } from './helpers.js';

describe('Auth · JWT, refresh rotation, httpOnly cookie', () => {
  let app;
  beforeAll(() => { app = freshApp(); });

  it('rejects bad credentials without revealing whether the email exists', async () => {
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'admin@itwf.dev', password: 'nope' });
    const noSuchUser = await request(app).post('/api/auth/login').send({ email: 'ghost@itwf.dev', password: 'nope' });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(noSuchUser.body.error.message);
  });

  it('login returns an access token in the body and the refresh token as an httpOnly cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@itwf.dev', password: 'Passw0rd!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.permissions.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain('itwf_refresh');

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('itwf_refresh='));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth');
  });

  it('an expired or invalid access token is reported with a distinguishable code', async () => {
    const res = await as(app, 'not-a-real-token').get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('refresh rotates the token: the old cookie stops working', async () => {
    const first = await request(app).post('/api/auth/login').send({ email: 'admin@itwf.dev', password: 'Passw0rd!' });
    const firstCookie = first.headers['set-cookie'];

    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));

    const rotatedCookie = refreshed.headers['set-cookie'];
    expect(rotatedCookie[0]).not.toBe(firstCookie[0]);

    const replay = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_REUSED');

    const afterBreach = await request(app).post('/api/auth/refresh').set('Cookie', rotatedCookie);
    expect(afterBreach.status).toBe(401);
  });

  it('logout revokes the refresh token and clears the cookie', async () => {
    const session = await login(app, 'admin');
    const logout = await as(app, session.token).post('/api/auth/logout').set('Cookie', session.cookie);
    expect(logout.status).toBe(200);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', session.cookie);
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me rehydrates the session after a page reload', async () => {
    const session = await login(app, 'itMember');
    const res = await as(app, session.token).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('itmember@itwf.dev');
    expect(res.body.user.role.key).toBe('IT_MEMBER');
    expect(res.body.user.permissions).toContainEqual({ module: 'stages', action: 'update_status' });
  });

  it('refresh without a cookie fails cleanly', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_MISSING');
  });
});

describe('Audit log · append-only and admin-only', () => {
  let app;
  beforeAll(() => { app = freshApp(); });

  it('is paginated and filterable for an admin', async () => {
    const admin = await login(app, 'admin');
    const res = await as(app, admin.token).get('/api/audit?limit=5');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 5 });
    expect(res.body.items[0]).toHaveProperty('actorEmail');
    expect(res.body.items[0]).toHaveProperty('entityType');
  });

  it('exposes no write route', async () => {
    const admin = await login(app, 'admin');
    expect((await as(app, admin.token).post('/api/audit').send({ action: 'FAKE' })).status).toBe(404);
    expect((await as(app, admin.token).delete('/api/audit/1')).status).toBe(404);
  });

  it('is rejected at the database level even if a write is attempted directly', async () => {
    const { getDb } = await import('../src/db/index.js');
    const db = getDb();
    expect(() => db.prepare('UPDATE audit_logs SET summary = ? WHERE id = 1').run('tampered')).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM audit_logs WHERE id = 1').run()).toThrow(/append-only/);
  });
});
