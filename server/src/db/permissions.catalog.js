import { MODULES as M, ACTIONS as A, ROLES } from '../config/constants.js';

// Seed data only. Nothing imports this at request time.
export const PERMISSION_CATALOG = [
  [M.USERS,     A.READ,          'View users'],
  [M.USERS,     A.CREATE,        'Create users'],
  [M.USERS,     A.UPDATE,        'Edit user details and roles'],
  [M.USERS,     A.DEACTIVATE,    'Deactivate / reactivate users'],
  [M.USERS,     A.REASSIGN,      'Bulk-reassign a user\'s stage assignments'],

  [M.ROLES,     A.READ,          'View roles and their permissions'],
  [M.ROLES,     A.UPDATE,        'Change which permissions a role holds'],

  [M.SOP,       A.READ,          'View SOP templates and versions'],
  [M.SOP,       A.CREATE,        'Create SOP templates'],
  [M.SOP,       A.UPDATE,        'Edit SOP draft stages'],
  [M.SOP,       A.DELETE,        'Deactivate SOP templates'],
  [M.SOP,       A.REORDER,       'Reorder SOP draft stages'],
  [M.SOP,       A.PUBLISH,       'Publish an SOP draft as an immutable version'],

  [M.PROJECTS,  A.READ,          'View projects in scope'],
  [M.PROJECTS,  A.READ_ALL,      'View every project regardless of assignment'],
  [M.PROJECTS,  A.CREATE,        'Create projects from a published SOP'],
  [M.PROJECTS,  A.UPDATE,        'Edit project details'],
  [M.PROJECTS,  A.ASSIGN,        'Manage the project team'],

  [M.STAGES,    A.READ,          'View workflow stages'],
  [M.STAGES,    A.UPDATE_STATUS, 'Manually change a stage status'],
  [M.STAGES,    A.ASSIGN,        'Assign stage owners and due dates'],

  [M.DOCUMENTS, A.READ,          'View stage documents'],
  [M.DOCUMENTS, A.CREATE,        'Attach documents or links to a stage'],

  [M.AUDIT,     A.READ,          'Read the append-only audit log'],

  [M.BUGS,      A.READ,          'View bugs raised during testing'],
  [M.BUGS,      A.CREATE,        'Raise a bug against a testing stage'],
  [M.BUGS,      A.UPDATE,        'Move a bug through the resolution loop'],

  [M.SETTINGS,  A.READ,          'View system settings'],
  [M.SETTINGS,  A.UPDATE,        'Change system settings'],

  [M.REPORTS,   A.READ,          'View reports and dashboards'],
];

export const ROLE_MATRIX = {
  [ROLES.SUPER_ADMIN]: {
    name: 'Super Admin',
    description: 'Configures SOP templates, roles and permissions. Full system authority.',
    isClientScope: false,
    permissions: 'ALL',
  },

  [ROLES.ADMIN]: {
    name: 'Admin',
    description: 'Creates and manages users and projects; reads reports and the audit log.',
    isClientScope: false,
    permissions: [
      [M.USERS, A.READ], [M.USERS, A.CREATE], [M.USERS, A.UPDATE],
      [M.USERS, A.DEACTIVATE], [M.USERS, A.REASSIGN],
      [M.ROLES, A.READ],
      [M.SOP, A.READ],
      [M.PROJECTS, A.READ], [M.PROJECTS, A.READ_ALL], [M.PROJECTS, A.CREATE],
      [M.PROJECTS, A.UPDATE], [M.PROJECTS, A.ASSIGN],
      [M.STAGES, A.READ], [M.STAGES, A.ASSIGN],
      [M.DOCUMENTS, A.READ],
      [M.AUDIT, A.READ],
      [M.REPORTS, A.READ],
      [M.BUGS, A.READ], [M.BUGS, A.CREATE], [M.BUGS, A.UPDATE],
      [M.SETTINGS, A.READ],
    ],
  },

  [ROLES.IT_MEMBER]: {
    name: 'IT Team Member',
    description: 'Works assigned projects: updates stage status manually, adds remarks and documents.',
    isClientScope: false,
    permissions: [
      [M.PROJECTS, A.READ],
      [M.SOP, A.READ],
      [M.STAGES, A.READ], [M.STAGES, A.UPDATE_STATUS],
      [M.DOCUMENTS, A.READ], [M.DOCUMENTS, A.CREATE],
      [M.BUGS, A.READ], [M.BUGS, A.CREATE], [M.BUGS, A.UPDATE],
      [M.REPORTS, A.READ],
    ],
  },

  [ROLES.CLIENT]: {
    name: 'Client / Operations',
    description: 'Read-only view of their own projects, limited to client-visible stages.',
    isClientScope: true,
    permissions: [
      [M.PROJECTS, A.READ],
      [M.STAGES, A.READ],
    ],
  },
};
