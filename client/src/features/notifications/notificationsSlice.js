import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api, toRejection } from '../../api/axiosClient.js';
import { endpoints } from '../../api/endpoints.js';

export const fetchNotifications = createAsyncThunk(
  'notifications/fetch',
  async (_, { rejectWithValue }) => {
    try {
      return (await api.get(endpoints.notifications.root)).data;
    } catch (error) {
      return rejectWithValue(toRejection(error));
    }
  },
);

export const markNotificationRead = createAsyncThunk(
  'notifications/read',
  async (id, { rejectWithValue }) => {
    try {
      await api.patch(endpoints.notifications.read(id));
      return id;
    } catch (error) {
      return rejectWithValue(toRejection(error));
    }
  },
);

export const markAllNotificationsRead = createAsyncThunk(
  'notifications/readAll',
  async (_, { rejectWithValue }) => {
    try {
      return (await api.post(endpoints.notifications.readAll)).data;
    } catch (error) {
      return rejectWithValue(toRejection(error));
    }
  },
);

const slice = createSlice({
  name: 'notifications',
  initialState: { items: [], unreadCount: 0, status: 'idle', error: null, open: false },
  reducers: {
    toggleTray(state, action) {
      state.open = action.payload ?? !state.open;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.notifications;
        state.unreadCount = action.payload.unreadCount;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const item = state.items.find((n) => n.id === action.payload);
        if (item && !item.readAt) {
          item.readAt = new Date().toISOString();
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.items.forEach((n) => { n.readAt = n.readAt ?? new Date().toISOString(); });
        state.unreadCount = 0;
      });
  },
});

export const { toggleTray } = slice.actions;
export default slice.reducer;
export const selectUnreadCount = (state) => state.notifications.unreadCount;
