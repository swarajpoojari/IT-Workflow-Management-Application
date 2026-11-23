import { Link } from 'react-router-dom';

const STATUS_LABEL = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
};

export function StatusBadge({ status }) {
  return (
    <span className={`badge status-${status?.toLowerCase().replace('_', '-')}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

// One bar style used everywhere a completion percentage is shown: a single
// smooth gradient fill (never per-stage colour blocks — that's what the
// dedicated StageProgressBar is for) with thin divider ticks cut through it
// at each stage boundary, when the caller knows how many stages there are.
export function ProgressBar({ value, label, segments }) {
  const pct = Math.min(100, Math.max(0, value));
  const ticks = segments > 1
    ? Array.from({ length: segments - 1 }, (_, i) => ((i + 1) / segments) * 100)
    : [];

  return (
    <div className="progress" title={`${value}% complete`}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
        {ticks.map((left) => (
          <span key={left} className="progress-tick" style={{ left: `${left}%` }} />
        ))}
      </div>
      {/* label="" means the caller shows the figure itself; rendering the span
          anyway would reserve its min-width and squeeze the bar. */}
      {label !== '' && <span className="progress-label">{label ?? `${value}%`}</span>}
    </div>
  );
}

// Icon-tile KPI card: tinted icon square, value, label, optional sub-line and
// completion ring. Shared by every page that summarises its data as a KPI
// row (Dashboard, Projects, …) so the tone classes, the wave decoration and
// the ring all stay in one place instead of being re-implemented per page.
export function KpiCard({ icon: Icon, label, value, sub, tone = 'neutral', to, ring }) {
  const body = (
    <>
      <span className="kpi-icon" aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
      <span className="kpi-body">
        <span className="kpi-value">{value}</span>
        <span className="kpi-label">{label}</span>
        {sub && <span className="kpi-sub">{sub}</span>}
      </span>
      {ring !== undefined && (
        <span className="kpi-ring" style={{ '--kpi-pct': ring }} aria-hidden="true" />
      )}
    </>
  );

  const className = `kpi has-icon kpi-${tone}${to ? ' kpi-link' : ''}`;
  return to ? <Link to={to} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner" role="status">
      <div className="spinner-dot" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="error-note" role="alert">
      <div>
        <strong>{error.message}</strong>
        {Array.isArray(error.details) && (
          <ul>
            {error.details.map((detail, index) => (
              <li key={index}>
                {detail.field ? <code>{detail.field}</code> : null} {detail.message}
              </li>
            ))}
          </ul>
        )}
        {error.code && <small className="error-code">{error.code}</small>}
      </div>
      {onDismiss && <button type="button" className="icon-btn" onClick={onDismiss}>×</button>}
    </div>
  );
}

export function Field({ label, hint, required, error, children }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <em className="req" title="Required" aria-label="required">*</em>}
      </span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
