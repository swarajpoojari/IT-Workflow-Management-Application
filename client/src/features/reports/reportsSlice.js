import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

export const fetchReports = createAsyncThunk('reports/fetch', async (_, { rejectWithValue }) => {
  try {
    return (await api.get(endpoints.reports.root)).data;
  } catch (error) {
    return rejectWithValue(toRejection(error));
  }
});

const slice = createSlice({
  name: 'reports',
  initialState: { data: null, status: 'idle', error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchReports.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchReports.fulfilled, (state, action) => { state.status = 'succeeded'; state.data = action.payload; })
      .addCase(fetchReports.rejected, (state, action) => { state.status = 'failed'; state.error = action.payload; });
  },
});

export default slice.reducer;
