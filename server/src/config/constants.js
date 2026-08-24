export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  IT_MEMBER: 'IT_MEMBER',
  CLIENT: 'CLIENT',
};

export const MODULES = {
  AUTH: 'auth',
  USERS: 'users',
  ROLES: 'roles',
  SOP: 'sop',
  PROJECTS: 'projects',
  STAGES: 'stages',
  DOCUMENTS: 'documents',
  AUDIT: 'audit',
  REPORTS: 'reports',
  BUGS: 'bugs',
  SETTINGS: 'settings',
  NOTIFICATIONS: 'notifications',
};

export const STAGE_TYPE = {
  GENERIC: 'GENERIC',
  DEVELOPMENT: 'DEVELOPMENT',
  TESTING: 'TESTING',
  UAT: 'UAT',
};

// Granted per stage, not per module. See middleware/stagePermission.js.
export const STAGE_ACTIONS = {
  VIEW: 'view',
  UPDATE_STATUS: 'update_status',
  UPLOAD_EVIDENCE: 'upload_evidence',
  SIGNOFF: 'signoff',
  RAISE_BUG: 'raise_bug',
  RESOLVE_BUG: 'resolve_bug',
  CLOSE_BUG: 'close_bug',
};

export const BUG_STATUS = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  FIXED: 'FIXED',
  RETEST: 'RETEST',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
};

// Anything not CLOSED blocks a TESTING stage from completing.
export const OPEN_BUG_STATUSES = ['OPEN', 'IN_PROGRESS', 'FIXED', 'RETEST', 'REOPENED'];

// The authority on legal moves. CLOSED is terminal.
export const BUG_TRANSITIONS = {
  OPEN:        ['IN_PROGRESS', 'FIXED', 'CLOSED'],
  IN_PROGRESS: ['FIXED', 'OPEN'],
  FIXED:       ['RETEST', 'REOPENED', 'CLOSED'],
  RETEST:      ['CLOSED', 'REOPENED'],
  REOPENED:    ['IN_PROGRESS', 'FIXED'],
  CLOSED:      [],
};

export const BUG_SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const SIGNOFF_DECISION = { APPROVED: 'APPROVED', REJECTED: 'REJECTED' };

export const NOTIFICATION_TYPE = {
  STAGE_ASSIGNED: 'STAGE_ASSIGNED',
  STAGE_STATUS: 'STAGE_STATUS',
  BUG_ASSIGNED: 'BUG_ASSIGNED',
  BUG_RAISED: 'BUG_RAISED',
  BUG_STATUS: 'BUG_STATUS',
  SIGNOFF_RECORDED: 'SIGNOFF_RECORDED',
  REASSIGNED: 'REASSIGNED',
};

export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  READ_ALL: 'read_all',
  UPDATE: 'update',
  DELETE: 'delete',
  PUBLISH: 'publish',
  REORDER: 'reorder',
  ASSIGN: 'assign',
  DEACTIVATE: 'deactivate',
  REASSIGN: 'reassign',
  UPDATE_STATUS: 'update_status',
  PREVIEW: 'preview',
};

export const STAGE_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
};

export const STAGE_STATUSES = Object.values(STAGE_STATUS);

export const STATUS_REQUIRED_FIELDS = {
  [STAGE_STATUS.NOT_STARTED]: [],
  [STAGE_STATUS.IN_PROGRESS]: [],
  [STAGE_STATUS.BLOCKED]: ['blocker'],
  [STAGE_STATUS.ON_HOLD]: ['holdReason'],
  [STAGE_STATUS.COMPLETED]: ['completionDate'],
};

export const ACTIVE_STAGE_STATUSES = [
  STAGE_STATUS.NOT_STARTED,
  STAGE_STATUS.IN_PROGRESS,
  STAGE_STATUS.BLOCKED,
  STAGE_STATUS.ON_HOLD,
];

export const SOP_VERSION_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
};

export const PROJECT_STATUS = {
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const PROJECT_STATUS_DERIVED = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  AT_RISK: 'AT_RISK',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
};

export const AUDIT_ENTITY = {
  USER: 'USER',
  ROLE: 'ROLE',
  SOP_TEMPLATE: 'SOP_TEMPLATE',
  SOP_VERSION: 'SOP_VERSION',
  SOP_STAGE: 'SOP_STAGE',
  PROJECT: 'PROJECT',
  PROJECT_STAGE: 'PROJECT_STAGE',
  DOCUMENT: 'DOCUMENT',
  AUTH: 'AUTH',
  BUG: 'BUG',
  SIGNOFF: 'SIGNOFF',
  SETTINGS: 'SETTINGS',
  BRD_LOOKUP: 'BRD_LOOKUP',
};

export const AUDIT_ACTION = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  PUBLISH: 'PUBLISH',
  REORDER: 'REORDER',
  STATUS_CHANGE: 'STATUS_CHANGE',
  ASSIGN: 'ASSIGN',
  REASSIGN: 'REASSIGN',
  DEACTIVATE: 'DEACTIVATE',
  ACTIVATE: 'ACTIVATE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  UPLOAD: 'UPLOAD',
  SIGNOFF: 'SIGNOFF',
  BUG_RAISED: 'BUG_RAISED',
  BUG_STATUS: 'BUG_STATUS',
  VIEW: 'VIEW',
};

export const CLIENT_RESTRICTED_FIELDS = [
  'documents',
  'documentCount',
  'auditLog',
  'audit',
  'remarks',
  'internalNotes',
  'blocker',
  'holdReason',
  'assignedTo',
  'assignedToId',
  'assignee',
  'statusHistory',
  'passwordHash',
  'createdBy',
  'updatedBy',
  'ownerId',
  'sopTemplateId',
  'permissions',
];
