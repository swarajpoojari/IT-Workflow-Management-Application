import { createSlice, nanoid } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  // pageMeta is an override set by pages with a dynamic subject; null means
  // "use the static entry for this route".
  initialState: { toasts: [], pageMeta: null },
  reducers: {
    pushToast: {
      reducer(state, action) {
        state.toasts.push(action.payload);
      },
      prepare(message, tone = 'info') {
        return { payload: { id: nanoid(), message, tone } };
      },
    },
    dismissToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    setPageMeta(state, action) {
      state.pageMeta = action.payload;
    },
    clearPageMeta(state) {
      state.pageMeta = null;
    },
  },
});

export const { pushToast, dismissToast, setPageMeta, clearPageMeta } = uiSlice.actions;
export default uiSlice.reducer;
export const selectToasts = (state) => state.ui.toasts;
export const selectPageMeta = (state) => state.ui.pageMeta;
