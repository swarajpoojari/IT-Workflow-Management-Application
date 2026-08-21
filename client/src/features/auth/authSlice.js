import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, setAccessToken, refreshSession, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

const initialState = {
  user: null,
  status: 'idle',
  bootstrapStatus: 'idle',
  error: null,
};

export const login = createAsyncThunk('auth/login', async (credentials, thunkApi) => {
  try {
    const { data } = await api.post(endpoints.auth.login, credentials);
    setAccessToken(data.accessToken);
    return data.user;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const bootstrapSession = createAsyncThunk('auth/bootstrap', async (_, thunkApi) => {
  try {
    const data = await refreshSession();
    return data.user;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const logout = createAsyncThunk('auth/logout', async (_, thunkApi) => {
  try {
    await api.post(endpoints.auth.logout);
  } catch {
  }
  setAccessToken(null);
  return true;
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionExpired(state, action) {
      state.user = null;
      state.status = 'idle';
      state.error = action.payload ? { code: 'SESSION_EXPIRED', message: action.payload } : null;
      setAccessToken(null);
    },
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed';
        state.user = null;
        state.error = action.payload ?? { message: 'Login failed' };
      })
      .addCase(bootstrapSession.pending, (state) => {
        state.bootstrapStatus = 'loading';
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        state.bootstrapStatus = 'succeeded';
        state.user = action.payload;
      })
      .addCase(bootstrapSession.rejected, (state) => {
        state.bootstrapStatus = 'failed';
        state.user = null;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.status = 'idle';
        state.error = null;
      });
  },
});

export const { sessionExpired, clearAuthError } = authSlice.actions;
export default authSlice.reducer;

export const selectUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => Boolean(state.auth.user);
export const selectPermissions = (state) => state.auth.user?.permissions ?? [];
export const selectRoleKey = (state) => state.auth.user?.role?.key ?? null;
export const selectAuthStatus = (state) => state.auth.status;
export const selectAuthError = (state) => state.auth.error;
export const selectBootstrapped = (state) => state.auth.bootstrapStatus !== 'idle' && state.auth.bootstrapStatus !== 'loading';
