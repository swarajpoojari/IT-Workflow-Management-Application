import { auditModel } from '../models/audit.model.js';

export function recordAudit(req, entry) {
  try {
    return auditModel.append({
      actorId: req?.user?.id ?? null,
      actorEmail: req?.user?.email ?? null,
      actorRole: req?.user?.roleKey ?? null,
      ipAddress: req?.ip ?? null,
      ...entry,
    });
  } catch (error) {
    console.warn('[audit] failed to write entry:', error.message);
    return null;
  }
}

export function diff(before = {}, after = {}, fields) {
  const oldValue = {};
  const newValue = {};
  for (const field of fields) {
    if (before?.[field] !== after?.[field]) {
      oldValue[field] = before?.[field] ?? null;
      newValue[field] = after?.[field] ?? null;
    }
  }
  return Object.keys(newValue).length ? { oldValue, newValue } : null;
}
