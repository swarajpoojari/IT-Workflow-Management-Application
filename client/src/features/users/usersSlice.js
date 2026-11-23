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
    // `modules` is the full catalog, so a role card can show "7 of 10 modules".
    return { roles: data.roles, modules: data.modules ?? [] };
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const createUser = createAsyncThunk('users/create', async (payload, thunkApi) => {
  try {
    const { data } = await api.post(endpoints.users.root, payload);
    // The temporary password comes back exactly once — keep the envelope.
    return data;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const fetchTeams = createAsyncThunk('users/fetchTeams', async (_, thunkApi) => {
  try {
    const { data } = await api.get(endpoints.teams.root);
    return data.teams;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const createTeam = createAsyncThunk('users/createTeam', async (payload, thunkApi) => {
  try {
    const { data } = await api.post(endpoints.teams.root, payload);
    return data.team;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const updateTeam = createAsyncThunk('users/updateTeam', async ({ id, patch }, thunkApi) => {
  try {
    const { data } = await api.patch(endpoints.teams.byId(id), patch);
    return data.team;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

export const deleteTeam = createAsyncThunk('users/deleteTeam', async (id, thunkApi) => {
  try {
    await api.delete(endpoints.teams.byId(id));
    return id;
  } catch (error) {
    return thunkApi.rejectWithValue(toRejection(error));
  }
});

// Permanent. The API refuses with HAS_HISTORY when the account appears in
// append-only records, and the confirm dialog surfaces that verbatim.
export const deleteUser = createAsyncThunk('users/delete', async (user, thunkApi) => {
  try {
    await api.delete(endpoints.users.byId(user.id));
    return user.id;
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
  modules: [],
  teams: [],
  teamsStatus: 'idle',
  teamError: null,
  pagination: null,
  status: 'idle',
  error: null,
  mutationStatus: 'idle',
  // Shown once, in the success panel, then dropped. Never re-fetchable.
  lastInvite: null,
  deleteError: null,
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
      state.deleteError = null;
      state.teamError = null;
    },
    clearInvite(state) {
      state.lastInvite = null;
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

      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.roles = action.payload.roles;
        state.modules = action.payload.modules;
      })

      .addCase(fetchTeams.pending, (state) => { state.teamsStatus = 'loading'; })
      .addCase(fetchTeams.fulfilled, (state, action) => {
        state.teamsStatus = 'succeeded';
        state.teams = action.payload;
      })
      .addCase(fetchTeams.rejected, (state, action) => {
        state.teamsStatus = 'failed';
        state.teamError = action.payload;
      })

      .addCase(createTeam.fulfilled, (state, action) => {
        state.teams.push({ ...action.payload, members: [] });
        state.teams.sort((a, b) => a.name.localeCompare(b.name));
        state.teamError = null;
      })
      .addCase(createTeam.rejected, (state, action) => { state.teamError = action.payload; })

      .addCase(updateTeam.fulfilled, (state, action) => {
        state.teams = state.teams.map((t) =>
          (t.id === action.payload.id ? { ...t, ...action.payload } : t));
        state.teamError = null;
      })
      .addCase(updateTeam.rejected, (state, action) => { state.teamError = action.payload; })

      .addCase(deleteTeam.fulfilled, (state, action) => {
        state.teams = state.teams.filter((t) => t.id !== action.payload);
        // Members keep existing; the server just unassigns them.
        state.items = state.items.map((u) =>
          (u.teamId === action.payload ? { ...u, teamId: null, team: null, teamName: null } : u));
      })
      .addCase(deleteTeam.rejected, (state, action) => { state.teamError = action.payload; })

      .addCase(deleteUser.pending, (state) => {
        state.mutationStatus = 'loading';
        state.deleteError = null;
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.mutationStatus = 'succeeded';
        state.items = state.items.filter((u) => u.id !== action.payload);
        state.deleteError = null;
      })
      .addCase(deleteUser.rejected, (state, action) => {
        state.mutationStatus = 'failed';
        state.deleteError = action.payload;
      })

      .addCase(createUser.pending, (state) => { state.mutationStatus = 'loading'; state.error = null; })
      .addCase(createUser.fulfilled, (state, action) => {
        state.mutationStatus = 'succeeded';
        state.items.unshift(action.payload.user);
        state.lastInvite = {
          user: action.payload.user,
          temporaryPassword: action.payload.temporaryPassword,
          invite: action.payload.invite,
        };
        const team = state.teams.find((t) => t.id === action.payload.user.teamId);
        if (team) team.memberCount += 1;
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

export const { closeReassignModal, clearUsersError, clearInvite } = usersSlice.actions;
export default usersSlice.reducer;

export const selectUsers = (state) => state.users.items;
export const selectUsersStatus = (state) => state.users.status;
export const selectMutationStatus = (state) => state.users.mutationStatus;
export const selectUsersError = (state) => state.users.error;
export const selectRoles = (state) => state.users.roles;
export const selectModules = (state) => state.users.modules;
export const selectTeams = (state) => state.users.teams;
export const selectTeamsStatus = (state) => state.users.teamsStatus;
export const selectTeamError = (state) => state.users.teamError;
export const selectLastInvite = (state) => state.users.lastInvite;
export const selectDeleteError = (state) => state.users.deleteError;
export const selectReassignState = (state) => state.users.reassign;

export const selectReassignCandidates = createSelector(
  [selectUsers, selectReassignState],
  (users, reassign) => users.filter((u) => u.isActive && u.id !== reassign.user?.id),
);
