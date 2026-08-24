import { getDb, camelize, camelizeAll } from '../db/index.js';

export const notificationModel = {
  create({ userId, type, title, body, entityType, entityId, link }) {
    const info = getDb()
      .prepare(
        `INSERT INTO notifications (user_id, type, title, body, entity_type, entity_id, link)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, type, title, body ?? null, entityType ?? null, entityId != null ? String(entityId) : null, link ?? null);
    return camelize(getDb().prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid));
  },

  listForUser(userId, { unreadOnly = false, limit = 30 } = {}) {
    const clause = unreadOnly ? ' AND read_at IS NULL' : '';
    return camelizeAll(
      getDb()
        .prepare(`SELECT * FROM notifications WHERE user_id = ?${clause} ORDER BY created_at DESC, id DESC LIMIT ?`)
        .all(userId, limit),
    );
  },

  unreadCount(userId) {
    return getDb()
      .prepare('SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(userId).total;
  },

  markRead(userId, id) {
    return getDb()
      .prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL")
      .run(id, userId).changes;
  },

  markAllRead(userId) {
    return getDb()
      .prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL")
      .run(userId).changes;
  },
};
