import { getDb, camelize } from '../db/index.js';

const DEFAULTS = {
  theme: 'system',
  density: 'comfortable',
  notifyAssignments: true,
  notifyBugs: true,
  notifySignoffs: true,
};

export const userSettingsModel = {
  get(userId) {
    const row = camelize(getDb().prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId));
    if (!row) return { userId, ...DEFAULTS };
    return {
      ...row,
      notifyAssignments: Boolean(row.notifyAssignments),
      notifyBugs: Boolean(row.notifyBugs),
      notifySignoffs: Boolean(row.notifySignoffs),
    };
  },

  upsert(userId, patch) {
    const current = userSettingsModel.get(userId);
    const next = { ...current, ...patch };
    getDb()
      .prepare(
        `INSERT INTO user_settings (user_id, theme, density, notify_assignments, notify_bugs, notify_signoffs, updated_at)
         VALUES (@userId, @theme, @density, @notifyAssignments, @notifyBugs, @notifySignoffs, datetime('now'))
         ON CONFLICT (user_id) DO UPDATE SET
           theme = excluded.theme, density = excluded.density,
           notify_assignments = excluded.notify_assignments,
           notify_bugs = excluded.notify_bugs,
           notify_signoffs = excluded.notify_signoffs,
           updated_at = datetime('now')`,
      )
      .run({
        userId,
        theme: next.theme,
        density: next.density,
        notifyAssignments: next.notifyAssignments ? 1 : 0,
        notifyBugs: next.notifyBugs ? 1 : 0,
        notifySignoffs: next.notifySignoffs ? 1 : 0,
      });
    return userSettingsModel.get(userId);
  },
};

export const systemSettingsModel = {
  all() {
    const rows = getDb().prepare('SELECT key, value FROM system_settings').all();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },

  set(key, value, updatedBy) {
    getDb()
      .prepare(
        `INSERT INTO system_settings (key, value, updated_by, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
      )
      .run(key, value == null ? null : String(value), updatedBy ?? null);
  },
};

export const brdAccessLogModel = {
  record({ brdNumber, found, ipAddress, userAgent }) {
    getDb()
      .prepare('INSERT INTO brd_access_log (brd_number, found, ip_address, user_agent) VALUES (?, ?, ?, ?)')
      .run(brdNumber, found ? 1 : 0, ipAddress ?? null, userAgent ?? null);
  },

  recentFailuresFrom(ipAddress, minutes = 15) {
    return getDb()
      .prepare(
        `SELECT COUNT(*) AS total FROM brd_access_log
          WHERE ip_address = ? AND found = 0 AND created_at >= datetime('now', ?)`,
      )
      .get(ipAddress, `-${minutes} minutes`).total;
  },
};
