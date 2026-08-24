import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

export const runSearch = createAsyncThunk('search/run', async (q, { rejectWithValue }) => {
  try {
    return (await api.get(endpoints.search.root(q))).data;
  } catch (error) {
    return rejectWithValue(toRejection(error));
  }
});

const slice = createSlice({
  name: 'search',
  initialState: { query: '', results: null, count: 0, status: 'idle', open: false },
  reducers: {
    setQuery(state, action) { state.query = action.payload; },
    openSearch(state, action) { state.open = action.payload ?? true; },
    clearSearch(state) { state.query = ''; state.results = null; state.count = 0; state.open = false; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runSearch.pending, (state) => { state.status = 'loading'; })
      .addCase(runSearch.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.results = action.payload.results;
        state.count = action.payload.count;
      })
      .addCase(runSearch.rejected, (state) => { state.status = 'failed'; state.results = null; state.count = 0; });
  },
});

export const { setQuery, openSearch, clearSearch } = slice.actions;
export default slice.reducer;
