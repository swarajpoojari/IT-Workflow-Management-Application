import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  login,
  clearAuthError,
  selectAuthStatus,
  selectAuthError,
  selectIsAuthenticated,
  selectUser,
} from '../features/auth/authSlice.js';
import { ErrorNote, Field, Spinner } from '../components/ui/Bits.jsx';

const DEMO = [
  { role: 'Super Admin',  email: 'superadmin@itwf.dev' },
  { role: 'Admin',        email: 'admin@itwf.dev' },
  { role: 'IT Member',    email: 'itmember@itwf.dev' },
  { role: 'Client / Ops', email: 'client@itwf.dev' },
];

function landingFor(user) {
  const can = (module, action) =>
    user?.permissions?.some((p) => p.module === module && p.action === action);

  if (can('sop', 'publish')) return '/sop';
  if (can('users', 'create')) return '/users';
  if (can('stages', 'update_status')) return '/my-work';
  return '/projects';
}

export function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const status = useSelector(selectAuthStatus);
  const error = useSelector(selectAuthError);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const user = useSelector(selectUser);

  const [form, setForm] = useState({ email: '', password: '' });

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const from = location.state?.from?.pathname;
    const intended = from && from !== '/' ? from : null;

    navigate(intended ?? landingFor(user), { replace: true });
  }, [isAuthenticated, user, navigate, location.state]);

  const onSubmit = (event) => {
    event.preventDefault();
    dispatch(login(form));
  };

  const pickDemo = (email) => {
    dispatch(clearAuthError());
    setForm({ email, password: 'Passw0rd!' });
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">IT</div>
          <h1>IT Workflow Management</h1>
          <p>Sign in to your workspace</p>
        </div>

        <div className="card card-pad">
          <ErrorNote error={error} onDismiss={() => dispatch(clearAuthError())} />

          <form onSubmit={onSubmit}>
            <Field label="Email address" required>
              <input
                type="email"
                autoComplete="username"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@company.com"
              />
            </Field>

            <Field label="Password" required>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </Field>

            <button type="submit" className="btn btn-block" disabled={status === 'loading'}>
              {status === 'loading' ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {status === 'loading' && <Spinner label="Authenticating…" />}

          <div className="demo-accounts">
            <h3>Demo accounts · password Passw0rd!</h3>
            {DEMO.map((account) => (
              <button
                key={account.email}
                type="button"
                className="demo-row"
                onClick={() => pickDemo(account.email)}
              >
                <span>{account.role}</span>
                <small>{account.email}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
