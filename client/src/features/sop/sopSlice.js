import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

export const fetchTemplates = createAsyncThunk('sop/fetchTemplates', async (_, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.sop.root);
    return data.templates;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const fetchTemplate = createAsyncThunk('sop/fetchTemplate', async (id, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.sop.byId(id));
    return data.template;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const createTemplate = createAsyncThunk('sop/createTemplate', async (payload, thunkApi) => {
  try {
    const { data } = await api.post(endpoints.sop.root, payload);
    return data.template;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const addStage = createAsyncThunk('sop/addStage', async ({ templateId, stage }, thunkApi) => {
  try {
    await api.post(endpoints.sop.stages(templateId), stage);
    return await thunkApi.dispatch(fetchTemplate(templateId)).unwrap();
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const updateStage = createAsyncThunk('sop/updateStage', async ({ templateId, stageId, patch }, thunkApi) => {
  try {
    await api.patch(endpoints.sop.stage(templateId, stageId), patch);
    return await thunkApi.dispatch(fetchTemplate(templateId)).unwrap();
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const deleteStage = createAsyncThunk('sop/deleteStage', async ({ templateId, stageId }, thunkApi) => {
  try {
    await api.delete(endpoints.sop.stage(templateId, stageId));
    return await thunkApi.dispatch(fetchTemplate(templateId)).unwrap();
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const reorderStages = createAsyncThunk('sop/reorder', async ({ templateId, stageIds }, thunkApi) => {
  try {
    await api.put(endpoints.sop.reorder(templateId), { stageIds });
    return await thunkApi.dispatch(fetchTemplate(templateId)).unwrap();
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const publishTemplate = createAsyncThunk('sop/publish', async ({ templateId, changeNote }, thunkApi) => {
  try {
    const { data } = await api.post(endpoints.sop.publish(templateId), { changeNote });
    await thunkApi.dispatch(fetchTemplate(templateId));
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

const initialState = {
  templates: [],
  current: null,
  status: 'idle',
  // Deliberately separate from `status` above (which is fetchTemplates's — the
  // *list* — status). The builder page needs to know when its one template is
  // loading, independent of the library's list fetch; sharing one field meant
  // the list's fulfil could flip status to 'succeeded' while the template
  // itself was still in flight, skipping the spinner and rendering nothing.
  templateStatus: 'idle',
  error: null,
  mutationStatus: 'idle',
  lastPublished: null,
};

const sopSlice = createSlice({
  name: 'sop',
  initialState,
  reducers: {
    clearSopError(state) { state.error = null; },
    dismissPublishResult(state) { state.lastPublished = null; },
  },
  extraReducers: (builder) => {
    const mutations = [addStage, updateStage, deleteStage, reorderStages, publishTemplate, createTemplate];

    builder
      .addCase(fetchTemplates.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.templates = action.payload;
      })
      .addCase(fetchTemplates.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      .addCase(fetchTemplate.pending, (state) => { state.templateStatus = 'loading'; state.error = null; })
      .addCase(fetchTemplate.fulfilled, (state, action) => {
        state.templateStatus = 'succeeded';
        state.current = action.payload;
      })
      .addCase(fetchTemplate.rejected, (state, action) => {
        state.templateStatus = 'failed';
        state.error = action.payload;
      })

      .addCase(publishTemplate.fulfilled, (state, action) => {
        state.mutationStatus = 'succeeded';
        state.lastPublished = action.payload;
      })

      // New template isn't fetched again on the library page unless it
      // happens to remount, so it's added here directly — the builder can
      // navigate straight to it without the library going stale meanwhile.
      .addCase(createTemplate.fulfilled, (state, action) => {
        state.mutationStatus = 'succeeded';
        state.templates.push(action.payload);
      });

    // addCase only keeps the *last* registration for a given action type —
    // it does not throw on a second one, it silently discards the first.
    // publishTemplate and createTemplate each already have a fulfilled case
    // above that does more than set mutationStatus, so re-adding a generic
    // one for them here would quietly win and wipe out lastPublished / the
    // templates push. Only the thunks with no case yet get one.
    const genericFulfilled = mutations.filter((t) => t !== publishTemplate && t !== createTemplate);

    for (const thunk of mutations) {
      builder
        .addCase(thunk.pending, (state) => { state.mutationStatus = 'loading'; state.error = null; })
        .addCase(thunk.rejected, (state, action) => {
          state.mutationStatus = 'failed';
          state.error = action.payload;
        });
    }
    for (const thunk of genericFulfilled) {
      // Every mutation thunk needs its own 'succeeded' case — relying on the
      // *next* thunk's .pending to clear a previous 'loading' never actually
      // clears it after the session's last mutation, which left every
      // busy-gated button (Add/Edit/Delete stage, …) stuck disabled from the
      // first successful save onward.
      builder.addCase(thunk.fulfilled, (state) => { state.mutationStatus = 'succeeded'; });
    }
  },
});

export const { clearSopError, dismissPublishResult } = sopSlice.actions;
export default sopSlice.reducer;

export const selectTemplates = (state) => state.sop.templates;
export const selectCurrentTemplate = (state) => state.sop.current;
export const selectSopStatus = (state) => state.sop.status;
export const selectSopTemplateStatus = (state) => state.sop.templateStatus;
export const selectSopError = (state) => state.sop.error;
export const selectSopMutationStatus = (state) => state.sop.mutationStatus;
export const selectLastPublished = (state) => state.sop.lastPublished;
