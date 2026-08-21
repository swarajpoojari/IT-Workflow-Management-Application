// Role keys are for seeding and tests only; authorisation reads permission rows.
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
};

export const STAGE_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
};

export const STAGE_STATUSES = Object.values(STAGE_STATUS);

// Which field a status change must supply. Mirrored by the client's status modal.
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
};

// Stripped from every response to a client-scoped role.
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
