import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { runSearch, setQuery, clearSearch } from '../features/search/searchSlice.js';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead, toggleTray,
} from '../features/notifications/notificationsSlice.js';
import { setTheme, saveMySettings } from '../features/settings/settingsSlice.js';
import { Badge } from './ui/Bits.jsx';

function SearchBox() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { query, results, count, status } = useSelector((s) => s.search);
  const [focused, setFocused] = useState(false);
  const timer = useRef(null);

  // Debounced so typing does not fire a request per keystroke.
  useEffect(() => {
    clearTimeout(timer.current);
    if (query.trim().length < 2) return undefined;
    timer.current = setTimeout(() => dispatch(runSearch(query.trim())), 250);
    return () => clearTimeout(timer.current);
  }, [dispatch, query]);

  const go = (path) => {
    dispatch(clearSearch());
    setFocused(false);
    navigate(path);
  };

  const show = focused && query.trim().length >= 2;

  return (
    <div className="searchbox">
      <input
        value={query}
        placeholder="Search projects, stages, people…"
        aria-label="Search"
        onChange={(e) => dispatch(setQuery(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {show && (
        <div className="search-results">
          {status === 'loading' && <p className="muted xsmall pad">Searching…</p>}
          {status === 'succeeded' && count === 0 && <p className="muted xsmall pad">No matches.</p>}

          {results?.projects?.length > 0 && (
            <>
              <p className="search-group">Projects</p>
              {results.projects.map((p) => (
                <button key={`p${p.id}`} type="button" className="search-hit" onClick={() => go(`/projects/${p.id}`)}>
                  <strong>{p.code}</strong> {p.name}
                  {p.brdNumber && <span className="muted xsmall"> · {p.brdNumber}</span>}
                </button>
              ))}
            </>
          )}

          {results?.stages?.length > 0 && (
            <>
              <p className="search-group">Stages</p>
              {results.stages.map((s) => (
                <button
                  key={`s${s.id}`} type="button" className="search-hit"
                  onClick={() => go(`/projects/${s.project_id}?stage=${s.id}`)}
                >
                  {s.name} <span className="muted xsmall">· {s.project_code} · {s.status.toLowerCase()}</span>
                </button>
              ))}
            </>
          )}

          {results?.bugs?.length > 0 && (
            <>
              <p className="search-group">Bugs</p>
              {results.bugs.map((b) => (
                <button
                  key={`b${b.id}`} type="button" className="search-hit"
                  onClick={() => go(`/projects/${b.project_id}?stage=${b.project_stage_id}`)}
                >
                  <strong>{b.reference}</strong> {b.title} <span className="muted xsmall">· {b.status.toLowerCase()}</span>
                </button>
              ))}
            </>
          )}

          {results?.users?.length > 0 && (
            <>
              <p className="search-group">People</p>
              {results.users.map((u) => (
                <button key={`u${u.id}`} type="button" className="search-hit" onClick={() => go('/users')}>
                  {u.full_name} <span className="muted xsmall">· {u.role_name}</span>
                </button>
              ))}
            </>
          )}

          {results?.sop?.length > 0 && (
            <>
              <p className="search-group">SOP templates</p>
              {results.sop.map((t) => (
                <button key={`t${t.id}`} type="button" className="search-hit" onClick={() => go('/sop')}>
                  {t.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
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
        type="button" className="btn ghost bell" aria-label="Notifications"
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

export function TopBar() {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.settings.mine.theme);

  const cycle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    dispatch(setTheme(next));
    dispatch(saveMySettings({ theme: next }));
  };

  return (
    <header className="topbar">
      <SearchBox />
      <div className="row gap-sm">
        <Link className="btn ghost" to="/track" target="_blank" rel="noreferrer" title="Public tracking page">
          ◎ Track
        </Link>
        <button type="button" className="btn ghost" onClick={cycle} aria-label="Toggle dark mode">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <NotificationBell />
      </div>
    </header>
  );
}
