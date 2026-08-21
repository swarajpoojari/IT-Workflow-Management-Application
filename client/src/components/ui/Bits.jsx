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

export function ProgressBar({ value, label }) {
  return (
    <div className="progress" title={`${value}% complete`}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="progress-label">{label ?? `${value}%`}</span>
    </div>
  );
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
        {label} {required && <em className="req">required</em>}
      </span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
