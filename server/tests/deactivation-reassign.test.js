import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as } from './helpers.js';

describe('User deactivation · 409 then reassign', () => {
  let app; let admin; let itMember; let itMember2;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
    itMember = await login(app, 'itMember');
    itMember2 = await login(app, 'itMember2');
  });

  it('previews the blocking assignments without changing anything', async () => {
    const res = await as(app, admin.token).get(`/api/users/${itMember.user.id}/assignments`);
    expect(res.status).toBe(200);
    expect(res.body.blocked).toBe(true);
    expect(res.body.assignments.length).toBeGreaterThan(0);
    expect(res.body.assignments[0]).toHaveProperty('projectCode');
    expect(res.body.assignments[0]).toHaveProperty('stageName');
  });

  it('deactivating a user with live assignments returns 409 with the list to move', async () => {
    const res = await as(app, admin.token).patch(`/api/users/${itMember.user.id}/deactivate`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_ASSIGNMENTS');
    expect(res.body.error.details.assignmentCount).toBeGreaterThan(0);
    expect(res.body.error.details.assignments[0]).toMatchObject({
      projectCode: expect.any(String),
      stageName: expect.any(String),
      status: expect.any(String),
    });

    const check = await as(app, admin.token).get(`/api/users/${itMember.user.id}`);
    expect(check.body.user.isActive).toBe(true);
  });

  it('reassigning moves every active stage and reports that deactivation may proceed', async () => {
    const res = await as(app, admin.token)
      .post(`/api/users/${itMember.user.id}/reassign`)
      .send({ toUserId: itMember2.user.id });

    expect(res.status).toBe(200);
    expect(res.body.movedCount).toBeGreaterThan(0);
    expect(res.body.remaining).toHaveLength(0);
    expect(res.body.canDeactivateNow).toBe(true);
  });

  it('reassignment does not change any stage status (Rule 1 still holds)', async () => {
    const list = await as(app, admin.token).get('/api/projects?limit=50');
    const project = list.body.items.find((p) => p.code === 'NWL-ERP-2026');
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);

    const statuses = stages.body.stages.map((s) => s.status);
    expect(statuses).toContain('COMPLETED');
    expect(statuses).toContain('IN_PROGRESS');
    expect(statuses).toContain('BLOCKED');
  });

  it('deactivation now succeeds', async () => {
    const res = await as(app, admin.token).patch(`/api/users/${itMember.user.id}/deactivate`);
    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(false);
  });

  it("the deactivated user's existing session is rejected immediately", async () => {
    const res = await as(app, itMember.token).get('/api/projects');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('the deactivated user can no longer log in', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'itmember@itwf.dev', password: 'Passw0rd!' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('work cannot be assigned to a deactivated user', async () => {
    const list = await as(app, admin.token).get('/api/projects?limit=50');
    const project = list.body.items.find((p) => p.code === 'NWL-ERP-2026');
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);

    const res = await as(app, admin.token)
      .patch(`/api/projects/${project.id}/stages/${stages.body.stages[0].id}/assign`)
      .send({ assignedTo: itMember.user.id });

    expect(res.status).toBe(400);
  });

  it('an admin cannot deactivate their own account', async () => {
    const res = await as(app, admin.token).patch(`/api/users/${admin.user.id}/deactivate`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_DEACTIVATION');
  });

  it('reactivation restores access', async () => {
    expect((await as(app, admin.token).patch(`/api/users/${itMember.user.id}/activate`)).status).toBe(200);

    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'itmember@itwf.dev', password: 'Passw0rd!' });
    expect(res.status).toBe(200);
  });
});
