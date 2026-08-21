import { useState } from 'react';
import { Modal } from './ui/Modal.jsx';
import { Field, StatusBadge } from './ui/Bits.jsx';

const STATUS_RULES = {
  NOT_STARTED: { label: 'Not started', requires: null },
  IN_PROGRESS: { label: 'In progress', requires: null },
  BLOCKED: {
    label: 'Blocked',
    requires: {
      field: 'blocker',
      label: 'What is blocking this stage?',
      placeholder: 'e.g. Awaiting firewall change approval (CHG-4471)',
      type: 'textarea',
      minLength: 3,
    },
  },
  ON_HOLD: {
    label: 'On hold',
    requires: {
      field: 'holdReason',
      label: 'Reason for the hold',
      placeholder: 'e.g. Client paused the rollout until Q4 budget is confirmed',
      type: 'textarea',
      minLength: 3,
    },
  },
  COMPLETED: {
    label: 'Completed',
    requires: {
      field: 'completionDate',
      label: 'Completion date',
      type: 'date',
    },
  },
};

export const STATUS_OPTIONS = Object.entries(STATUS_RULES).map(([value, rule]) => ({ value, label: rule.label }));

export function StatusModal({ stage, onSubmit, onClose, busy }) {
  const [status, setStatus] = useState(stage.status);
  const [values, setValues] = useState({
    blocker: stage.blocker ?? '',
    holdReason: stage.holdReason ?? '',
    completionDate: stage.completionDate ?? new Date().toISOString().slice(0, 10),
    remarks: '',
  });

  const rule = STATUS_RULES[status];
  const required = rule?.requires;

  const conditionalValue = required ? values[required.field]?.trim?.() ?? values[required.field] : null;
  const conditionalOk = !required || (conditionalValue && String(conditionalValue).length >= (required.minLength ?? 1));
  const unchanged = status === stage.status && status !== 'BLOCKED';

  const submit = (event) => {
    event.preventDefault();
    const payload = { status };
    if (required) payload[required.field] = values[required.field];
    if (values.remarks.trim()) payload.remarks = values.remarks.trim();
    onSubmit(payload);
  };

  return (
    <Modal
      title="Update stage status"
      subtitle={stage.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="status-form" className="btn" disabled={busy || !conditionalOk || unchanged}>
            {busy ? 'Saving…' : 'Update status'}
          </button>
        </>
      }
    >
      <form id="status-form" onSubmit={submit}>
        <div className="row" style={{ marginBottom: 16 }}>
          <span className="muted" style={{ fontSize: 13 }}>Current:</span>
          <StatusBadge status={stage.status} />
          {status !== stage.status && (
            <>
              <span className="muted">→</span>
              <StatusBadge status={status} />
            </>
          )}
        </div>

        <Field label="New status" required>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>

        {required && (
          <Field
            label={required.label}
            required
            hint={`Required by the API when moving to ${rule.label}. The request is rejected without it.`}
          >
            {required.type === 'textarea' ? (
              <textarea
                required autoFocus
                value={values[required.field]}
                onChange={(e) => setValues({ ...values, [required.field]: e.target.value })}
                placeholder={required.placeholder}
              />
            ) : (
              <input
                type={required.type} required autoFocus
                value={values[required.field]}
                onChange={(e) => setValues({ ...values, [required.field]: e.target.value })}
              />
            )}
          </Field>
        )}

        <Field label="Remarks" hint="Optional note, recorded in the stage's status history.">
          <textarea
            value={values.remarks}
            onChange={(e) => setValues({ ...values, remarks: e.target.value })}
            placeholder="Anything the next person should know…"
          />
        </Field>

        {unchanged && (
          <div className="warn-note" style={{ marginBottom: 0 }}>
            Pick a different status — the stage is already {rule.label.toLowerCase()}.
          </div>
        )}
      </form>
    </Modal>
  );
}
