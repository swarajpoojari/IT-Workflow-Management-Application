import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

export const fetchMySettings = createAsyncThunk('settings/fetchMine', async (_, { rejectWithValue }) => {
  try {
    return (await api.get(endpoints.settings.me)).data.settings;
  } catch (error) {
    return rejectWithValue(toRejection(error));
  }
});

export const saveMySettings = createAsyncThunk('settings/saveMine', async (patch, { rejectWithValue }) => {
  try {
    return (await api.patch(endpoints.settings.me, patch)).data.settings;
  } catch (error) {
    return rejectWithValue(toRejection(error));
  }
});

export const fetchSystemSettings = createAsyncThunk('settings/fetchSystem', async (_, { rejectWithValue }) => {
  try {
    return (await api.get(endpoints.settings.system)).data.settings;
  } catch (error) {
    return rejectWithValue(toRejection(error));
  }
});

export const saveSystemSettings = createAsyncThunk('settings/saveSystem', async (patch, { rejectWithValue }) => {
  try {
    return (await api.patch(endpoints.settings.system, patch)).data.settings;
  } catch (error) {
    return rejectWithValue(toRejection(error));
  }
});

// Applied optimistically so the toggle is instant; the save just confirms.
const applyTheme = (theme) => {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try { localStorage.setItem('itwf.theme', theme); } catch {  }
};

export const readStoredTheme = () => {
  try { return localStorage.getItem('itwf.theme') || 'system'; } catch { return 'system'; }
};

const slice = createSlice({
  name: 'settings',
  initialState: {
    mine: { theme: readStoredTheme(), density: 'comfortable', notifyAssignments: true, notifyBugs: true, notifySignoffs: true },
    system: {},
    status: 'idle',
    systemStatus: 'idle',
    error: null,
  },
  reducers: {
    setTheme(state, action) {
      state.mine.theme = action.payload;
      applyTheme(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMySettings.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchMySettings.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.mine = action.payload;
        applyTheme(action.payload.theme);
      })
      .addCase(fetchMySettings.rejected, (state, action) => {
        state.status = 'failed'; state.error = action.payload;
      })
      .addCase(saveMySettings.fulfilled, (state, action) => {
        state.mine = action.payload;
        applyTheme(action.payload.theme);
      })
      .addCase(fetchSystemSettings.pending, (state) => { state.systemStatus = 'loading'; })
      .addCase(fetchSystemSettings.fulfilled, (state, action) => {
        state.systemStatus = 'succeeded'; state.system = action.payload;
      })
      .addCase(fetchSystemSettings.rejected, (state, action) => {
        state.systemStatus = 'failed'; state.error = action.payload;
      })
      .addCase(saveSystemSettings.fulfilled, (state, action) => { state.system = action.payload; });
  },
});

export const { setTheme } = slice.actions;
export default slice.reducer;
