import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as } from './helpers.js';

describe('Teams · first-class rows managed from the user module', () => {
  let app; let admin;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
  });

  it('lists the seeded teams with their members', async () => {
    const res = await as(app, admin.token).get('/api/teams');

    expect(res.status).toBe(200);
    expect(res.body.teams.length).toBeGreaterThan(0);

    const infra = res.body.teams.find((t) => t.name === 'Infrastructure');
    expect(infra).toBeDefined();
    expect(infra.memberCount).toBeGreaterThan(0);
    expect(infra.members[0]).toHaveProperty('fullName');
  });

  it('creates a team and refuses a duplicate name', async () => {
    const created = await as(app, admin.token)
      .post('/api/teams')
      .send({ name: 'Security Ops', description: 'Firewall and access review.' });

    expect(created.status).toBe(201);
    expect(created.body.team).toMatchObject({ name: 'Security Ops', memberCount: 0 });

    const duplicate = await as(app, admin.token).post('/api/teams').send({ name: 'security ops' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DUPLICATE_TEAM');
  });

  it('renames a team without touching its members', async () => {
    const list = await as(app, admin.token).get('/api/teams');
    const team = list.body.teams.find((t) => t.name === 'Applications');

    const res = await as(app, admin.token)
      .patch(`/api/teams/${team.id}`)
      .send({ name: 'Application Delivery' });

    expect(res.status).toBe(200);
    expect(res.body.team.name).toBe('Application Delivery');
    expect(res.body.team.memberCount).toBe(team.memberCount);
  });

  it('refuses to delete a team a published SOP version still names', async () => {
    const list = await as(app, admin.token).get('/api/teams');
    const team = list.body.teams.find((t) => t.name === 'Application Delivery');

    const res = await as(app, admin.token).delete(`/api/teams/${team.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_IN_PUBLISHED_SOP');
    expect(res.body.error.details.stageCount).toBeGreaterThan(0);
    expect(res.body.error.message).toMatch(/Deactivate the team instead/);
  });

  it('deleting an unreferenced team unassigns its members rather than deleting them', async () => {
    const team = (await as(app, admin.token).post('/api/teams')
      .send({ name: 'Temporary Squad', category: 'Technology' })).body.team;

    const user = (await as(app, admin.token).post('/api/users').send({
      email: 'squad.member@itwf.dev',
      fullName: 'Squad Member',
      roleId: 3,
      teamId: team.id,
    })).body.user;

    const res = await as(app, admin.token).delete(`/api/teams/${team.id}`);
    expect(res.status).toBe(200);
    expect(res.body.detachedMembers).toBe(1);

    const after = await as(app, admin.token).get(`/api/users/${user.id}`);
    expect(after.status).toBe(200);
    expect(after.body.user.teamId).toBeNull();
  });
});

describe('User creation · generated temporary password', () => {
  let app; let admin;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
  });

  it('creates a user without a password field and returns a temporary one once', async () => {
    const teams = await as(app, admin.token).get('/api/teams');
    const team = teams.body.teams.find((t) => t.name === 'PMO');

    const res = await as(app, admin.token).post('/api/users').send({
      email: 'new.joiner@itwf.dev',
      fullName: 'New Joiner',
      roleId: 3,
      teamId: team.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toMatch(/^[A-Za-z]{4}-[0-9]{2}[a-z]{2}$/);
    expect(res.body.user.mustChangePassword).toBe(true);
    expect(res.body.user.teamName).toBe('PMO');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('the temporary password signs in, and the account must replace it', async () => {
    const created = await as(app, admin.token).post('/api/users').send({
      email: 'temp.user@itwf.dev',
      fullName: 'Temp User',
      roleId: 3,
    });
    const temporary = created.body.temporaryPassword;

    const session = await login(app, { email: 'temp.user@itwf.dev', password: temporary });
    expect(session.user.mustChangePassword).toBe(true);

    const changed = await as(app, session.token)
      .post('/api/auth/change-password')
      .send({ currentPassword: temporary, newPassword: 'Chosen1Password' });

    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    // The password an admin saw is dead the moment the user replaces it.
    const stale = await as(app, admin.token)
      .post('/api/auth/login')
      .send({ email: 'temp.user@itwf.dev', password: temporary });
    expect(stale.status).toBe(401);
  });

  it('refuses to reuse the current password', async () => {
    const created = await as(app, admin.token).post('/api/users').send({
      email: 'reuse@itwf.dev',
      fullName: 'Reuse Tester',
      roleId: 3,
    });
    const temporary = created.body.temporaryPassword;
    const session = await login(app, { email: 'reuse@itwf.dev', password: temporary });

    const res = await as(app, session.token)
      .post('/api/auth/change-password')
      .send({ currentPassword: temporary, newPassword: temporary });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PASSWORD_REUSED');
  });
});

describe('User deletion · guarded by append-only history', () => {
  let app; let admin; let superAdmin;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
    superAdmin = await login(app, 'superAdmin');
  });

  it('deletes an account that has never acted', async () => {
    const created = await as(app, admin.token).post('/api/users').send({
      email: 'mistake@itwf.dev',
      fullName: 'Created By Mistake',
      roleId: 3,
    });

    const res = await as(app, admin.token).delete(`/api/users/${created.body.user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const gone = await as(app, admin.token).get(`/api/users/${created.body.user.id}`);
    expect(gone.status).toBe(404);
  });

  it('refuses to delete an account named in audited records', async () => {
    const itMember = await login(app, 'itMember');

    const res = await as(app, admin.token).delete(`/api/users/${itMember.user.id}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HAS_HISTORY');
    expect(res.body.error.details.historyCount).toBeGreaterThan(0);
    expect(res.body.error.message).toMatch(/Deactivate the account instead/);

    const still = await as(app, admin.token).get(`/api/users/${itMember.user.id}`);
    expect(still.status).toBe(200);
  });

  it('refuses self-deletion', async () => {
    const res = await as(app, admin.token).delete(`/api/users/${admin.user.id}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_DELETION');
  });

  it('an IT member cannot delete anyone', async () => {
    const itMember = await login(app, 'itMember');
    const res = await as(app, itMember.token).delete(`/api/users/${superAdmin.user.id}`);
    expect(res.status).toBe(403);
  });
});

describe('Stage assignment · team ownership and dates', () => {
  let app; let admin;

  const deliveryProject = async (token) => {
    const list = await as(app, token).get('/api/projects?limit=50');
    return list.body.items.find((p) => p.code === 'NWL-PORTAL-2026');
  };

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
  });

  it('project stages inherit the owning team from their SOP stage', async () => {
    const project = await deliveryProject(admin.token);
    const res = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);

    const testing = res.body.stages.find((s) => s.name === 'System Testing');
    expect(testing.owningTeamName).toBe('Quality Assurance');
  });

  it('refuses a due date earlier than the project start date', async () => {
    const project = await deliveryProject(admin.token);
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    const stage = stages.body.stages[0];

    const res = await as(app, admin.token)
      .patch(`/api/projects/${project.id}/stages/${stage.id}/assign`)
      .send({ dueDate: '2020-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DUE_BEFORE_START');
  });

  it('only a member of the owning team can own the stage', async () => {
    const project = await deliveryProject(admin.token);
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    const testing = stages.body.stages.find((s) => s.name === 'System Testing');

    const outsider = await login(app, 'itMember2');
    const rejected = await as(app, admin.token)
      .patch(`/api/projects/${project.id}/stages/${testing.id}/assign`)
      .send({ assignedTo: outsider.user.id });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('NOT_IN_OWNING_TEAM');
    expect(rejected.body.error.details.teamName).toBe('Quality Assurance');

    const members = await as(app, admin.token).get(`/api/teams/${testing.owningTeamId}/assignable`);
    const allowed = members.body.members[0];

    const accepted = await as(app, admin.token)
      .patch(`/api/projects/${project.id}/stages/${testing.id}/assign`)
      .send({ assignedTo: allowed.id });

    expect(accepted.status).toBe(200);
    expect(accepted.body.stage.assigneeName).toBe(allowed.fullName);
  });

  it('moving the stage to another team changes who may own it', async () => {
    const project = await deliveryProject(admin.token);
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    const testing = stages.body.stages.find((s) => s.name === 'System Testing');

    const teams = await as(app, admin.token).get('/api/teams');
    const applications = teams.body.teams.find((t) => t.name === 'Applications');
    const outsider = await login(app, 'itMember2');

    const res = await as(app, admin.token)
      .patch(`/api/projects/${project.id}/stages/${testing.id}/assign`)
      .send({ owningTeamId: applications.id, assignedTo: outsider.user.id });

    expect(res.status).toBe(200);
    expect(res.body.stage.owningTeamName).toBe('Applications');
    expect(res.body.stage.assigneeName).toBe(outsider.user.fullName);
  });
});

describe('Sign-off · a rejection has to say why', () => {
  let app; let admin;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
  });

  const testingStage = async () => {
    const list = await as(app, admin.token).get('/api/projects?limit=50');
    const project = list.body.items.find((p) => p.code === 'NWL-PORTAL-2026');
    const stages = await as(app, admin.token).get(`/api/projects/${project.id}/stages`);
    // Must not already be COMPLETED — a closed stage refuses sign-off first.
    return {
      project,
      stage: stages.body.stages.find((s) => s.requiresSignoff && s.status !== 'COMPLETED'),
    };
  };

  it('rejects a sign-off that carries no note', async () => {
    const { project, stage } = await testingStage();

    const res = await as(app, admin.token)
      .post(`/api/projects/${project.id}/stages/${stage.id}/signoff`)
      .send({ decision: 'REJECTED' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REJECTION_NOTE_REQUIRED');
  });

  it('records a rejection with its note, and a later approval', async () => {
    const { project, stage } = await testingStage();

    const rejected = await as(app, admin.token)
      .post(`/api/projects/${project.id}/stages/${stage.id}/signoff`)
      .send({ decision: 'REJECTED', note: 'Payment regressions still open.' });

    expect(rejected.body.signoff.decision).toBe('REJECTED');
    expect(rejected.body.signoff.note).toBe('Payment regressions still open.');

    const approved = await as(app, admin.token)
      .post(`/api/projects/${project.id}/stages/${stage.id}/signoff`)
      .send({ decision: 'APPROVED' });

    expect(approved.body.signoffs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Roles listing · the data the role cards render', () => {
  let app; let admin;

  beforeAll(async () => {
    app = freshApp();
    admin = await login(app, 'admin');
  });

  it('reports member counts and the full module catalog', async () => {
    const res = await as(app, admin.token).get('/api/roles');

    expect(res.status).toBe(200);
    expect(res.body.modules).toEqual(expect.arrayContaining(['users', 'projects', 'roles']));

    const itRole = res.body.roles.find((r) => r.key === 'IT_MEMBER');
    expect(itRole.memberCount).toBeGreaterThan(0);
    expect(itRole.activeMemberCount).toBeLessThanOrEqual(itRole.memberCount);
    expect(itRole.permissions.length).toBeGreaterThan(0);
  });
});
