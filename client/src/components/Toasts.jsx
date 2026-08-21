import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectToasts, dismissToast } from '../features/ui/uiSlice.js';

function Toast({ toast }) {
  const dispatch = useDispatch();

  useEffect(() => {
    const timer = setTimeout(() => dispatch(dismissToast(toast.id)), 5000);
    return () => clearTimeout(timer);
  }, [dispatch, toast.id]);

  return (
    <div className={`toast toast-${toast.tone}`} role="status">
      <span>{toast.message}</span>
      <button type="button" className="icon-btn" onClick={() => dispatch(dismissToast(toast.id))}>×</button>
    </div>
  );
}

export function Toasts() {
  const toasts = useSelector(selectToasts);
  return (
    <div className="toast-stack">
      {toasts.map((toast) => <Toast key={toast.id} toast={toast} />)}
    </div>
  );
}
