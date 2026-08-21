import { describe, it, expect, beforeAll } from 'vitest';
import { freshApp, login, as } from './helpers.js';

describe('DB-driven RBAC', () => {
  let app;
  beforeAll(() => { app = freshApp(); });

  it('returns the caller permission list on login, for usePermission()', async () => {
    const { user } = await login(app, 'admin');
    expect(Array.isArray(user.permissions)).toBe(true);
    expect(user.permissions).toContainEqual({ module: 'users', action: 'deactivate' });
    expect(user.permissions).not.toContainEqual({ module: 'sop', action: 'publish' });
  });

  it('rejects an action the role has no permission row for', async () => {
    const { token } = await login(app, 'admin');
    const res = await as(app, token).post('/api/sop/1/publish').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.details.required).toEqual({ module: 'sop', action: 'publish' });
  });

  it('grants the same action the moment the permission row exists — no redeploy', async () => {
    const su = await login(app, 'superAdmin');

    const rolesRes = await as(app, su.token).get('/api/roles');
    const adminRole = rolesRes.body.roles.find((r) => r.key === 'ADMIN');
    const permsRes = await as(app, su.token).get('/api/roles/permissions');
    const publishPermission = permsRes.body.permissions.find(
      (p) => p.module === 'sop' && p.action === 'publish',
    );

    const admin = await login(app, 'admin');
    const before = await as(app, admin.token).get('/api/sop');
    expect(before.status).toBe(200);
    const templateId = before.body.templates[0].id;
    expect((await as(app, admin.token).post(`/api/sop/${templateId}/publish`).send({})).status).toBe(403);

    const updated = await as(app, su.token)
      .put(`/api/roles/${adminRole.id}/permissions`)
      .send({ permissionIds: [...adminRole.permissions.map((p) => p.id), publishPermission.id] });
    expect(updated.status).toBe(200);

    const after = await as(app, admin.token).post(`/api/sop/${templateId}/publish`).send({});
    expect(after.status).toBe(201);
  });

  it('never authorises by role name — no role-name comparison in the source', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    const walk = (dir) =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
      });

    const runtimeFiles = walk('src').filter(
      (file) => !file.includes(`${'src'}/db/`) && !file.endsWith('constants.js'),
    );

    const stripComments = (source) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const offenders = runtimeFiles.filter((file) => {
      const code = stripComments(readFileSync(file, 'utf-8'));
      return /role(Key)?\s*===\s*['"`]|===\s*['"`](SUPER_ADMIN|ADMIN|IT_MEMBER|CLIENT)['"`]/.test(code);
    });

    expect(offenders).toEqual([]);
  });
});
