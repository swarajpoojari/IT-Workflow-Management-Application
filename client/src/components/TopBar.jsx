import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { resolvePageMeta } from '../app/pageMeta.js';
import { selectPageMeta } from '../features/ui/uiSlice.js';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead, toggleTray,
} from '../features/notifications/notificationsSlice.js';
import { logout, selectUser } from '../features/auth/authSlice.js';
// Theme switching now lives only in Settings → Appearance; no toggle here.
import { Avatar, AvatarFallback } from './ui/avatar.jsx';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu.jsx';

function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

function NotificationBell() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, unreadCount, open } = useSelector((s) => s.notifications);

  useEffect(() => {
    dispatch(fetchNotifications());
    // Light polling keeps the tray fresh without a websocket layer.
    const id = setInterval(() => dispatch(fetchNotifications()), 60000);
    return () => clearInterval(id);
  }, [dispatch]);

  const openItem = (n) => {
    if (!n.readAt) dispatch(markNotificationRead(n.id));
    dispatch(toggleTray(false));
    if (n.link) navigate(n.link);
  };

  return (
    <div className="bell-wrap">
      <button
        type="button" className="btn btn-ghost bell"
        aria-label="Notifications"
        title={unreadCount > 0 ? `Notifications — ${unreadCount} unread` : 'Notifications'}
        onClick={() => dispatch(toggleTray())}
      >
        ◔{unreadCount > 0 && <span className="bell-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="tray">
          <div className="tray-head">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className="link" onClick={() => dispatch(markAllNotificationsRead())}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && <p className="muted xsmall pad">Nothing yet.</p>}
          {items.map((n) => (
            <button
              key={n.id} type="button"
              className={`tray-item ${n.readAt ? '' : 'unread'}`}
              onClick={() => openItem(n)}
            >
              <strong>{n.title}</strong>
              {n.body && <span className="muted xsmall">{n.body}</span>}
              <span className="muted xsmall">{n.createdAt?.slice(0, 16).replace('T', ' ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectUser);

  const onLogout = async () => {
    await dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="profile-trigger">
          <Avatar size="sm">
            <AvatarFallback className="bg-brand-soft text-brand">
              {initialsOf(user?.fullName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="profile-menu-label">
          <strong>{user?.fullName}</strong>
          <small className="muted">{user?.email}</small>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>Profile</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onLogout}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar({ actionsRef }) {
  const { pathname } = useLocation();
  const override = useSelector(selectPageMeta);

  // A page may name its own subject; otherwise the route decides.
  const meta = override ?? resolvePageMeta(pathname);

  return (
    <header className="topbar">
      <div className="topbar-heading">
        <h1 className="topbar-title">{meta.title}</h1>
        {meta.description && <p className="topbar-sub">{meta.description}</p>}
      </div>

      <div className="row gap-sm topbar-controls">
        <div ref={actionsRef} className="page-head-actions" />
        <Link
          className="btn btn-ghost" to="/track" target="_blank" rel="noreferrer"
          title="Open the public tracking page — clients look a project up by BRD number, no login"
        >
          ◎ Track
        </Link>
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
