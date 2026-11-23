import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setPageMeta, clearPageMeta } from '../features/ui/uiSlice.js';

/**
 * Overrides the header title and description for pages whose subject is not
 * known from the route alone — a project screen names the project. Clears on
 * unmount so the next route falls back to its static entry.
 */
export function usePageMeta(title, description) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!title) return undefined;
    dispatch(setPageMeta({ title, description: description ?? '' }));
    return () => dispatch(clearPageMeta());
  }, [dispatch, title, description]);
}
