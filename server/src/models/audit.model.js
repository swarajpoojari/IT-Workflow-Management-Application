import { getDb, camelize, camelizeAll } from '../db/index.js';

// Append-only. No update or delete here, and schema triggers enforce it.
export const auditModel = {
  append(entry) {
    const info = getDb()
      .prepare(
        `INSERT INTO audit_logs
           (actor_id, actor_email, actor_role, entity_type, entity_id, action, summary,
            old_value, new_value, ip_address)
         VALUES (@actorId, @actorEmail, @actorRole, @entityType, @entityId, @action, @summary,
                 @oldValue, @newValue, @ipAddress)`,
      )
      .run({
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        actorRole: entry.actorRole ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId != null ? String(entry.entityId) : null,
        action: entry.action,
        summary: entry.summary ?? null,
        oldValue: entry.oldValue != null ? JSON.stringify(entry.oldValue) : null,
        newValue: entry.newValue != null ? JSON.stringify(entry.newValue) : null,
        ipAddress: entry.ipAddress ?? null,
      });
    return info.lastInsertRowid;
  },

  list({ entityType, entityId, action, actorId, dateFrom, dateTo, limit = 20, offset = 0 } = {}) {
    const where = [];
    const params = { limit, offset };
    if (entityType) { where.push('a.entity_type = @entityType'); params.entityType = entityType; }
    if (entityId)   { where.push('a.entity_id = @entityId');     params.entityId = String(entityId); }
    if (action)     { where.push('a.action = @action');          params.action = action; }
    if (actorId)    { where.push('a.actor_id = @actorId');       params.actorId = actorId; }
    if (dateFrom)   { where.push('a.created_at >= @dateFrom');   params.dateFrom = dateFrom; }
    if (dateTo)     { where.push('a.created_at <= @dateTo');     params.dateTo = `${dateTo} 23:59:59`; }

    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const rows = getDb()
      .prepare(
        `SELECT a.*, u.full_name AS actor_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.actor_id
          ${clause}
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT @limit OFFSET @offset`,
      )
      .all(params);

    const countParams = { ...params };
    delete countParams.limit;
    delete countParams.offset;
    const { total } = getDb()
      .prepare(`SELECT COUNT(*) AS total FROM audit_logs a${clause}`)
      .get(countParams);

    const items = camelizeAll(rows).map((row) => ({
      ...row,
      oldValue: row.oldValue ? JSON.parse(row.oldValue) : null,
      newValue: row.newValue ? JSON.parse(row.newValue) : null,
    }));

    return { items, total };
  },

  distinctValues() {
    const db = getDb();
    return {
      entityTypes: db.prepare('SELECT DISTINCT entity_type AS v FROM audit_logs ORDER BY v').all().map((r) => r.v),
      actions: db.prepare('SELECT DISTINCT action AS v FROM audit_logs ORDER BY v').all().map((r) => r.v),
    };
  },
};
