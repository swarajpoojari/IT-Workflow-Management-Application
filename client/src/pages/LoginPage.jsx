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
import { Avatar, AvatarFallback } from '../components/ui/avatar.jsx';

const DEMO = [
  { role: 'Super Admin', email: 'superadmin@itwf.dev', blurb: 'Full system authority' },
  { role: 'Admin', email: 'admin@itwf.dev', blurb: 'Manages users and projects' },
  { role: 'IT Member', email: 'itmember@itwf.dev', blurb: 'Works assigned stages' },
  { role: 'Client / Ops', email: 'client@itwf.dev', blurb: 'Read-only, own projects' },
];

const HIGHLIGHTS = [
  ['⛭', 'SOP-driven delivery', 'Every project is generated from a published, immutable template.'],
  ['⛨', 'Permissions that hold', 'Server-enforced at every layer — not just hidden in the UI.'],
  ['⏱', 'Nothing goes unrecorded', 'An append-only audit trail for every change, by design.'],
];

function landingFor(user) {
  const can = (module, action) =>
    user?.permissions?.some((p) => p.module === module && p.action === action);

  if (can('sop', 'publish')) return '/sop';
  if (can('users', 'create')) return '/users';
  if (can('stages', 'update_status')) return '/my-work';
  return '/projects';
}

function initialsOf(name) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
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
    <div className="auth-shell">
      <section className="auth-visual">
        <div className="auth-visual-inner">
          <div className="auth-brand">
            <span className="brand-mark">IT</span>
            <div>
              <strong>IT Workflow</strong>
              <small>Management System</small>
            </div>
          </div>

          <h1 className="auth-visual-title">
            One source of truth for every engagement, start to go-live.
          </h1>

          <ul className="auth-highlights">
            {HIGHLIGHTS.map(([icon, title, body]) => (
              <li key={title}>
                <span className="auth-highlight-icon" aria-hidden="true">{icon}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-panel-head">
            <h2>Welcome back</h2>
            <p className="muted">Sign in to your workspace to continue.</p>
          </div>

          <ErrorNote error={error} onDismiss={() => dispatch(clearAuthError())} />

          <form onSubmit={onSubmit} className="auth-form">
            <Field label="Email address" required>
              <input
                type="email"
                autoComplete="username"
                required
                autoFocus
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

            <button type="submit" className="btn btn-block btn-lg" disabled={status === 'loading'}>
              {status === 'loading' ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {status === 'loading' && <Spinner label="Authenticating…" />}

          <div className="auth-demo">
            <div className="auth-demo-head">
              <span>Demo accounts</span>
              <span className="muted xsmall">password Passw0rd!</span>
            </div>
            <div className="auth-demo-list">
              {DEMO.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="auth-demo-row"
                  onClick={() => pickDemo(account.email)}
                >
                  <Avatar size="sm">
                    <AvatarFallback className="bg-brand-soft text-brand">
                      {initialsOf(account.role)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="auth-demo-text">
                    <strong>{account.role}</strong>
                    <small>{account.blurb}</small>
                  </span>
                  <span className="muted xsmall auth-demo-email">{account.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
