import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchMySettings, saveMySettings, fetchSystemSettings, saveSystemSettings, setTheme,
} from '../features/settings/settingsSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { ErrorNote, Field, Spinner } from '../components/ui/Bits.jsx';
import { Separator } from '../components/ui/separator.jsx';

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

  const visibleSystemKeys = Object.keys(systemDraft).filter((key) => !HIDDEN_SYSTEM_KEYS.has(key));

  return (
    <div className="stack narrow">
      <ErrorNote error={error} />

      <section className="card">
        <div className="card-head bare">
          <div>
            <h3>Preferences</h3>
            <p className="muted xsmall">How the app looks and what it notifies you about.</p>
          </div>
        </div>

        <div className="card-pad" style={{ paddingTop: 4 }}>
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

          <Separator className="my-4" />

          <span className="field-label" style={{ display: 'block', marginBottom: 10 }}>Notifications</span>
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
        </div>
      </section>

      {canReadSystem && visibleSystemKeys.length > 0 && (
        <section className="card card-pad">
          <h3>System</h3>
          <p className="muted xsmall" style={{ marginBottom: 10 }}>
            Shared configuration. Changes here apply to every user.
          </p>
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
        </section>
      )}
    </div>
  );
}

export default SettingsPage;
