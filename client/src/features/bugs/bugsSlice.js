import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

export const fetchStageBugs = createAsyncThunk(
  'bugs/fetchForStage',
  async ({ projectId, stageId }, { rejectWithValue }) => {
    try {
      const { data } = await api.get(endpoints.projects.stageBugs(projectId, stageId));
      return { stageId, ...data };
    } catch (error) {
      return rejectWithValue(toRejection(error));
    }
  },
);

export const raiseBug = createAsyncThunk(
  'bugs/raise',
  async ({ projectId, stageId, payload }, { rejectWithValue }) => {
    try {
      const { data } = await api.post(endpoints.projects.stageBugs(projectId, stageId), payload);
      return { stageId, ...data };
    } catch (error) {
      return rejectWithValue(toRejection(error));
    }
  },
);

export const transitionBug = createAsyncThunk(
  'bugs/transition',
  async ({ projectId, bugId, stageId, payload }, { rejectWithValue }) => {
    try {
      const { data } = await api.patch(endpoints.projects.bugStatus(projectId, bugId), payload);
      return { stageId, ...data };
    } catch (error) {
      return rejectWithValue(toRejection(error));
    }
  },
);

export const fetchBugDetail = createAsyncThunk(
  'bugs/detail',
  async ({ projectId, bugId }, { rejectWithValue }) => {
    try {
      return (await api.get(endpoints.projects.bug(projectId, bugId))).data;
    } catch (error) {
      return rejectWithValue(toRejection(error));
    }
  },
);

const slice = createSlice({
  name: 'bugs',
  initialState: { byStage: {}, openCount: {}, detail: null, status: 'idle', saving: false, error: null },
  reducers: {
    clearBugError(state) { state.error = null; },
    closeBugDetail(state) { state.detail = null; },
  },
  extraReducers: (builder) => {
    const applyList = (state, action) => {
      const { stageId, bugs, openCount } = action.payload;
      if (bugs) state.byStage[stageId] = bugs;
      if (openCount !== undefined) state.openCount[stageId] = openCount;
    };

    builder
      .addCase(fetchStageBugs.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchStageBugs.fulfilled, (state, action) => { state.status = 'succeeded'; applyList(state, action); })
      .addCase(fetchStageBugs.rejected, (state, action) => { state.status = 'failed'; state.error = action.payload; })

      .addCase(raiseBug.pending, (state) => { state.saving = true; state.error = null; })
      .addCase(raiseBug.fulfilled, (state, action) => {
        state.saving = false;
        const { stageId, bug, openCount } = action.payload;
        state.byStage[stageId] = [bug, ...(state.byStage[stageId] ?? [])];
        state.openCount[stageId] = openCount;
      })
      .addCase(raiseBug.rejected, (state, action) => { state.saving = false; state.error = action.payload; })

      .addCase(transitionBug.pending, (state) => { state.saving = true; state.error = null; })
      .addCase(transitionBug.fulfilled, (state, action) => {
        state.saving = false;
        const { stageId, bug, openCount } = action.payload;
        const list = state.byStage[stageId] ?? [];
        state.byStage[stageId] = list.map((b) => (b.id === bug.id ? bug : b));
        state.openCount[stageId] = openCount;
        if (state.detail?.bug?.id === bug.id) state.detail = { ...state.detail, bug, events: action.payload.events };
      })
      .addCase(transitionBug.rejected, (state, action) => { state.saving = false; state.error = action.payload; })

      .addCase(fetchBugDetail.fulfilled, (state, action) => { state.detail = action.payload; });
  },
});

export const { clearBugError, closeBugDetail } = slice.actions;
export default slice.reducer;
