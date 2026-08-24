import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStageDetail, recordSignoff, updateStageStatus, addDocument } from '../features/stages/stagesSlice.js';
import { fetchStageBugs, raiseBug, transitionBug } from '../features/bugs/bugsSlice.js';
import { StatusModal } from './StatusModal.jsx';
import { Badge, ErrorNote, Field, Spinner, StatusBadge } from './ui/Bits.jsx';

const SEVERITY_TONE = { LOW: 'neutral', MEDIUM: 'info', HIGH: 'warn', CRITICAL: 'danger' };
const BUG_TONE = { OPEN: 'danger', REOPENED: 'danger', IN_PROGRESS: 'warn', FIXED: 'info', RETEST: 'info', CLOSED: 'success' };

// Mirrors the server's BUG_TRANSITIONS; only decides which buttons to show.
const NEXT_STATUSES = {
  OPEN: ['IN_PROGRESS', 'FIXED', 'CLOSED'],
  IN_PROGRESS: ['FIXED', 'OPEN'],
  FIXED: ['RETEST', 'REOPENED', 'CLOSED'],
  RETEST: ['CLOSED', 'REOPENED'],
  REOPENED: ['IN_PROGRESS', 'FIXED'],
  CLOSED: [],
};

const TABS = [
  ['status', 'Status'],
  ['evidence', 'Evidence'],
  ['signoff', 'Sign-off'],
  ['bugs', 'Bugs'],
  ['history', 'History'],
];

function RaiseBugForm({ projectId, stageId, onDone }) {
  const dispatch = useDispatch();
  const saving = useSelector((s) => s.bugs.saving);
  const [form, setForm] = useState({ title: '', description: '', severity: 'MEDIUM' });

  const submit = async (event) => {
    event.preventDefault();
    const result = await dispatch(raiseBug({ projectId, stageId, payload: form }));
    if (!result.error) {
      setForm({ title: '', description: '', severity: 'MEDIUM' });
      onDone?.();
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Title" required>
        <input
          required minLength={4} value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="What is broken?"
        />
      </Field>
      <Field label="Detail">
        <textarea
          rows={3} value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Steps to reproduce, expected vs actual"
        />
      </Field>
      <Field label="Severity">
        <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <button className="btn primary" type="submit" disabled={saving}>
        {saving ? 'Raising…' : 'Raise bug'}
      </button>
    </form>
  );
}

function BugCard({ bug, projectId, stageId, canResolve, canClose }) {
  const dispatch = useDispatch();
  const saving = useSelector((s) => s.bugs.saving);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  const move = (status) => {
    // The server requires a note when closing; ask for it rather than 422.
    if (status === 'CLOSED' && !note.trim()) {
      setOpen(true);
      return;
    }
    dispatch(transitionBug({ projectId, bugId: bug.id, stageId, payload: { status, note: note || undefined } }));
    setNote('');
  };

  const allowed = (NEXT_STATUSES[bug.status] ?? []).filter((next) =>
    next === 'CLOSED' || next === 'REOPENED' || next === 'RETEST' ? canClose : canResolve,
  );

  return (
    <div className="bug-card">
      <div className="bug-head">
        <div>
          <span className="bug-ref">{bug.reference}</span>
          <strong>{bug.title}</strong>
        </div>
        <div className="row gap-sm">
          <Badge tone={SEVERITY_TONE[bug.severity]}>{bug.severity}</Badge>
          <Badge tone={BUG_TONE[bug.status]}>{bug.status.replace('_', ' ')}</Badge>
        </div>
      </div>

      {bug.description && <p className="muted small">{bug.description}</p>}
      <p className="muted xsmall">
        Raised by {bug.raisedByName}
        {bug.assignedToName ? ` · assigned to ${bug.assignedToName}` : ''}
        {bug.reopenCount > 0 ? ` · reopened ${bug.reopenCount}×` : ''}
      </p>

      {allowed.length > 0 && (
        <>
          {open && (
            <input
              autoFocus placeholder="Closing note (required)"
              value={note} onChange={(e) => setNote(e.target.value)}
            />
          )}
          <div className="row gap-sm wrap">
            {allowed.map((next) => (
              <button
                key={next} type="button" className="btn tiny" disabled={saving}
                onClick={() => move(next)}
              >
                → {next.replace('_', ' ').toLowerCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function StageDrawer({ projectId, stageId, onClose }) {
  const dispatch = useDispatch();
  const detail = useSelector((s) => s.stages.detail);
  const status = useSelector((s) => s.stages.detailStatus);
  const signingOff = useSelector((s) => s.stages.signingOff);
  const bugError = useSelector((s) => s.bugs.error);
  const bugs = useSelector((s) => s.bugs.byStage[stageId] ?? []);
  const openCount = useSelector((s) => s.bugs.openCount[stageId]);

  const [tab, setTab] = useState('status');
  const [statusModal, setStatusModal] = useState(false);
  const [signoffNote, setSignoffNote] = useState('');
  const [evidence, setEvidence] = useState({ fileName: '', fileUrl: '', docType: 'LINK', notes: '' });

  useEffect(() => {
    if (stageId) dispatch(fetchStageDetail({ projectId, stageId }));
  }, [dispatch, projectId, stageId]);

  const stage = detail?.stage;
  const isTesting = stage?.stageType === 'TESTING';

  useEffect(() => {
    if (isTesting) dispatch(fetchStageBugs({ projectId, stageId }));
  }, [dispatch, projectId, stageId, isTesting]);

  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  if (status === 'loading' || !stage) {
    return (
      <aside className="drawer" role="dialog" aria-label="Stage detail">
        <Spinner label="Loading stage…" />
      </aside>
    );
  }

  const allowed = detail.permissions.allowed;
  const may = (action) => allowed.includes(action);
  const blockers = detail.completionBlockers;
  const liveOpenCount = openCount ?? blockers.openBugs;

  const submitStatus = async (payload) => {
    const snapshot = { ...stage };
    const result = await dispatch(updateStageStatus({ projectId, stageId, payload, snapshot }));
    setStatusModal(false);
    if (!result.error) dispatch(fetchStageDetail({ projectId, stageId }));
  };

  const submitSignoff = async (decision) => {
    const result = await dispatch(recordSignoff({ projectId, stageId, payload: { decision, note: signoffNote } }));
    if (!result.error) setSignoffNote('');
  };

  const submitEvidence = async (event) => {
    event.preventDefault();
    const result = await dispatch(addDocument({ projectId, stageId, payload: evidence }));
    if (!result.error) {
      setEvidence({ fileName: '', fileUrl: '', docType: 'LINK', notes: '' });
      dispatch(fetchStageDetail({ projectId, stageId }));
    }
  };

  return (
    <aside className="drawer" role="dialog" aria-label={`Stage ${stage.name}`}>
      <header className="drawer-head">
        <div>
          <p className="muted xsmall">Stage {stage.sequence} · {stage.stageType.toLowerCase()}</p>
          <h2>{stage.name}</h2>
          <div className="row gap-sm">
            <StatusBadge status={stage.status} />
            {!stage.clientVisible && <Badge tone="neutral">Internal</Badge>}
            {stage.requiresSignoff && <Badge tone="info">Sign-off required</Badge>}
            {isTesting && liveOpenCount > 0 && <Badge tone="danger">{liveOpenCount} open</Badge>}
          </div>
        </div>
        <button className="btn ghost" type="button" onClick={onClose} aria-label="Close">✕</button>
      </header>

      {stage.description && <p className="muted small drawer-desc">{stage.description}</p>}

      {/* Why the stage cannot be completed, stated before anyone tries. */}
      {!blockers.canComplete && stage.status !== 'COMPLETED' && (
        <div className="callout warn">
          <strong>Cannot complete yet.</strong>
          <ul>
            {liveOpenCount > 0 && <li>{liveOpenCount} bug{liveOpenCount === 1 ? '' : 's'} still open on this stage.</li>}
            {blockers.signoffRequired && blockers.signoffDecision !== 'APPROVED' && (
              <li>An approved sign-off is required{blockers.signoffDecision === 'REJECTED' ? ' (currently rejected).' : '.'}</li>
            )}
          </ul>
        </div>
      )}

      <nav className="drawer-tabs">
        {TABS.filter(([key]) => (key === 'bugs' ? isTesting : true)).map(([key, label]) => (
          <button
            key={key} type="button"
            className={`drawer-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            {key === 'bugs' && liveOpenCount > 0 && <span className="pill">{liveOpenCount}</span>}
          </button>
        ))}
      </nav>

      <div className="drawer-body">
        {tab === 'status' && (
          <div className="stack">
            <dl className="field-grid">
              <div><dt>Owner</dt><dd>{stage.assigneeName ?? '—'}</dd></div>
              <div><dt>Due</dt><dd>{stage.dueDate ?? '—'}</dd></div>
              <div><dt>Started</dt><dd>{stage.startedAt ? stage.startedAt.slice(0, 10) : '—'}</dd></div>
              <div><dt>Completed</dt><dd>{stage.completionDate ?? '—'}</dd></div>
            </dl>
            {stage.blocker && <div className="callout danger"><strong>Blocked:</strong> {stage.blocker}</div>}
            {stage.holdReason && <div className="callout warn"><strong>On hold:</strong> {stage.holdReason}</div>}
            {stage.remarks && <p className="muted small">{stage.remarks}</p>}

            {may('update_status') ? (
              <button className="btn primary" type="button" onClick={() => setStatusModal(true)}>
                Update status
              </button>
            ) : (
              <p className="muted xsmall">Your role has no status permission on this stage.</p>
            )}
          </div>
        )}

        {tab === 'evidence' && (
          <div className="stack">
            {detail.documents.length === 0 && <p className="muted small">No evidence attached yet.</p>}
            {detail.documents.map((doc) => (
              <div key={doc.id} className="list-row">
                <div>
                  <strong>{doc.fileName}</strong> <Badge tone="neutral">v{doc.version}</Badge>
                  <p className="muted xsmall">{doc.uploadedByName} · {doc.uploadedAt?.slice(0, 10)}</p>
                </div>
                <a className="btn tiny" href={doc.fileUrl} target="_blank" rel="noreferrer">Open</a>
              </div>
            ))}

            {may('upload_evidence') && (
              <form className="stack bordered" onSubmit={submitEvidence}>
                <p className="muted xsmall">
                  Attaching evidence records the attachment only — it never changes the stage status.
                </p>
                <Field label="Name" required>
                  <input required value={evidence.fileName}
                    onChange={(e) => setEvidence({ ...evidence, fileName: e.target.value })} />
                </Field>
                <Field label="Link" required>
                  <input required value={evidence.fileUrl} placeholder="https://…"
                    onChange={(e) => setEvidence({ ...evidence, fileUrl: e.target.value })} />
                </Field>
                <button className="btn" type="submit">Attach evidence</button>
              </form>
            )}
          </div>
        )}

        {tab === 'signoff' && (
          <div className="stack">
            {detail.signoffs.length === 0 && <p className="muted small">No sign-off recorded.</p>}
            {detail.signoffs.map((s) => (
              <div key={s.id} className="list-row">
                <div>
                  <Badge tone={s.decision === 'APPROVED' ? 'success' : 'danger'}>{s.decision}</Badge>
                  <p className="muted xsmall">{s.signedByName} · {s.signedAt?.slice(0, 16).replace('T', ' ')}</p>
                  {s.note && <p className="small">{s.note}</p>}
                </div>
              </div>
            ))}

            {may('signoff') && stage.status !== 'COMPLETED' && (
              <div className="stack bordered">
                <Field label="Note">
                  <textarea rows={2} value={signoffNote} onChange={(e) => setSignoffNote(e.target.value)} />
                </Field>
                <div className="row gap-sm">
                  <button className="btn primary" type="button" disabled={signingOff}
                    onClick={() => submitSignoff('APPROVED')}>Approve</button>
                  <button className="btn danger" type="button" disabled={signingOff}
                    onClick={() => submitSignoff('REJECTED')}>Reject</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'bugs' && isTesting && (
          <div className="stack">
            <ErrorNote error={bugError} />
            {liveOpenCount === 0
              ? <div className="callout success">All bugs closed — this stage can be completed.</div>
              : <p className="muted small">{liveOpenCount} open of {bugs.length}. The stage stays open until every bug is closed.</p>}

            {bugs.map((bug) => (
              <BugCard
                key={bug.id} bug={bug} projectId={projectId} stageId={stageId}
                canResolve={may('resolve_bug')} canClose={may('close_bug')}
              />
            ))}

            {may('raise_bug') && (
              <details className="bordered">
                <summary>Raise a bug</summary>
                <RaiseBugForm projectId={projectId} stageId={stageId} />
              </details>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="stack">
            {detail.statusHistory.length === 0 && <p className="muted small">No status changes recorded.</p>}
            {detail.statusHistory.map((h) => (
              <div key={h.id} className="list-row">
                <div>
                  <span className="muted small">{h.fromStatus ?? '—'} → </span><strong>{h.toStatus}</strong>
                  <p className="muted xsmall">{h.changedByName} · {h.changedAt?.slice(0, 16).replace('T', ' ')}</p>
                  {h.remarks && <p className="small">{h.remarks}</p>}
                  {h.blocker && <p className="small">Blocker: {h.blocker}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {statusModal && (
        <StatusModal
          stage={{ ...stage, canComplete: blockers.canComplete }}
          onSubmit={submitStatus}
          onClose={() => setStatusModal(false)}
        />
      )}
    </aside>
  );
}
