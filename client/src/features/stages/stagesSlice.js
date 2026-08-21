import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';
import { applyStageUpdate } from '../projects/projectsSlice.js';
import { pushToast } from '../ui/uiSlice.js';

export const updateStageStatus = createAsyncThunk(
  'stages/updateStatus',
  async ({ projectId, stageId, payload }, thunkApi) => {
    try {
      const { data } = await api.patch(endpoints.projects.stageStatus(projectId, stageId), payload);
      thunkApi.dispatch(applyStageUpdate({ stage: data.stage, progress: data.progress }));
      thunkApi.dispatch(pushToast(`"${data.stage.name}" → ${data.stage.status.replace('_', ' ')}`, 'success'));
      return data;
    } catch (error) {
      const rejection = toRejection(error);
      thunkApi.dispatch(pushToast(rejection.message ?? 'Status update failed — reverted', 'error'));
      return thunkApi.rejectWithValue(rejection);
    }
  },
);

export const fetchStatusHistory = createAsyncThunk(
  'stages/history',
  async ({ projectId, stageId }, thunkApi) => {
    try {
      const { data } = await api.get(endpoints.projects.stageHistory(projectId, stageId));
      return { stageId, history: data.history };
    } catch (error) {
      return thunkApi.rejectWithValue(toRejection(error));
    }
  },
);

export const assignStage = createAsyncThunk(
  'stages/assign',
  async ({ projectId, stageId, payload }, thunkApi) => {
    try {
      const { data } = await api.patch(endpoints.projects.stageAssign(projectId, stageId), payload);
      thunkApi.dispatch(applyStageUpdate({ stage: data.stage }));
      return data.stage;
    } catch (error) {
      thunkApi.dispatch(pushToast(toRejection(error).message, 'error'));
      return thunkApi.rejectWithValue(toRejection(error));
    }
  },
);

export const fetchDocuments = createAsyncThunk(
  'stages/documents',
  async ({ projectId, stageId }, thunkApi) => {
    try {
      const { data } = await api.get(endpoints.projects.stageDocuments(projectId, stageId));
      return { stageId, documents: data.documents };
    } catch (error) {
      return thunkApi.rejectWithValue(toRejection(error));
    }
  },
);

export const addDocument = createAsyncThunk(
  'stages/addDocument',
  async ({ projectId, stageId, payload }, thunkApi) => {
    try {
      const { data } = await api.post(endpoints.projects.stageDocuments(projectId, stageId), payload);
      thunkApi.dispatch(
        pushToast(`"${data.document.fileName}" attached — stage status unchanged (${data.stageStatus})`, 'success'),
      );
      return { stageId, document: data.document };
    } catch (error) {
      thunkApi.dispatch(pushToast(toRejection(error).message, 'error'));
      return thunkApi.rejectWithValue(toRejection(error));
    }
  },
);

const initialState = {
  pendingRollback: {},
  updatingStageId: null,
  history: {},
  documents: {},
  status: 'idle',
  error: null,
};

const stagesSlice = createSlice({
  name: 'stages',
  initialState,
  reducers: {
    clearStagesError(state) { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(updateStageStatus.pending, (state, action) => {
        const { stageId, payload, snapshot } = action.meta.arg;
        state.updatingStageId = stageId;
        state.status = 'loading';
        state.error = null;
        // Whole-stage snapshot: rollback must restore more than status.
        if (snapshot) state.pendingRollback[stageId] = snapshot;
        void payload;
      })
      .addCase(updateStageStatus.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.updatingStageId = null;
        delete state.pendingRollback[action.meta.arg.stageId];
      })
      .addCase(updateStageStatus.rejected, (state, action) => {
        state.status = 'failed';
        state.updatingStageId = null;
        state.error = action.payload;
        void action;
      })

      .addCase(fetchStatusHistory.fulfilled, (state, action) => {
        state.history[action.payload.stageId] = action.payload.history;
      })

      .addCase(fetchDocuments.fulfilled, (state, action) => {
        state.documents[action.payload.stageId] = action.payload.documents;
      })
      .addCase(addDocument.fulfilled, (state, action) => {
        const { stageId, document } = action.payload;
        state.documents[stageId] = [document, ...(state.documents[stageId] ?? [])];
      });
  },
});

export const { clearStagesError } = stagesSlice.actions;
export default stagesSlice.reducer;

export const selectUpdatingStageId = (state) => state.stages.updatingStageId;
export const selectStageHistory = (stageId) => (state) => state.stages.history[stageId] ?? [];
export const selectStageDocuments = (stageId) => (state) => state.stages.documents[stageId] ?? [];
export const selectStagesError = (state) => state.stages.error;
