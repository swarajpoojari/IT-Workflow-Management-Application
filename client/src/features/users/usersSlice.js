import { createAsyncThunk, createSlice, createSelector } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

export const fetchUsers = createAsyncThunk('users/fetchAll', async (params = {}, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.users.root, { params });
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const fetchRoles = createAsyncThunk('users/fetchRoles', async (_, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.roles.root);
    return data.roles;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const createUser = createAsyncThunk('users/create', async (payload, thunkApi) => {
  try {
    const { data } = await api.post(endpoints.users.root, payload);
    return data.user;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const updateUser = createAsyncThunk('users/update', async ({ id, patch }, thunkApi) => {
  try {
    const { data } = await api.patch(endpoints.users.byId(id), patch);
    return data.user;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const deactivateUser = createAsyncThunk('users/deactivate', async (user, thunkApi) => {
  try {
    const { data } = await api.patch(endpoints.users.deactivate(user.id));
    return data.user;
  } catch (error) {
    const rejection = toRejection(error);
    if (rejection.code === 'ACTIVE_ASSIGNMENTS') {
      return thunkApi.rejectWithValue({ ...rejection, blockedUser: user });
    }
    return thunkApi.rejectWithValue(rejection);
  }
});

export const activateUser = createAsyncThunk('users/activate', async (id, thunkApi) => {
  try {
    const { data } = await api.patch(endpoints.users.activate(id));
    return data.user;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const reassignAssignments = createAsyncThunk(
  'users/reassign',
  async ({ fromUserId, toUserId, stageIds }, thunkApi) => {
    try {
      const { data } = await api.post(endpoints.users.reassign(fromUserId), { toUserId, stageIds });
      return data;
    } catch (error) {
      return thunkApi.rejectWithValue(toRejection(error));
    }
  },
);

const initialState = {
  items: [],
  roles: [],
  pagination: null,
  status: 'idle',
  error: null,
  mutationStatus: 'idle',
  reassign: {
    user: null,
    assignments: [],
    status: 'idle',
    error: null,
    movedCount: 0,
  },
};

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    closeReassignModal(state) {
      state.reassign = initialState.reassign;
    },
    clearUsersError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => { state.status = 'loading'; state.error = null; })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.items;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })

      .addCase(fetchRoles.fulfilled, (state, action) => { state.roles = action.payload; })

      .addCase(createUser.pending, (state) => { state.mutationStatus = 'loading'; state.error = null; })
      .addCase(createUser.fulfilled, (state, action) => {
        state.mutationStatus = 'succeeded';
        state.items.unshift(action.payload);
      })
      .addCase(createUser.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.error = action.payload;
      })

      .addCase(updateUser.fulfilled, (state, action) => {
        state.items = state.items.map((u) => (u.id === action.payload.id ? action.payload : u));
      })

      .addCase(deactivateUser.pending, (state) => {
        state.mutationStatus = 'loading';
        state.reassign.error = null;
      })
      .addCase(deactivateUser.fulfilled, (state, action) => {
        state.mutationStatus = 'succeeded';
        state.items = state.items.map((u) => (u.id === action.payload.id ? action.payload : u));
        state.reassign = initialState.reassign;
      })
      .addCase(deactivateUser.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        if (action.payload?.code === 'ACTIVE_ASSIGNMENTS') {
          state.reassign = {
            user: action.payload.blockedUser ?? action.payload.details,
            assignments: action.payload.details?.assignments ?? [],
            status: 'idle',
            error: null,
            movedCount: 0,
          };
        } else {
          state.error = action.payload;
        }
      })

      .addCase(activateUser.fulfilled, (state, action) => {
        state.items = state.items.map((u) => (u.id === action.payload.id ? action.payload : u));
      })

      .addCase(reassignAssignments.pending, (state) => {
        state.reassign.status = 'loading';
        state.reassign.error = null;
      })
      .addCase(reassignAssignments.fulfilled, (state, action) => {
        state.reassign.status = 'succeeded';
        state.reassign.assignments = action.payload.remaining;
        state.reassign.movedCount = action.payload.movedCount;
      })
      .addCase(reassignAssignments.rejected, (state, action) => {
        state.reassign.status = 'failed';
        state.reassign.error = action.payload;
      });
  },
});

export const { closeReassignModal, clearUsersError } = usersSlice.actions;
export default usersSlice.reducer;

export const selectUsers = (state) => state.users.items;
export const selectUsersStatus = (state) => state.users.status;
export const selectUsersError = (state) => state.users.error;
export const selectRoles = (state) => state.users.roles;
export const selectReassignState = (state) => state.users.reassign;

export const selectReassignCandidates = createSelector(
  [selectUsers, selectReassignState],
  (users, reassign) => users.filter((u) => u.isActive && u.id !== reassign.user?.id),
);
