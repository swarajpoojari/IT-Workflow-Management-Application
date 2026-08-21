import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as, seededProject } from './helpers.js';

describe('Rule 1 · manual status only', () => {
  let app;
  let it_;
  let project;
  let stage;

  beforeAll(async () => {
    app = freshApp();
    it_ = await login(app, 'itMember');
    project = await seededProject(app, it_.token);
    const stages = await as(app, it_.token).get(`/api/projects/${project.id}/stages`);
    stage = stages.body.stages.find((s) => s.status === 'NOT_STARTED');
    expect(stage).toBeDefined();
  });

  it('uploading a DOCUMENT leaves the stage status untouched', async () => {
    const before = await as(app, it_.token).get(`/api/projects/${project.id}/stages`);
    const beforeStatus = before.body.stages.find((s) => s.id === stage.id).status;

    const upload = await as(app, it_.token)
      .post(`/api/projects/${project.id}/stages/${stage.id}/documents`)
      .send({ fileName: 'network-diagram.pdf', fileUrl: 'https://files.example/nd.pdf', docType: 'FILE' });

    expect(upload.status).toBe(201);
    expect(upload.body.statusUnchanged).toBe(true);

    const after = await as(app, it_.token).get(`/api/projects/${project.id}/stages`);
    expect(after.body.stages.find((s) => s.id === stage.id).status).toBe(beforeStatus);
  });

  it('adding a LINK leaves the stage status untouched', async () => {
    const upload = await as(app, it_.token)
      .post(`/api/projects/${project.id}/stages/${stage.id}/documents`)
      .send({ fileName: 'Runbook', fileUrl: 'https://wiki.example/runbook', docType: 'LINK' });

    expect(upload.status).toBe(201);
    expect(upload.body.stageStatus).toBe('NOT_STARTED');
  });

  it('assigning an owner does not move the stage either', async () => {
    const admin = await login(app, 'admin');
    const res = await as(app, admin.token)
      .patch(`/api/projects/${project.id}/stages/${stage.id}/assign`)
      .send({ assignedTo: it_.user.id, dueDate: '2026-11-30' });

    expect(res.status).toBe(200);
    expect(res.body.stage.status).toBe('NOT_STARTED');
    expect(res.body.stage.dueDate).toBe('2026-11-30');
  });

  it('an explicit PATCH /status is the only thing that moves a stage, and it writes history', async () => {
    const res = await as(app, it_.token)
      .patch(`/api/projects/${project.id}/stages/${stage.id}/status`)
      .send({ status: 'IN_PROGRESS', remarks: 'Kick-off done' });

    expect(res.status).toBe(200);
    expect(res.body.stage.status).toBe('IN_PROGRESS');

    const history = await as(app, it_.token)
      .get(`/api/projects/${project.id}/stages/${stage.id}/status-history`);

    expect(history.status).toBe(200);
    expect(history.body.history[0]).toMatchObject({
      fromStatus: 'NOT_STARTED',
      toStatus: 'IN_PROGRESS',
      changedByName: 'Ivy Chen',
    });
  });
});

describe('Rule 1 · conditional required fields', () => {
  let app; let it_; let project; let stageId;

  beforeAll(async () => {
    app = freshApp();
    it_ = await login(app, 'itMember');
    project = await seededProject(app, it_.token);
    const stages = await as(app, it_.token).get(`/api/projects/${project.id}/stages`);
    stageId = stages.body.stages.find((s) => s.status === 'NOT_STARTED').id;
  });

  const patch = (body) => as(app, it_.token).patch(`/api/projects/${project.id}/stages/${stageId}/status`).send(body);

  it('BLOCKED without a blocker is rejected', async () => {
    const res = await patch({ status: 'BLOCKED' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ON_HOLD without a reason is rejected', async () => {
    const res = await patch({ status: 'ON_HOLD' });
    expect(res.status).toBe(400);
  });

  it('COMPLETED without a completion date is rejected', async () => {
    const res = await patch({ status: 'COMPLETED' });
    expect(res.status).toBe(400);
  });

  it('accepts each status once its required field is supplied', async () => {
    expect((await patch({ status: 'BLOCKED', blocker: 'Waiting on CHG-4471' })).status).toBe(200);
    expect((await patch({ status: 'ON_HOLD', holdReason: 'Client paused rollout' })).status).toBe(200);

    const completed = await patch({ status: 'COMPLETED', completionDate: '2026-08-20' });
    expect(completed.status).toBe(200);
    expect(completed.body.stage.blocker).toBeNull();
    expect(completed.body.stage.holdReason).toBeNull();
    expect(completed.body.stage.completionDate).toBe('2026-08-20');
  });
});
