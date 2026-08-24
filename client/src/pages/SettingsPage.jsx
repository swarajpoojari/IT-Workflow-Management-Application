import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchMySettings, saveMySettings, fetchSystemSettings, saveSystemSettings, setTheme,
} from '../features/settings/settingsSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { ErrorNote, Field, Spinner } from '../components/ui/Bits.jsx';

export function SettingsPage() {
  const dispatch = useDispatch();
  const mine = useSelector((s) => s.settings.mine);
  const system = useSelector((s) => s.settings.system);
  const status = useSelector((s) => s.settings.status);
  const error = useSelector((s) => s.settings.error);
  const canReadSystem = usePermission('settings', 'read');
  const canWriteSystem = usePermission('settings', 'update');
  const [systemDraft, setSystemDraft] = useState({});

  useEffect(() => { dispatch(fetchMySettings()); }, [dispatch]);
  useEffect(() => { if (canReadSystem) dispatch(fetchSystemSettings()); }, [dispatch, canReadSystem]);
  useEffect(() => { setSystemDraft(system); }, [system]);

  const update = (patch) => dispatch(saveMySettings(patch));

  if (status === 'loading' && !mine) return <Spinner label="Loading settings…" />;

  return (
    <div className="stack narrow">
      <header className="page-head"><h1>Settings</h1></header>
      <ErrorNote error={error} />

      <section className="card">
        <h3>Appearance</h3>
        <Field label="Theme" hint="System follows your operating system setting.">
          <div className="row gap-sm">
            {['light', 'dark', 'system'].map((option) => (
              <button
                key={option} type="button"
                className={`btn ${mine.theme === option ? 'primary' : ''}`}
                onClick={() => { dispatch(setTheme(option)); update({ theme: option }); }}
              >
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Density">
          <select value={mine.density} onChange={(e) => update({ density: e.target.value })}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </Field>
      </section>

      <section className="card">
        <h3>Notifications</h3>
        {[['notifyAssignments', 'Stage assignments'], ['notifyBugs', 'Bug activity'], ['notifySignoffs', 'Sign-off decisions']]
          .map(([key, label]) => (
            <label key={key} className="check-row">
              <input
                type="checkbox" checked={Boolean(mine[key])}
                onChange={(e) => update({ [key]: e.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
      </section>

      {canReadSystem && (
        <section className="card">
          <h3>System</h3>
          {Object.keys(systemDraft).length === 0 && <p className="muted small">No system settings recorded.</p>}
          {Object.entries(systemDraft).map(([key, value]) => (
            <Field key={key} label={key}>
              <input
                value={value ?? ''} disabled={!canWriteSystem}
                onChange={(e) => setSystemDraft({ ...systemDraft, [key]: e.target.value })}
              />
            </Field>
          ))}
          {canWriteSystem && Object.keys(systemDraft).length > 0 && (
            <button className="btn primary" type="button" onClick={() => dispatch(saveSystemSettings(systemDraft))}>
              Save system settings
            </button>
          )}
        </section>
      )}
    </div>
  );
}

export default SettingsPage;
