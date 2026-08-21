import crypto from 'node:crypto';
import { getDb, camelize } from '../db/index.js';

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const refreshTokenModel = {
  create({ userId, rawToken, familyId, expiresAt, userAgent = null }) {
    const info = getDb()
      .prepare(
        `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(userId, sha256(rawToken), familyId, expiresAt, userAgent);
    return refreshTokenModel.findById(info.lastInsertRowid);
  },

  findById(id) {
    return camelize(getDb().prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(id));
  },

  findByRaw(rawToken) {
    return camelize(getDb().prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(sha256(rawToken)));
  },

  revoke(id, replacedBy = null) {
    getDb()
      .prepare("UPDATE refresh_tokens SET revoked_at = datetime('now'), replaced_by = ? WHERE id = ?")
      .run(replacedBy, id);
  },

  // A replayed token means the cookie leaked, so kill every descendant.
  revokeFamily(familyId) {
    return getDb()
      .prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE family_id = ? AND revoked_at IS NULL")
      .run(familyId).changes;
  },

  revokeAllForUser(userId) {
    return getDb()
      .prepare("UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL")
      .run(userId).changes;
  },

  purgeExpired() {
    return getDb().prepare("DELETE FROM refresh_tokens WHERE expires_at < datetime('now')").run().changes;
  },
};
