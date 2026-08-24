import { notificationModel } from '../models/notification.model.js';
import { userSettingsModel } from '../models/settings.model.js';
import { NOTIFICATION_TYPE } from '../config/constants.js';

const PREFERENCE_FOR = {
  [NOTIFICATION_TYPE.STAGE_ASSIGNED]: 'notifyAssignments',
  [NOTIFICATION_TYPE.REASSIGNED]: 'notifyAssignments',
  [NOTIFICATION_TYPE.BUG_ASSIGNED]: 'notifyBugs',
  [NOTIFICATION_TYPE.BUG_RAISED]: 'notifyBugs',
  [NOTIFICATION_TYPE.BUG_STATUS]: 'notifyBugs',
  [NOTIFICATION_TYPE.SIGNOFF_RECORDED]: 'notifySignoffs',
};

// Never throws: a failed notification must not roll back the change behind it.
export function notify({ userId, actorId, type, title, body, entityType, entityId, link }) {
  try {
    if (!userId || userId === actorId) return null;
    const preference = PREFERENCE_FOR[type];
    if (preference && userSettingsModel.get(userId)[preference] === false) return null;
    return notificationModel.create({ userId, type, title, body, entityType, entityId, link });
  } catch (error) {
    console.warn('[notify] skipped:', error.message);
    return null;
  }
}

export function notifyMany(userIds, payload) {
  const unique = [...new Set(userIds.filter(Boolean))];
  return unique.map((userId) => notify({ ...payload, userId })).filter(Boolean);
}
