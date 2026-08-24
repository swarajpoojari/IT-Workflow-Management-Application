import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as } from './helpers.js';

describe('Stage-level permissions', () => {
  let app, admin, dev, qa;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
    dev = await login(app, { email: 'itmember2@itwf.dev', password: 'Passw0rd!' });
    qa = await login(app, { email: 'qa@itwf.dev', password: 'Passw0rd!' });
  });

  const delivery = async (token) => {
    const list = await as(app, token).get('/api/projects?limit=50');
    return list.body.items.find((p) => p.code === 'NWL-PORTAL-2026');
  };

  it('grants are snapshotted onto every generated project stage', async () => {
    const project = await delivery(admin.token);
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    const stage = stages.body.stages[0];

    const res = await as(app, admin.token).get(`/api/projects/${project.id}/stages/${stage.id}/permissions`);
    expect(res.status).toBe(200);
    expect(res.body.permissions.length).toBeGreaterThan(0);
    expect(res.body.permissions[0]).toHaveProperty('action');
    expect(res.body.permissions[0]).toHaveProperty('roleKey');
  });

  it('the drawer reports the caller’s own actions on that stage', async () => {
    const project = await delivery(qa.token);
    const stages = await as(app, qa.token).get(`/api/projects/${project.id}/stages`);
    const testing = stages.body.stages.find((s) => s.stageType === 'TESTING');

    const res = await as(app, qa.token).get(`/api/projects/${project.id}/stages/${testing.id}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions.allowed).toContain('raise_bug');
  });

  it('a stage with no grant for the role refuses the action', async () => {
    const project = await delivery(admin.token);
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    // "Internal Risk & Compliance" grants ADMIN only; IT_MEMBER holds nothing,
    // and the seed does not assign it to the QA user.
    const restricted = stages.body.stages.find((s) => s.name === 'Internal Risk & Compliance');

    const res = await as(app, qa.token)
      .patch(`/api/projects/${project.id}/stages/${restricted.id}/status`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STAGE_PERMISSION_DENIED');
    expect(res.body.error.details.action).toBe('update_status');
  });

  it('two stages of the same project can grant different actions to the same role', async () => {
    const project = await delivery(admin.token);
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    const testing = stages.body.stages.find((s) => s.stageType === 'TESTING');
    const development = stages.body.stages.find((s) => s.name === 'Development');

    const onTesting = await as(app, qa.token).get(`/api/projects/${project.id}/stages/${testing.id}`);
    const onDev = await as(app, qa.token).get(`/api/projects/${project.id}/stages/${development.id}`);

    expect(onTesting.body.permissions.allowed).toContain('raise_bug');
    expect(onDev.body.permissions.allowed).not.toContain('raise_bug');
  });

  it('an administrator is not blocked by stage grants', async () => {
    const project = await delivery(admin.token);
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    const restricted = stages.body.stages.find((s) => s.name === 'Internal Risk & Compliance');

    const res = await as(app, admin.token).get(`/api/projects/${project.id}/stages/${restricted.id}`);
    expect(res.body.permissions.source).toBe('administrator');
  });
});
