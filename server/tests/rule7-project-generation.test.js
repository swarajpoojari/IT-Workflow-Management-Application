import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as } from './helpers.js';

describe('Rule 7 · workflow stages are auto-generated on project creation', () => {
  let app; let admin; let su; let templateId;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
    su = await login(app, 'superAdmin');
    templateId = (await as(app, admin.token).get('/api/sop')).body.templates.find((t) => t.name === 'Standard IT Onboarding SOP').id;
  });

  it('preview shows exactly what creation will generate', async () => {
    const res = await as(app, admin.token).get(`/api/projects/preview-stages?sopTemplateId=${templateId}`);
    expect(res.status).toBe(200);
    expect(res.body.sopVersion.version).toBe(1);
    expect(res.body.stages).toHaveLength(5);
    expect(res.body.stages.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('creating a project generates the whole board and pins the SOP version', async () => {
    const res = await as(app, admin.token).post('/api/projects').send({
      code: 'GEN-TEST-01',
      name: 'Generation Test',
      clientName: 'Contoso Ltd',
      sopTemplateId: templateId,
      startDate: '2026-09-01',
    });

    expect(res.status).toBe(201);
    const project = res.body.project;

    expect(project.stagesGenerated).toBe(5);
    expect(project.stages).toHaveLength(5);
    expect(project.sopVersionId).toBeDefined();
    expect(project.sopVersionNumber).toBe(1);

    expect(project.stages.map((s) => s.name)).toEqual([
      'Requirement Gathering',
      'Internal Security Review',
      'Environment Provisioning',
      'Vendor Cost Negotiation',
      'Go-Live & Handover',
    ]);
    expect(project.stages.every((s) => s.status === 'NOT_STARTED')).toBe(true);
    expect(project.stages.filter((s) => s.clientVisible)).toHaveLength(3);
    expect(project.stages.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('generation is logged in the audit trail', async () => {
    const res = await as(app, admin.token).get('/api/audit?entityType=PROJECT&action=CREATE');
    const entry = res.body.items.find((e) => e.newValue?.code === 'GEN-TEST-01');
    expect(entry).toBeDefined();
    expect(entry.newValue.stagesGenerated).toBe(5);
    expect(entry.summary).toContain('5 stages generated');
  });

  it('refuses to create from a template with no published version', async () => {
    const created = await as(app, su.token).post('/api/sop').send({ name: 'Draft-Only SOP' });
    await as(app, su.token).post(`/api/sop/${created.body.template.id}/stages`).send({ name: 'Some stage' });

    const res = await as(app, admin.token).post('/api/projects').send({
      code: 'NO-PUB-SOP',
      name: 'Should not be created',
      clientName: 'Contoso Ltd',
      sopTemplateId: created.body.template.id,
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_PUBLISHED_SOP');

    const list = await as(app, admin.token).get('/api/projects?search=NO-PUB-SOP');
    expect(list.body.items).toHaveLength(0);
  });

  it('rejects a duplicate project code', async () => {
    const res = await as(app, admin.token).post('/api/projects').send({
      code: 'GEN-TEST-01',
      name: 'Duplicate',
      clientName: 'Contoso Ltd',
      sopTemplateId: templateId,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_CODE');
  });

  it('an IT member sees only the projects they are involved in', async () => {
    const itMember = await login(app, 'itMember');
    const mine = await as(app, itMember.token).get('/api/projects?limit=50');
    const codes = mine.body.items.map((p) => p.code);

    expect(codes).toContain('NWL-ERP-2026');
    expect(codes).not.toContain('GEN-TEST-01');
  });
});
