import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  UserCircle, KeyRound, Bell, Palette, Building2, Users, ChevronDown,
} from 'lucide-react';
import {
  fetchMySettings, saveMySettings, fetchSystemSettings, saveSystemSettings, setTheme,
} from '../features/settings/settingsSlice.js';
import { changePassword, selectUser } from '../features/auth/authSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { ErrorNote, Field, Spinner } from '../components/ui/Bits.jsx';
import { Separator } from '../components/ui/separator.jsx';
import { formatDate } from '../lib/date.js';

// Keys the Settings page doesn't surface: the application's own name and its
// default SLA aren't something day-to-day settings should expose or let
// casual admins edit from here. Anything else in the table still renders
// normally, so adding a new system setting later needs no change here.
const HIDDEN_SYSTEM_KEYS = new Set(['app.name', 'app.defaultStageSlaDays']);

const SYSTEM_LABELS = {};
const humanise = (key) =>
  SYSTEM_LABELS[key]
  ?? key.split('.').pop().replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

const THEME_OPTIONS = [
  ['light', '☀', 'Light'],
  ['dark', '☾', 'Dark'],
  ['system', '◐', 'System'],
];

const NOTIFICATION_OPTIONS = [
  ['notifyAssignments', 'Stage assignments', 'When a stage is assigned to you.'],
  ['notifyBugs', 'Bug activity', 'When a bug you raised or own changes state.'],
  ['notifySignoffs', 'Sign-off decisions', 'When a stage you own is approved or sent back.'],
];

/** One collapsible card section — the shared shell every settings group uses. */
function SettingsSection({ icon: Icon, title, subtitle, defaultOpen = false, children }) {
  return (
    <details className="settings-row" open={defaultOpen}>
      <summary className="settings-summary">
        <span className="card-head-title">
          <span className="panel-icon is-accent" aria-hidden="true"><Icon size={16} /></span>
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="muted xsmall">{subtitle}</p>}
          </div>
        </span>
        <ChevronDown className="settings-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="settings-row-body">{children}</div>
    </details>
  );
}

function SecuritySection() {
  const dispatch = useDispatch();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSuccess(false);
    if (form.newPassword !== form.confirmPassword) {
      setError({ message: 'New password and confirmation do not match.' });
      return;
    }
    setBusy(true);
    setError(null);
    const result = await dispatch(changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    }));
    setBusy(false);
    if (result.error) {
      setError(result.payload ?? { message: 'Could not update the password.' });
      return;
    }
    setSuccess(true);
    setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  return (
    <SettingsSection icon={KeyRound} title="Security" subtitle="Change the password used to sign in.">
      <form className="stack" style={{ maxWidth: 360 }} onSubmit={submit}>
        <Field label="Current password" required>
          <input
            type="password" required value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
        </Field>
        <Field label="New password" required hint="Minimum 8 characters, with a letter and a digit.">
          <input
            type="password" required minLength={8} value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
        </Field>
        <Field label="Confirm new password" required>
          <input
            type="password" required value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
        </Field>

        <ErrorNote error={error} onDismiss={() => setError(null)} />
        {success && <p className="success-text">Password updated.</p>}

        <div>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </SettingsSection>
  );
}

export function SettingsPage() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const mine = useSelector((s) => s.settings.mine);
  const system = useSelector((s) => s.settings.system);
  const status = useSelector((s) => s.settings.status);
  const error = useSelector((s) => s.settings.error);
  const canReadSystem = usePermission('settings', 'read');
  const canWriteSystem = usePermission('settings', 'update');
  const canReadRoles = usePermission('roles', 'read');
  const canReadUsers = usePermission('users', 'read');
  const [systemDraft, setSystemDraft] = useState({});

  useEffect(() => { dispatch(fetchMySettings()); }, [dispatch]);
  useEffect(() => { if (canReadSystem) dispatch(fetchSystemSettings()); }, [dispatch, canReadSystem]);
  useEffect(() => { setSystemDraft(system); }, [system]);

  const update = (patch) => dispatch(saveMySettings(patch));

  if (status === 'loading' && !mine) return <Spinner label="Loading settings…" />;

  const visibleSystemKeys = Object.keys(systemDraft).filter((key) => !HIDDEN_SYSTEM_KEYS.has(key));

  return (
    <div className="settings-shell">
      <ErrorNote error={error} />

      <div className="card settings-card">
      <SettingsSection icon={UserCircle} title="Account" defaultOpen>
        <dl className="field-grid wide">
          <div><dt>Account ID</dt><dd className="mono">{user?.id}</dd></div>
          <div><dt>Member since</dt><dd>{formatDate(user?.createdAt) ?? '—'}</dd></div>
          <div><dt>Role</dt><dd>{user?.role?.name}</dd></div>
          <div><dt>Status</dt><dd>{user?.isActive ? 'Active' : 'Inactive'}</dd></div>
        </dl>
        <p className="muted xsmall" style={{ marginTop: 10 }}>
          To update your name, email or job title, contact an administrator.
        </p>
      </SettingsSection>

      <SecuritySection />

      <SettingsSection icon={Bell} title="Notifications" subtitle="What the app notifies you about.">
        <div className="flex flex-col gap-1">
          {NOTIFICATION_OPTIONS.map(([key, label, hint]) => (
            <label key={key} className="check-row" style={{ alignItems: 'flex-start' }}>
              <input
                type="checkbox" checked={Boolean(mine[key])}
                onChange={(e) => update({ [key]: e.target.checked })}
                style={{ marginTop: 2 }}
              />
              <span>
                <strong style={{ display: 'block', fontSize: 13.5 }}>{label}</strong>
                <small className="muted">{hint}</small>
              </span>
            </label>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection icon={Palette} title="Preferences" subtitle="How the app looks.">
        <Field label="Appearance" hint="System follows your operating system setting.">
          <div className="row gap-sm">
            {THEME_OPTIONS.map(([value, icon, label]) => (
              <button
                key={value} type="button"
                className={`btn ${mine.theme === value ? '' : 'btn-secondary'}`}
                onClick={() => { dispatch(setTheme(value)); update({ theme: value }); }}
                aria-pressed={mine.theme === value}
              >
                <span aria-hidden="true">{icon}</span> {label}
              </button>
            ))}
          </div>
        </Field>
      </SettingsSection>

      {canReadSystem && visibleSystemKeys.length > 0 && (
        <SettingsSection icon={Building2} title="Organisation" subtitle="Shared configuration. Changes here apply to every user.">
          {visibleSystemKeys.map((key) => (
            <Field key={key} label={humanise(key)}>
              <input
                value={systemDraft[key] ?? ''} disabled={!canWriteSystem}
                onChange={(e) => setSystemDraft({ ...systemDraft, [key]: e.target.value })}
              />
            </Field>
          ))}
          {canWriteSystem && (
            <button className="btn" type="button" onClick={() => dispatch(saveSystemSettings(systemDraft))}>
              Save system settings
            </button>
          )}
        </SettingsSection>
      )}

      {(canReadRoles || canReadUsers) && (
        <SettingsSection icon={Users} title="Team & Permissions" subtitle="Manage who has access and what they can do.">
          <div className="row gap-sm">
            {canReadUsers && <Link to="/users" className="btn btn-secondary">Users &amp; teams</Link>}
            {canReadRoles && <Link to="/roles" className="btn btn-secondary">Roles &amp; permissions</Link>}
          </div>
        </SettingsSection>
      )}
      </div>
    </div>
  );
}

export default SettingsPage;
