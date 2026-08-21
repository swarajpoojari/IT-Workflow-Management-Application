import { createAsyncThunk, createSlice, createSelector } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

export const fetchProjects = createAsyncThunk('projects/fetchAll', async (params = {}, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.projects.root, { params });
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const fetchProjectSummary = createAsyncThunk('projects/summary', async (_, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.projects.summary);
    return data.projects;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const fetchProject = createAsyncThunk('projects/fetchOne', async (id, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.projects.byId(id));
    return data.project;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const previewStages = createAsyncThunk('projects/preview', async (sopTemplateId, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.projects.preview(sopTemplateId));
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const createProject = createAsyncThunk('projects/create', async (payload, thunkApi) => {
  try {
    const { data } = await api.post(endpoints.projects.root, payload);
    return data.project;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

const initialState = {
  items: [],
  summary: [],
  current: null,
  pagination: null,
  status: 'idle',
  error: null,
  createStatus: 'idle',
  preview: { data: null, status: 'idle', error: null },
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    clearPreview(state) { state.preview = initialState.preview; },
    clearProjectsError(state) { state.error = null; state.createStatus = 'idle'; },
    applyStageUpdate(state, action) {
      if (!state.current) return;
      const { stage, progress } = action.payload;
      state.current.stages = state.current.stages.map((s) =>
        s.id === stage.id ? { ...s, ...stage, _optimistic: false } : s,
      );
      if (progress) state.current.progress = progress;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjects.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.items;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      .addCase(fetchProjectSummary.fulfilled, (state, action) => { state.summary = action.payload; })

      .addCase(fetchProject.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchProject.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.current = action.payload;
      })
      .addCase(fetchProject.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      .addCase(previewStages.pending, (state) => {
        state.preview = { data: null, status: 'loading', error: null };
      })
      .addCase(previewStages.fulfilled, (state, action) => {
        state.preview = { data: action.payload, status: 'succeeded', error: null };
      })
      .addCase(previewStages.rejected, (state, action) => {
        state.preview = { data: null, status: 'failed', error: action.payload };
      })

      .addCase(createProject.pending, (state) => { state.createStatus = 'loading'; state.error = null; })
      .addCase(createProject.fulfilled, (state, action) => {
        state.createStatus = 'succeeded';
        state.items.unshift(action.payload);
        state.current = action.payload;
      })
      .addCase(createProject.rejected, (state, action) => {
        state.createStatus = 'failed';
        state.error = action.payload;
      })

      .addCase('stages/updateStatus/pending', (state, action) => {
        if (!state.current) return;
        const { stageId, payload } = action.meta.arg;
        state.current.stages = state.current.stages.map((stage) =>
          stage.id === stageId
            ? {
                ...stage,
                status: payload.status,
                blocker: payload.blocker ?? null,
                holdReason: payload.holdReason ?? null,
                completionDate: payload.completionDate ?? null,
                remarks: payload.remarks ?? stage.remarks,
                _optimistic: true,
              }
            : stage,
        );
      })
      .addCase('stages/updateStatus/rejected', (state, action) => {
        if (!state.current) return;
        const { stageId, snapshot } = action.meta.arg;
        if (!snapshot) return;
        state.current.stages = state.current.stages.map((stage) =>
          stage.id === stageId ? { ...snapshot, _optimistic: false } : stage,
        );
      });
  },
});

export const { clearPreview, clearProjectsError, applyStageUpdate } = projectsSlice.actions;
export default projectsSlice.reducer;

export const selectProjects = (state) => state.projects.items;
export const selectProjectSummary = (state) => state.projects.summary;
export const selectCurrentProject = (state) => state.projects.current;
export const selectProjectsStatus = (state) => state.projects.status;
export const selectProjectsError = (state) => state.projects.error;
export const selectCreateStatus = (state) => state.projects.createStatus;
export const selectPreview = (state) => state.projects.preview;

export const selectCurrentStages = (state) => state.projects.current?.stages ?? [];

export const selectProgressStats = createSelector([selectCurrentStages], (stages) => {
  const total = stages.length;
  const byStatus = stages.reduce((acc, stage) => {
    acc[stage.status] = (acc[stage.status] ?? 0) + 1;
    return acc;
  }, {});

  const completed = byStatus.COMPLETED ?? 0;

  return {
    total,
    completed,
    inProgress: byStatus.IN_PROGRESS ?? 0,
    blocked: byStatus.BLOCKED ?? 0,
    onHold: byStatus.ON_HOLD ?? 0,
    notStarted: byStatus.NOT_STARTED ?? 0,
    percentComplete: total ? Math.round((completed / total) * 100) : 0,
    atRisk: (byStatus.BLOCKED ?? 0) + (byStatus.ON_HOLD ?? 0),
  };
});

export const selectPortfolioStats = createSelector([selectProjectSummary], (projects) => {
  if (!projects.length) {
    return { projects: 0, averageProgress: 0, blocked: 0, completedStages: 0, totalStages: 0 };
  }
  const totals = projects.reduce(
    (acc, p) => ({
      blocked: acc.blocked + (p.progress?.blocked ?? 0),
      completedStages: acc.completedStages + (p.progress?.completed ?? 0),
      totalStages: acc.totalStages + (p.progress?.total ?? 0),
    }),
    { blocked: 0, completedStages: 0, totalStages: 0 },
  );

  return {
    projects: projects.length,
    averageProgress: Math.round(
      projects.reduce((sum, p) => sum + (p.progress?.percentComplete ?? 0), 0) / projects.length,
    ),
    ...totals,
  };
});
