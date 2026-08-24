import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { freshApp, login, as } from './helpers.js';

describe('Public BRD tracking (no login)', () => {
  let app;
  beforeAll(() => { app = freshApp(); });

  it('returns the project for a valid BRD with no authentication at all', async () => {
    const res = await request(app).get('/api/public/track?brd=BRD-2026-0042');
    expect(res.status).toBe(200);
    expect(res.body.project.name).toBe('Northwind Customer Portal');
    expect(res.body.project.owner).toBeTruthy();
    expect(res.body.progress).toHaveProperty('percentComplete');
    expect(res.body.stages.length).toBeGreaterThan(0);
  });

  it('exposes only stages, progress, owner and dates — nothing else', async () => {
    const res = await request(app).get('/api/public/track?brd=BRD-2026-0042');
    const raw = JSON.stringify(res.body);

    // Whitelist check: the internal stages and every internal field are absent.
    expect(raw).not.toContain('Internal Risk');
    expect(raw).not.toContain('Commercial Reconciliation');
    for (const leak of ['assignedTo', 'remarks', 'blocker', 'documents', 'sopVersionId', 'ownerId', 'id"']) {
      expect(raw).not.toContain(leak);
    }
    expect(Object.keys(res.body.project).sort()).toEqual(
      ['brdNumber', 'clientName', 'name', 'owner', 'startDate', 'status', 'targetEndDate'],
    );
  });

  it('an unknown BRD is a plain 404, same as a malformed one', async () => {
    const unknown = await request(app).get('/api/public/track?brd=BRD-9999-0000');
    const malformed = await request(app).get('/api/public/track?brd=%20%20nonsense%20%20');
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(unknown.body.error.code).toBe(malformed.body.error.code);
  });

  it('the stage list matches what an authenticated client would see', async () => {
    const client = await login(app, 'client');
    const list = await as(app, client.token).get('/api/projects?limit=50');
    const project = list.body.items.find((p) => p.code === 'NWL-PORTAL-2026');
    const authed = await as(app, client.token).get(`/api/projects/${project.id}`);

    const publicRes = await request(app).get('/api/public/track?brd=BRD-2026-0042');
    expect(publicRes.body.stages.map((s) => s.name)).toEqual(authed.body.project.stages.map((s) => s.name));
  });

  it('lookups are recorded in the audit log', async () => {
    await request(app).get('/api/public/track?brd=BRD-2026-0042');
    const admin = await login(app, 'admin');
    const audit = await as(app, admin.token).get('/api/audit?entityType=BRD_LOOKUP');
    expect(audit.body.items.length).toBeGreaterThan(0);
    expect(audit.body.items[0].actorRole).toBe('PUBLIC');
  });
});
