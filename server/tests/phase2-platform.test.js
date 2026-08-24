import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as } from './helpers.js';

describe('Platform features', () => {
  let app, admin, su, client, dev;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
    su = await login(app, 'superAdmin');
    client = await login(app, 'client');
    dev = await login(app, { email: 'itmember2@itwf.dev', password: 'Passw0rd!' });
  });

  it('search is scoped to what the caller may see', async () => {
    const asAdmin = await as(app, admin.token).get('/api/search?q=Northwind');
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.results.projects.length).toBeGreaterThan(0);
    expect(asAdmin.body.results.users).toBeDefined();

    const asClient = await as(app, client.token).get('/api/search?q=Northwind');
    // A client holds no users:read or sop:read, so those buckets stay empty.
    expect(asClient.body.results.users).toEqual([]);
    expect(asClient.body.results.sop).toEqual([]);
    expect(asClient.body.results.bugs).toEqual([]);
  });

  it('role preview returns another role’s permissions without granting them', async () => {
    const roles = await as(app, su.token).get('/api/roles');
    const clientRole = roles.body.roles.find((r) => r.key === 'CLIENT');

    const preview = await as(app, admin.token).get(`/api/roles/${clientRole.id}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.capabilities.clientFiltered).toBe(true);
    expect(preview.body.capabilities.canReadAudit).toBe(false);

    // The previewing admin still has their own authority.
    expect((await as(app, admin.token).get('/api/audit')).status).toBe(200);
  });

  it('reports aggregate only over projects in scope', async () => {
    const res = await as(app, admin.token).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body.totals.projects).toBeGreaterThan(0);
    expect(res.body.projectsByStatus).toBeTruthy();
    expect(Array.isArray(res.body.workload)).toBe(true);

    expect((await as(app, client.token).get('/api/reports')).status).toBe(403);
  });

  it('settings are per user and default sensibly', async () => {
    const res = await as(app, admin.token).get('/api/settings/me');
    expect(res.body.settings.theme).toBe('system');

    const saved = await as(app, admin.token).patch('/api/settings/me').send({ theme: 'dark' });
    expect(saved.body.settings.theme).toBe('dark');

    // Another user is unaffected.
    expect((await as(app, dev.token).get('/api/settings/me')).body.settings.theme).toBe('system');
  });

  it('system settings need the settings permission', async () => {
    expect((await as(app, su.token).get('/api/settings/system')).status).toBe(200);
    expect((await as(app, dev.token).get('/api/settings/system')).status).toBe(403);
  });

  it('assigning a stage notifies the assignee', async () => {
    const list = await as(app, admin.token).get('/api/projects?limit=50');
    const project = list.body.items.find((p) => p.code === 'NWL-ERP-2026');
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    const stage = stages.body.stages.find((s) => s.status === 'NOT_STARTED');

    await as(app, admin.token)
      .patch(`/api/projects/${project.id}/stages/${stage.id}/assign`)
      .send({ assignedTo: dev.user.id });

    const inbox = await as(app, dev.token).get('/api/notifications');
    expect(inbox.body.unreadCount).toBeGreaterThan(0);
    expect(inbox.body.notifications.some((n) => n.type === 'STAGE_ASSIGNED')).toBe(true);
  });

  it('a notification tray is private to its owner', async () => {
    const mine = await as(app, dev.token).get('/api/notifications');
    const theirs = await as(app, admin.token).get('/api/notifications');
    const myIds = mine.body.notifications.map((n) => n.id);
    const theirIds = theirs.body.notifications.map((n) => n.id);
    expect(myIds.filter((id) => theirIds.includes(id))).toEqual([]);
  });
});
