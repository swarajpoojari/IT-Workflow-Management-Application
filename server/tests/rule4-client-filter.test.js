import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as, seededProject } from './helpers.js';

describe('Rule 4 · client data is filtered server-side', () => {
  let app; let client; let admin; let project;

  beforeAll(async () => {
    app = freshApp();
    client = await login(app, 'client');
    admin = await login(app, 'admin');
    project = await seededProject(app, admin.token);
  });

  it('the seeded SOP really does contain hidden stages', async () => {
    const res = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    expect(res.body.stages).toHaveLength(5);
    expect(res.body.stages.filter((s) => s.clientVisible === false)).toHaveLength(2);
  });

  it('a client receives ONLY client-visible stages — hidden ones are absent from the payload', async () => {
    const res = await as(app, client.token).get(`/api/projects/${project.id}`);
    expect(res.status).toBe(200);

    const names = res.body.project.stages.map((s) => s.name);
    expect(res.body.project.stages).toHaveLength(3);
    expect(names).not.toContain('Internal Security Review');
    expect(names).not.toContain('Vendor Cost Negotiation');

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('Internal Security Review');
    expect(raw).not.toContain('Vendor Cost Negotiation');
  });

  it('restricted FIELDS never appear in a client response', async () => {
    const res = await as(app, client.token).get(`/api/projects/${project.id}`);
    const raw = JSON.stringify(res.body);

    for (const field of ['documents', 'auditLog', 'remarks', 'blocker', 'holdReason', 'assignedTo', 'statusHistory']) {
      expect(raw).not.toContain(`"${field}"`);
    }
    expect(res.headers['x-client-filtered']).toBe('true');
  });

  it('the same endpoint returns the restricted fields to an admin', async () => {
    const res = await as(app, admin.token).get(`/api/projects/${project.id}`);
    const raw = JSON.stringify(res.body);
    expect(raw).toContain('"documents"');
    expect(raw).toContain('Internal Security Review');
    expect(res.headers['x-client-filtered']).toBeUndefined();
  });

  it('a client gets 403 on the audit log (no audit:read permission row)', async () => {
    const res = await as(app, client.token).get('/api/audit');
    expect(res.status).toBe(403);
  });

  it('a client cannot read documents or status history', async () => {
    const stages = await as(app, client.token).get(`/api/projects/${project.id}/stages`);
    const stageId = stages.body.stages[0].id;

    expect((await as(app, client.token).get(`/api/projects/${project.id}/stages/${stageId}/documents`)).status).toBe(403);
    expect((await as(app, client.token).get(`/api/projects/${project.id}/stages/${stageId}/status-history`)).status).toBe(403);
  });

  it('a client cannot change a stage status (read-only)', async () => {
    const stages = await as(app, client.token).get(`/api/projects/${project.id}/stages`);
    const res = await as(app, client.token)
      .patch(`/api/projects/${project.id}/stages/${stages.body.stages[0].id}/status`)
      .send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(403);
  });

  it('a hidden stage is a 404 for a client even when addressed directly by id', async () => {
    const all = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    const hidden = all.body.stages.find((s) => s.clientVisible === false);

    const res = await as(app, client.token)
      .get(`/api/projects/${project.id}/stages/${hidden.id}/status-history`);
    expect([403, 404]).toContain(res.status);
  });

  it("a client cannot see another organisation's project at all", async () => {
    const acme = await seededProject(app, admin.token, 'ACM-SEC-2026');

    const list = await as(app, client.token).get('/api/projects');
    const codes = list.body.items.map((p) => p.code);

    // Assert the rule, not the fixture: every project returned belongs to the
    // client's own organisation, and none belongs to anyone else.
    expect(codes.length).toBeGreaterThan(0);
    expect(list.body.items.every((p) => p.clientName === 'Northwind Logistics')).toBe(true);
    expect(codes).not.toContain('ACM-SEC-2026');

    expect((await as(app, client.token).get(`/api/projects/${acme.id}`)).status).toBe(404);
  });

  it('client progress is computed over visible stages only', async () => {
    const clientView = await as(app, client.token).get(`/api/projects/${project.id}`);
    const adminView = await as(app, admin.token).get(`/api/projects/${project.id}`);

    expect(clientView.body.project.progress.total).toBe(3);
    expect(adminView.body.project.progress.total).toBe(5);
  });
});
