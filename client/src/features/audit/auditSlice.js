import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

export const fetchAuditLog = createAsyncThunk('audit/fetch', async (params = {}, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.audit.root, { params });
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const fetchAuditFilters = createAsyncThunk('audit/filters', async (_, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.audit.filters);
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

const auditSlice = createSlice({
  name: 'audit',
  initialState: {
    items: [],
    pagination: null,
    filterOptions: { entityTypes: [], actions: [] },
    filters: { entityType: '', action: '', dateFrom: '', dateTo: '', page: 1 },
    status: 'idle',
    error: null,
  },
  reducers: {
    setAuditFilter(state, action) {
      state.filters = { ...state.filters, ...action.payload, page: action.payload.page ?? 1 };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuditLog.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchAuditLog.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.items;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchAuditLog.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(fetchAuditFilters.fulfilled, (state, action) => { state.filterOptions = action.payload; });
  },
});

export const { setAuditFilter } = auditSlice.actions;
export default auditSlice.reducer;

export const selectAuditItems = (state) => state.audit.items;
export const selectAuditPagination = (state) => state.audit.pagination;
export const selectAuditFilters = (state) => state.audit.filters;
export const selectAuditFilterOptions = (state) => state.audit.filterOptions;
export const selectAuditStatus = (state) => state.audit.status;
export const selectAuditError = (state) => state.audit.error;
