import request from 'supertest';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { closeDb } from '../src/db/index.js';

export const CREDENTIALS = {
  superAdmin: { email: 'superadmin@itwf.dev', password: 'Passw0rd!' },
  admin:      { email: 'admin@itwf.dev',      password: 'Passw0rd!' },
  itMember:   { email: 'itmember@itwf.dev',   password: 'Passw0rd!' },
  itMember2:  { email: 'itmember2@itwf.dev',  password: 'Passw0rd!' },
  client:     { email: 'client@itwf.dev',     password: 'Passw0rd!' },
};

export function freshApp() {
  closeDb();
  migrate({ fresh: true, silent: true });

  const originalLog = console.log;
  console.log = () => {};
  try {
    seed();
  } finally {
    console.log = originalLog;
  }

  return createApp();
}

export async function login(app, who) {
  const credentials = CREDENTIALS[who] ?? who;
  const res = await request(app).post('/api/auth/login').send(credentials);
  if (res.status !== 200) {
    throw new Error(`login failed for ${credentials.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.accessToken,
    user: res.body.user,
    cookie: res.headers['set-cookie'],
  };
}

export function as(app, token) {
  const wrap = (method) => (url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
  return { get: wrap('get'), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), delete: wrap('delete') };
}

export async function seededProject(app, token, code = 'NWL-ERP-2026') {
  const res = await as(app, token).get('/api/projects?limit=50');
  const project = res.body.items.find((p) => p.code === code);
  if (!project) throw new Error(`seeded project ${code} not found`);
  return project;
}
