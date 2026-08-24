import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as } from './helpers.js';

describe('Project status and completion are derived from stages', () => {
  let app, admin;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
  });

  it('a fresh project with nothing started reads NOT_STARTED at 0%', async () => {
    const templates = await as(app, admin.token).get('/api/sop');
    const template = templates.body.templates.find((t) => t.name === 'Standard IT Onboarding SOP');

    const created = await as(app, admin.token).post('/api/projects').send({
      code: 'DERIVE-01', name: 'Derivation probe', clientName: 'Probe Co',
      sopTemplateId: template.id,
    });
    expect(created.status).toBe(201);

    const res = await as(app, admin.token).get(`/api/projects/${created.body.project.id}`);
    expect(res.body.project.progress.derivedStatus).toBe('NOT_STARTED');
    expect(res.body.project.progress.percentComplete).toBe(0);
  });

  it('a blocked stage makes the whole project AT_RISK', async () => {
    const list = await as(app, admin.token).get('/api/projects?limit=50');
    const seeded = list.body.items.find((p) => p.code === 'NWL-ERP-2026');

    const res = await as(app, admin.token).get(`/api/projects/${seeded.id}`);
    // The seed leaves one stage BLOCKED on this project.
    expect(res.body.project.progress.blocked).toBeGreaterThan(0);
    expect(res.body.project.progress.derivedStatus).toBe('AT_RISK');
  });

  it('the percentage tracks completed stages, not a stored field', async () => {
    const list = await as(app, admin.token).get('/api/projects?limit=50');
    const project = list.body.items.find((p) => p.code === 'NWL-PORTAL-2026');
    const res = await as(app, admin.token).get(`/api/projects/${project.id}`);

    const { total, completed, percentComplete } = res.body.project.progress;
    expect(percentComplete).toBe(Math.round((completed / total) * 100));
  });

  it('a client sees a percentage computed over visible stages only', async () => {
    const client = await login(app, 'client');
    const list = await as(app, client.token).get('/api/projects?limit=50');
    const project = list.body.items.find((p) => p.code === 'NWL-PORTAL-2026');

    const clientView = await as(app, client.token).get(`/api/projects/${project.id}`);
    const adminView = await as(app, admin.token).get(`/api/projects/${project.id}`);

    expect(clientView.body.project.progress.total).toBeLessThan(adminView.body.project.progress.total);
  });
});
