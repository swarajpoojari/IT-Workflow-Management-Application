import { getDb, camelize, camelizeAll } from '../db/index.js';

const BOOL_FIELDS = ['isClientScope', 'isSystem'];
const cast = (row) => {
  if (!row) return null;
  const out = camelize(row);
  for (const f of BOOL_FIELDS) if (f in out) out[f] = Boolean(out[f]);
  return out;
};

export const roleModel = {
  findAll() {
    return getDb().prepare('SELECT * FROM roles ORDER BY id').all().map(cast);
  },

  findById(id) {
    return cast(getDb().prepare('SELECT * FROM roles WHERE id = ?').get(id));
  },

  findByKey(key) {
    return cast(getDb().prepare('SELECT * FROM roles WHERE key = ?').get(key));
  },

  create({ key, name, description = null, isClientScope = false, isSystem = false }) {
    const info = getDb()
      .prepare(
        `INSERT INTO roles (key, name, description, is_client_scope, is_system)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(key, name, description, isClientScope ? 1 : 0, isSystem ? 1 : 0);
    return roleModel.findById(info.lastInsertRowid);
  },

  permissionsFor(roleId) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT p.id, p.module, p.action, p.description
             FROM role_permissions rp
             JOIN permissions p ON p.id = rp.permission_id
            WHERE rp.role_id = ?
            ORDER BY p.module, p.action`,
        )
        .all(roleId),
    );
  },

  grant(roleId, permissionId) {
    getDb()
      .prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
      .run(roleId, permissionId);
  },

  revoke(roleId, permissionId) {
    getDb()
      .prepare('DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?')
      .run(roleId, permissionId);
  },

  setPermissions(roleId, permissionIds) {
    const db = getDb();
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
    const insert = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
    for (const id of permissionIds) insert.run(roleId, id);
  },
};

export const permissionModel = {
  findAll() {
    return camelizeAll(getDb().prepare('SELECT * FROM permissions ORDER BY module, action').all());
  },

  findByTuple(module, action) {
    return camelize(getDb().prepare('SELECT * FROM permissions WHERE module = ? AND action = ?').get(module, action));
  },

  upsert({ module, action, description = null }) {
    const db = getDb();
    db.prepare(
      `INSERT INTO permissions (module, action, description) VALUES (?, ?, ?)
       ON CONFLICT (module, action) DO UPDATE SET description = excluded.description`,
    ).run(module, action, description);
    return permissionModel.findByTuple(module, action);
  },
};
