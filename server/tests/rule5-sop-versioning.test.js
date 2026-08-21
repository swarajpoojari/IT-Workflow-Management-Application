import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as, seededProject } from './helpers.js';

describe('Rule 5 · SOP version protection', () => {
  let app; let su; let admin; let project; let templateId;

  beforeAll(async () => {
    app = freshApp();
    su = await login(app, 'superAdmin');
    admin = await login(app, 'admin');
    project = await seededProject(app, admin.token);
    templateId = (await as(app, su.token).get('/api/sop')).body.templates[0].id;
  });

  it('a published version is immutable — its stages cannot be edited', async () => {
    const template = await as(app, su.token).get(`/api/sop/${templateId}`);
    const publishedStage = template.body.template.publishedVersion.stages[0];

    const res = await as(app, su.token)
      .patch(`/api/sop/${templateId}/stages/${publishedStage.id}`)
      .send({ name: 'Tampered' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SOP_VERSION_IMMUTABLE');
  });

  it('a published stage cannot be deleted either', async () => {
    const template = await as(app, su.token).get(`/api/sop/${templateId}`);
    const publishedStage = template.body.template.publishedVersion.stages[0];

    const res = await as(app, su.token).delete(`/api/sop/${templateId}/stages/${publishedStage.id}`);
    expect(res.status).toBe(409);
  });

  it('editing and publishing v2 leaves an existing project on v1, unchanged', async () => {
    const before = await as(app, admin.token).get(`/api/projects/${project.id}`);
    const pinnedVersionId = before.body.project.sopVersionId;
    const stagesBefore = before.body.project.stages.map((s) => ({ name: s.name, sequence: s.sequence }));
    expect(before.body.project.sopVersionNumber).toBe(1);

    const template = await as(app, su.token).get(`/api/sop/${templateId}`);
    const draft = template.body.template.draft;

    await as(app, su.token)
      .patch(`/api/sop/${templateId}/stages/${draft.stages[0].id}`)
      .send({ name: 'Requirement Gathering (revised v2)', clientVisible: false });

    const added = await as(app, su.token)
      .post(`/api/sop/${templateId}/stages`)
      .send({ name: 'Post-Go-Live Hypercare', clientVisible: true });
    expect(added.status).toBe(201);

    const publish = await as(app, su.token)
      .post(`/api/sop/${templateId}/publish`)
      .send({ changeNote: 'Added hypercare; tightened requirement visibility.' });
    expect(publish.status).toBe(201);
    expect(publish.body.published.version).toBe(2);
    expect(publish.body.published.stages).toHaveLength(6);

    const after = await as(app, admin.token).get(`/api/projects/${project.id}`);
    expect(after.body.project.sopVersionId).toBe(pinnedVersionId);
    expect(after.body.project.sopVersionNumber).toBe(1);
    expect(after.body.project.stages.map((s) => ({ name: s.name, sequence: s.sequence }))).toEqual(stagesBefore);
    expect(after.body.project.stages).toHaveLength(5);
    expect(after.body.project.stages[0].name).toBe('Requirement Gathering');
  });

  it('a project created AFTER the publish picks up v2', async () => {
    const res = await as(app, admin.token).post('/api/projects').send({
      code: 'NEW-AFTER-V2',
      name: 'Created after publishing v2',
      clientName: 'Northwind Logistics',
      sopTemplateId: templateId,
    });

    expect(res.status).toBe(201);
    expect(res.body.project.sopVersionNumber).toBe(2);
    expect(res.body.project.stages).toHaveLength(6);
  });

  it('publishing always opens a fresh editable draft', async () => {
    const template = await as(app, su.token).get(`/api/sop/${templateId}`);
    expect(template.body.template.draft.status).toBe('DRAFT');
    expect(template.body.template.draft.version).toBe(3);
    expect(template.body.template.draft.stages).toHaveLength(6);
  });

  it('an empty SOP cannot be published', async () => {
    const created = await as(app, su.token).post('/api/sop').send({ name: 'Empty SOP For Test' });
    const res = await as(app, su.token).post(`/api/sop/${created.body.template.id}/publish`).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('EMPTY_SOP');
  });

  it('the version history is visible with stage counts and project usage', async () => {
    const template = await as(app, su.token).get(`/api/sop/${templateId}`);
    const versions = template.body.template.versions;

    const v1 = versions.find((v) => v.version === 1);
    expect(v1.status).toBe('PUBLISHED');
    expect(v1.stageCount).toBe(5);
    expect(v1.projectCount).toBeGreaterThanOrEqual(2);
  });
});
