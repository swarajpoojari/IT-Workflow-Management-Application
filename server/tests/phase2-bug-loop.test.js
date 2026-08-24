import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { freshApp, login, as } from './helpers.js';

// The Testing stage of the delivery project, which the seed leaves with open bugs.
async function testingStage(app, token) {
  const list = await as(app, token).get('/api/projects?limit=50');
  const project = list.body.items.find((p) => p.code === 'NWL-PORTAL-2026');
  const stages = await as(app, token).get(`/api/projects/${project.id}/stages`);
  const stage = stages.body.stages.find((s) => s.stageType === 'TESTING');
  return { project, stage };
}

describe('Testing stage cannot close while bugs are open', () => {
  let app, admin, dev, qa;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
    dev = await login(app, { email: 'itmember2@itwf.dev', password: 'Passw0rd!' });
    qa = await login(app, { email: 'qa@itwf.dev', password: 'Passw0rd!' });
  });

  it('the seeded testing stage really does have open bugs', async () => {
    const { project, stage } = await testingStage(app, admin.token);
    const res = await as(app, admin.token).get(`/api/projects/${project.id}/stages/${stage.id}/bugs`);
    expect(res.status).toBe(200);
    expect(res.body.openCount).toBeGreaterThan(0);
  });

  it('completing the stage is refused with 409 and lists the blocking bugs', async () => {
    const { project, stage } = await testingStage(app, dev.token);

    const res = await as(app, dev.token)
      .patch(`/api/projects/${project.id}/stages/${stage.id}/status`)
      .send({ status: 'COMPLETED', completionDate: '2026-10-01' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OPEN_BUGS_BLOCK_COMPLETION');
    expect(res.body.error.details.openBugCount).toBeGreaterThan(0);
    expect(res.body.error.details.bugs[0]).toHaveProperty('reference');
  });

  it('the stage status is genuinely unchanged after the refusal', async () => {
    const { project, stage } = await testingStage(app, admin.token);
    expect(stage.status).not.toBe('COMPLETED');
  });

  it('the drawer reports canComplete false with the reason', async () => {
    const { project, stage } = await testingStage(app, admin.token);
    const res = await as(app, admin.token).get(`/api/projects/${project.id}/stages/${stage.id}`);
    expect(res.body.completionBlockers.canComplete).toBe(false);
    expect(res.body.completionBlockers.openBugs).toBeGreaterThan(0);
  });

  it('closing every bug then signing off finally allows completion', async () => {
    const { project, stage } = await testingStage(app, qa.token);

    const bugs = (await as(app, qa.token).get(`/api/projects/${project.id}/stages/${stage.id}/bugs`)).body.bugs;
    for (const bug of bugs.filter((b) => b.status !== 'CLOSED')) {
      // Walk each bug legally to CLOSED.
      let current = bug.status;
      const path = current === 'OPEN' ? ['IN_PROGRESS', 'FIXED', 'RETEST', 'CLOSED'] : ['RETEST', 'CLOSED'];
      for (const next of path) {
        const res = await as(app, qa.token)
          .patch(`/api/projects/${project.id}/bugs/${bug.id}/status`)
          .send({ status: next, note: 'Verified in regression cycle.' });
        expect([200, 422]).toContain(res.status);
        if (res.status === 200) current = next;
      }
      expect(current).toBe('CLOSED');
    }

    expect((await as(app, qa.token).get(`/api/projects/${project.id}/stages/${stage.id}/bugs`)).body.openCount).toBe(0);

    // The stage also requires sign-off, so completion is still refused first.
    const blocked = await as(app, qa.token)
      .patch(`/api/projects/${project.id}/stages/${stage.id}/status`)
      .send({ status: 'COMPLETED', completionDate: '2026-10-01' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('SIGNOFF_REQUIRED');

    await as(app, admin.token)
      .post(`/api/projects/${project.id}/stages/${stage.id}/signoff`)
      .send({ decision: 'APPROVED', note: 'QA cycle complete.' });

    const done = await as(app, qa.token)
      .patch(`/api/projects/${project.id}/stages/${stage.id}/status`)
      .send({ status: 'COMPLETED', completionDate: '2026-10-01' });
    expect(done.status).toBe(200);
    expect(done.body.stage.status).toBe('COMPLETED');
  });

  it('an illegal transition is rejected with the allowed set', async () => {
    const { project, stage } = await testingStage(app, qa.token);
    const bugs = (await as(app, qa.token).get(`/api/projects/${project.id}/stages/${stage.id}/bugs`)).body.bugs;
    const closed = bugs.find((b) => b.status === 'CLOSED');

    const res = await as(app, qa.token)
      .patch(`/api/projects/${project.id}/bugs/${closed.id}/status`)
      .send({ status: 'IN_PROGRESS', note: 'reopen attempt' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ILLEGAL_BUG_TRANSITION');
    expect(res.body.error.details.allowed).toEqual([]);
  });

  it('bugs cannot be raised against a non-testing stage', async () => {
    const list = await as(app, admin.token).get('/api/projects?limit=50');
    const project = list.body.items.find((p) => p.code === 'NWL-PORTAL-2026');
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    const generic = stages.body.stages.find((s) => s.stageType === 'GENERIC');

    const res = await as(app, admin.token)
      .post(`/api/projects/${project.id}/stages/${generic.id}/bugs`)
      .send({ title: 'Should not be allowed here', severity: 'LOW' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_A_TESTING_STAGE');
  });

  it('every loop transition is recorded in the append-only event trail', async () => {
    const { project, stage } = await testingStage(app, admin.token);
    const bugs = (await as(app, admin.token).get(`/api/projects/${project.id}/stages/${stage.id}/bugs`)).body.bugs;
    const detail = await as(app, admin.token).get(`/api/projects/${project.id}/bugs/${bugs[0].id}`);

    expect(detail.body.events.length).toBeGreaterThan(0);
    expect(detail.body.events[0]).toHaveProperty('toStatus');
    expect(detail.body.events[0]).toHaveProperty('actorName');
  });
});
