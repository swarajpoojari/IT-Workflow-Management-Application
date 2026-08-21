export const endpoints = {
  auth: {
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
  },
  users: {
    root: '/users',
    byId: (id) => `/users/${id}`,
    assignments: (id) => `/users/${id}/assignments`,
    deactivate: (id) => `/users/${id}/deactivate`,
    activate: (id) => `/users/${id}/activate`,
    reassign: (id) => `/users/${id}/reassign`,
  },
  roles: {
    root: '/roles',
    permissions: '/roles/permissions',
    setPermissions: (id) => `/roles/${id}/permissions`,
  },
  sop: {
    root: '/sop',
    byId: (id) => `/sop/${id}`,
    version: (id) => `/sop/versions/${id}`,
    stages: (id) => `/sop/${id}/stages`,
    stage: (id, stageId) => `/sop/${id}/stages/${stageId}`,
    reorder: (id) => `/sop/${id}/stages/reorder`,
    publish: (id) => `/sop/${id}/publish`,
  },
  projects: {
    root: '/projects',
    summary: '/projects/summary',
    preview: (sopTemplateId) => `/projects/preview-stages?sopTemplateId=${sopTemplateId}`,
    byId: (id) => `/projects/${id}`,
    members: (id) => `/projects/${id}/members`,
    stages: (id) => `/projects/${id}/stages`,
    stageStatus: (id, stageId) => `/projects/${id}/stages/${stageId}/status`,
    stageAssign: (id, stageId) => `/projects/${id}/stages/${stageId}/assign`,
    stageHistory: (id, stageId) => `/projects/${id}/stages/${stageId}/status-history`,
    stageDocuments: (id, stageId) => `/projects/${id}/stages/${stageId}/documents`,
  },
  audit: {
    root: '/audit',
    filters: '/audit/filters',
  },
  me: {
    assignments: '/me/assignments',
  },
};
