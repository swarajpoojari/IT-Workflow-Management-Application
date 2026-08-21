import { configureStore } from '@reduxjs/toolkit';
import { registerAuthFailureHandler } from '../api/axiosClient.js';

import authReducer, { sessionExpired } from '../features/auth/authSlice.js';
import usersReducer from '../features/users/usersSlice.js';
import sopReducer from '../features/sop/sopSlice.js';
import projectsReducer from '../features/projects/projectsSlice.js';
import stagesReducer from '../features/stages/stagesSlice.js';
import auditReducer from '../features/audit/auditSlice.js';
import uiReducer, { pushToast } from '../features/ui/uiSlice.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    users: usersReducer,
    sop: sopReducer,
    projects: projectsReducer,
    stages: stagesReducer,
    audit: auditReducer,
    ui: uiReducer,
  },
});

registerAuthFailureHandler((message) => {
  store.dispatch(sessionExpired(message));
  store.dispatch(pushToast(message, 'error'));
});
