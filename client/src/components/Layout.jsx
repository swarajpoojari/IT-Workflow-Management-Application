import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout, selectUser } from '../features/auth/authSlice.js';
import { usePermissionChecker } from '../hooks/usePermission.js';
import { Toasts } from './Toasts.jsx';

const NAV = [
  { to: '/',           label: 'Dashboard',       icon: '▦' },
  { to: '/projects',   label: 'Projects',        icon: '◫', require: ['projects', 'read'] },
  { to: '/my-work',    label: 'My Work',         icon: '✦', require: ['stages', 'update_status'] },
  { to: '/sop',        label: 'SOP Builder',     icon: '⛭', require: ['sop', 'update'] },
  { to: '/users',      label: 'User Management', icon: '☰', require: ['users', 'read'] },
  { to: '/audit',      label: 'Audit Log',       icon: '⏱', require: ['audit', 'read'] },
];

export function Layout() {
  const user = useSelector(selectUser);
  const can = usePermissionChecker();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const visible = NAV.filter((item) => !item.require || can(item.require[0], item.require[1]));

  const onLogout = async () => {
    await dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">IT</span>
          <div>
            <strong>Workflow</strong>
            <small>Management System</small>
          </div>
        </div>

        <nav>
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="who">
            <div className="avatar">{user?.fullName?.slice(0, 1) ?? '?'}</div>
            <div className="who-text">
              <strong>{user?.fullName}</strong>
              <small>{user?.role?.name}</small>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>

      <Toasts />
    </div>
  );
}
