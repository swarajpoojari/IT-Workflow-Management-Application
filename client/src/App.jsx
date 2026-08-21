import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes/index.jsx';
import { bootstrapSession, selectBootstrapped } from './features/auth/authSlice.js';

export default function App() {
  const dispatch = useDispatch();
  const bootstrapped = useSelector(selectBootstrapped);

  useEffect(() => { dispatch(bootstrapSession()); }, [dispatch]);

  if (!bootstrapped) {
    return <div className="page-loading">Restoring session…</div>;
  }

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
