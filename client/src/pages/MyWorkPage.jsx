import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { api, toRejection } from '../api/axiosClient.js';
import { endpoints } from '../api/endpoints.js';
import { updateStageStatus } from '../features/stages/stagesSlice.js';
import { pushToast } from '../features/ui/uiSlice.js';
import { ListTodo, AlertTriangle, Clock3, CalendarX } from 'lucide-react';
import { EmptyState, Spinner, StatusBadge, ErrorNote, KpiCard } from '../components/ui/Bits.jsx';
import { StatusModal } from '../components/StatusModal.jsx';

const daysUntil = (isoDate) => {
  if (!isoDate) return null;
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86_400_000);
};

/**
 * One signal, not two: a BLOCKED stage is urgent regardless of its date, and
 * everything else reads its urgency from how close (or how overdue) its due
 * date is. "none" means no date and nothing blocking it — nothing to flag.
 */
function severityOf(stage) {
  if (stage.status === 'BLOCKED') return 'critical';
  const days = daysUntil(stage.dueDate);
  if (days === null) return 'none';
  if (days < 0) return 'critical';
  if (days <= 2) return 'high';
  if (days <= 7) return 'medium';
  return 'low';
}

const SEVERITY_CLASS = {
  critical: 'mywork-card is-critical',
  high: 'mywork-card is-high',
  medium: 'mywork-card is-medium',
  low: 'mywork-card is-low',
  none: 'mywork-card',
};

function dueLabel(stage) {
  const days = daysUntil(stage.dueDate);
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days}d`;
}

function WorkCard({ stage, busy, onOpenProject, onUpdateStatus }) {
  const severity = severityOf(stage);
  const due = dueLabel(stage);

  return (
    <article
      className={SEVERITY_CLASS[severity]}
      role="link"
      tabIndex={0}
      aria-label={`Open ${stage.projectName}`}
      onClick={() => onOpenProject(stage.projectId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenProject(stage.projectId); }
      }}
    >
      <div className="mywork-card-top">
        <div className="min-w-0">
          <p className="mywork-project">{stage.projectCode} · {stage.projectClientName}</p>
          <h3 className="mywork-stage-name">{stage.name}</h3>
        </div>
        <StatusBadge status={stage.status} />
      </div>

      <p className="mywork-project-title">{stage.projectName}</p>

      {stage.blocker && (
        <div className="mywork-flag">⛔ Blocked: {stage.blocker}</div>
      )}

      <div className="mywork-meta">
        {due && (
          <span className={`mywork-due ${severity === 'critical' || severity === 'high' ? 'is-urgent' : ''}`}>
            ◷ {due}
          </span>
        )}
        {!due && <span className="muted xsmall">No due date</span>}
        {stage.documentCount > 0 && <span className="muted xsmall">▤ {stage.documentCount} doc{stage.documentCount === 1 ? '' : 's'}</span>}
        {stage.owningTeamName && <span className="muted xsmall">◌ {stage.owningTeamName}</span>}
      </div>

      <div className="mywork-card-foot" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenProject(stage.projectId)}>
          Open board
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onUpdateStatus(stage)}>
          {busy ? 'Opening…' : 'Update status'}
        </button>
      </div>
    </article>
  );
}

export function MyWorkPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [stages, setStages] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);

  const load = () => {
    setStatus('loading');
    api.get(endpoints.me.assignments)
      .then(({ data }) => { setStages(data.stages); setStatus('succeeded'); })
      .catch((err) => { setError(toRejection(err)); setStatus('failed'); });
  };

  useEffect(load, []);

  const openStatusEditor = async (stage) => {
    setResolvingId(stage.id);
    try {
      const { data } = await api.get(endpoints.projects.stageDetail(stage.projectId, stage.id));
      setEditing({ ...stage, canComplete: data.completionBlockers.canComplete });
    } catch (err) {
      dispatch(pushToast(toRejection(err).message ?? 'Could not open this stage', 'error'));
    } finally {
      setResolvingId(null);
    }
  };

  const submitStatus = async (payload) => {
    setSaving(true);
    const result = await dispatch(updateStageStatus({
      projectId: editing.projectId, stageId: editing.id, payload,
    }));
    setSaving(false);
    if (result.error) return;

    const { stage: updated } = result.payload;
    setEditing(null);
    // A stage that just became COMPLETED drops off this list server-side
    // (the same filter /me/assignments itself applies) rather than sitting
    // here showing a status this page no longer tracks.
    setStages((prev) => (
      updated.status === 'COMPLETED'
        ? prev.filter((s) => s.id !== updated.id)
        : prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
    ));
  };

  const severityCounts = stages.reduce((acc, s) => {
    const sev = severityOf(s);
    acc[sev] = (acc[sev] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <ErrorNote error={error} />

      {status === 'loading' && !stages.length ? (
        <Spinner label="Loading your assignments…" />
      ) : stages.length === 0 ? (
        <div className="card">
          <EmptyState title="Nothing assigned" hint="Stages assigned to you will appear here." />
        </div>
      ) : (
        <>
          <div className="kpi-row">
            <KpiCard icon={ListTodo} label="Assigned to you" value={stages.length} tone="accent" />
            <KpiCard icon={AlertTriangle} label="Overdue / blocked" value={severityCounts.critical ?? 0} tone="red" />
            <KpiCard icon={Clock3} label="Due within 2 days" value={severityCounts.high ?? 0} tone="amber" />
            <KpiCard icon={CalendarX} label="No due date" value={severityCounts.none ?? 0} tone="neutral" />
          </div>

          <div className="mywork-grid">
            {stages.map((stage) => (
              <WorkCard
                key={stage.id}
                stage={stage}
                busy={resolvingId === stage.id}
                onOpenProject={(id) => navigate(`/projects/${id}`)}
                onUpdateStatus={openStatusEditor}
              />
            ))}
          </div>
        </>
      )}

      {editing && (
        <StatusModal
          stage={editing}
          busy={saving}
          onSubmit={submitStatus}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

export default MyWorkPage;
