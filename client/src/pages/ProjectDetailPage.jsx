import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { fetchProject, selectCurrentProject, selectProjectsStatus, selectProjectsError } from '../features/projects/projectsSlice.js';
import { assignStage } from '../features/stages/stagesSlice.js';
import { fetchUsers, fetchTeams, selectUsers, selectTeams } from '../features/users/usersSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { StageDrawer } from '../components/StageDrawer.jsx';
import { Badge, ErrorNote, Spinner, StatusBadge, EmptyState } from '../components/ui/Bits.jsx';
import { StageProgressBar } from '../components/ui/StageProgressBar.jsx';
import { usePageMeta } from '../hooks/usePageMeta.js';

const TABS = [
  ['overview', 'Overview'],
  ['assign', 'Assign'],
  ['workflow', 'Workflow'],
  ['team', 'Team'],
  ['documents', 'Documents'],
];

const DERIVED_TONE = {
  NOT_STARTED: 'neutral', IN_PROGRESS: 'accent', AT_RISK: 'red',
  ON_HOLD: 'amber', COMPLETED: 'green', CANCELLED: 'neutral',
};

function OverviewTab({ project, onOpenStage }) {
  const p = project.progress;
  const active = project.stages.find((s) => s.status === 'IN_PROGRESS')
    ?? project.stages.find((s) => s.status !== 'COMPLETED');
  const onTrack = project.stages.filter(
    (s) => s.status !== 'BLOCKED' && s.status !== 'ON_HOLD' && s.status !== 'COMPLETED',
  ).length;

  return (
    <div className="stack">
      <section className="card card-pad progress-card">
        <div className="progress-card-head">
          <div>
            <h3>Progress</h3>
            <p className="muted xsmall">{p.completed} of {p.total} stages complete</p>
          </div>
          <div className="progress-card-figure">
            <span className="progress-figure">{p.percentComplete}%</span>
            <small className="muted xsmall">Total completion</small>
          </div>
        </div>

        {/* One segment per stage. Hover names the stage and its owner. */}
        <StageProgressBar stages={project.stages} onSelect={onOpenStage} />

        <div className="mini-stats">
          <div className="mini-stat">
            <span className="mini-label">Stages completed</span>
            <span className="mini-value">{p.completed}<small> / {p.total}</small></span>
          </div>
          <div className="mini-stat is-accent">
            <span className="mini-label">Active stage</span>
            <span className="mini-value is-text">
              {active ? `Stage ${active.sequence}: ${active.name}` : 'All complete'}
            </span>
          </div>
          <div className="mini-stat is-green">
            <span className="mini-label">Completion rate</span>
            <span className="mini-value">{p.percentComplete}%</span>
          </div>
          <div className="mini-stat">
            <span className="mini-label">Stages on track</span>
            <span className="mini-value">{onTrack}<small> scheduled</small></span>
          </div>
        </div>
      </section>

      <section className="card card-pad">
        <h3>Project details</h3>
        <dl className="field-grid wide">
          <div><dt>Code</dt><dd className="mono">{project.code}</dd></div>
          <div><dt>BRD number</dt><dd className="mono">{project.brdNumber ?? '—'}</dd></div>
          <div><dt>Client</dt><dd>{project.clientName}</dd></div>
          <div><dt>Owner</dt><dd>{project.ownerName ?? '—'}</dd></div>
          <div><dt>SOP template</dt><dd>{project.sopTemplateName}</dd></div>
          <div><dt>SOP version</dt><dd>v{project.sopVersionNumber} <Badge tone="neutral">locked</Badge></dd></div>
          <div><dt>Start date</dt><dd>{project.startDate ?? '—'}</dd></div>
          <div><dt>Target end</dt><dd>{project.targetEndDate ?? '—'}</dd></div>
          <div><dt>Status</dt><dd><Badge tone={DERIVED_TONE[p.derivedStatus]}>{p.derivedStatus.replace('_', ' ')}</Badge></dd></div>
        </dl>
        {project.description && <p className="muted small">{project.description}</p>}
      </section>

      <section className="card card-pad">
        <h3>Stage breakdown</h3>
        <div className="breakdown-row">
          {[['Completed', p.completed, 'green'], ['In progress', p.inProgress, 'accent'],
            ['Blocked', p.blocked, 'amber'], ['On hold', p.onHold, 'red'],
            ['Not started', p.notStarted, 'neutral']].map(([label, value, tone]) => (
            <div key={label} className={`breakdown-tile tone-tile-${tone}`}>
              <span className="breakdown-value">{value}</span>
              <span className="breakdown-label">{label}</span>
            </div>
          ))}
        </div>

        <ul className="stage-status-list">
          {project.stages.map((stage) => (
            <li key={stage.id}>
              <span className="seq">{stage.sequence}</span>
              <span className="grow">
                {stage.name}
                {stage.assigneeName && <small className="muted"> · {stage.assigneeName}</small>}
              </span>
              {!stage.clientVisible && <Badge tone="neutral">Internal</Badge>}
              <StatusBadge status={stage.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AssignTab({ project, onChanged }) {
  const dispatch = useDispatch();
  const users = useSelector(selectUsers);
  const teams = useSelector(selectTeams);
  const canAssign = usePermission('stages', 'assign');
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({});

  useEffect(() => {
    if (!canAssign) return;
    dispatch(fetchUsers({ isActive: true, limit: 100 }));
    dispatch(fetchTeams());
  }, [dispatch, canAssign]);

  if (!canAssign) {
    return <EmptyState title="No assignment permission" hint="Your role cannot assign stage owners." />;
  }

  const change = async (stage, patch) => {
    setBusyId(stage.id);
    setRowError((prev) => ({ ...prev, [stage.id]: null }));

    const result = await dispatch(assignStage({ projectId: project.id, stageId: stage.id, payload: patch }));
    setBusyId(null);

    if (result.error) {
      // The server owns these rules; show exactly what it said, on the row.
      setRowError((prev) => ({ ...prev, [stage.id]: result.payload?.message ?? 'Could not save that change.' }));
      return;
    }
    onChanged();
  };

  /**
   * A stage owned by a team draws its owner from that team. When the team has
   * nobody active, the whole active roster is offered instead — the server
   * applies the same fallback, so the dropdown never lies about what it accepts.
   */
  const ownerOptions = (stage) => {
    const team = teams.find((t) => t.id === stage.owningTeamId);
    const pool = (team?.members ?? []).filter((m) => m.isActive);
    if (!team) return { users: users.filter((u) => !u.isClientScope), reason: null };
    if (pool.length === 0) {
      return {
        users: users.filter((u) => !u.isClientScope),
        reason: `${team.name} has no active members — showing everyone.`,
      };
    }
    return { users: pool, reason: null };
  };

  return (
    <section className="card card-pad">
      <div className="card-head bare">
        <div>
          <h3>Stage owners, teams and dates</h3>
          <p className="muted xsmall">
            Assignment never changes a stage status. Each stage is owned by the team its SOP named,
            and only that team&apos;s active members can take it.
          </p>
        </div>
      </div>

      {project.startDate && (
        <p className="muted xsmall" style={{ marginBottom: 10 }}>
          Due dates cannot fall before the project start date, <b>{project.startDate}</b>.
        </p>
      )}

      <div className="table-wrap">
        <table className="table assign-table">
          <thead>
            <tr><th>#</th><th>Stage</th><th>Team</th><th>Owner</th><th>Due date</th><th>Status</th></tr>
          </thead>
          <tbody>
            {project.stages.map((stage) => {
              const { users: options, reason } = ownerOptions(stage);
              const error = rowError[stage.id];

              return (
                <tr key={stage.id} className={error ? 'has-row-error' : ''}>
                  <td>{stage.sequence}</td>
                  <td>
                    <strong>{stage.name}</strong>
                    {error && <div className="row-error">{error}</div>}
                  </td>
                  <td>
                    <select
                      value={stage.owningTeamId ?? ''} disabled={busyId === stage.id}
                      onChange={(e) => change(stage, {
                        owningTeamId: e.target.value ? Number(e.target.value) : null,
                        // Moving a stage to another team releases an owner who
                        // would no longer be eligible.
                        assignedTo: null,
                      })}
                    >
                      <option value="">No team</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={stage.assignedTo ?? ''} disabled={busyId === stage.id}
                      onChange={(e) => change(stage, { assignedTo: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Unassigned</option>
                      {options.map((u) => (
                        <option key={u.id} value={u.id}>{u.fullName}</option>
                      ))}
                    </select>
                    {reason && <div className="muted xsmall">{reason}</div>}
                  </td>
                  <td>
                    <input
                      type="date" value={stage.dueDate ?? ''} disabled={busyId === stage.id}
                      min={project.startDate ?? undefined}
                      onChange={(e) => change(stage, { dueDate: e.target.value || null })}
                    />
                  </td>
                  <td><StatusBadge status={stage.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WorkflowTab({ project, onOpenStage }) {
  const done = project.stages.filter((s) => s.status === 'COMPLETED').length;

  return (
    <section className="card card-pad">
      <div className="card-head bare">
        <div>
          <h3>Workflow journey</h3>
          <p className="muted xsmall">
            Open a stage to update status, attach evidence, sign off, or work the bug loop.
          </p>
        </div>
        <span className="stage-counter">{done} / {project.stages.length} complete</span>
      </div>

      <ol className="journey">
        {project.stages.map((stage, index) => {
          const overdue = stage.dueDate
            && stage.status !== 'COMPLETED'
            && stage.dueDate < new Date().toISOString().slice(0, 10);

          return (
            <li key={stage.id} className={`journey-step status-${stage.status.toLowerCase()}`}>
              <div className="journey-marker">
                <span className="journey-dot" />
                {index < project.stages.length - 1 && <span className="journey-line" />}
              </div>

              <button type="button" className="journey-card" onClick={() => onOpenStage(stage.id)}>
                <div className="journey-top">
                  <span className="journey-title">
                    <span className="journey-seq">{stage.sequence}</span>
                    <strong>{stage.name}</strong>
                  </span>
                  <StatusBadge status={stage.status} />
                </div>

                {stage.description && <p className="journey-desc">{stage.description}</p>}

                <div className="journey-meta">
                  <span className="journey-owner">
                    {stage.assigneeName
                      ? <><span className="owner-dot">{stage.assigneeName.slice(0, 1)}</span>{stage.assigneeName}</>
                      : <span className="muted">Unassigned</span>}
                  </span>
                  {stage.owningTeamName && <span className="journey-team">◌ {stage.owningTeamName}</span>}
                  {stage.dueDate && (
                    <span className={overdue ? 'journey-due is-overdue' : 'journey-due'}>
                      due {stage.dueDate}
                    </span>
                  )}
                  {stage.documentCount > 0 && (
                    <span className="journey-docs">▤ {stage.documentCount}</span>
                  )}
                </div>

                <div className="journey-tags">
                  {!stage.clientVisible && <Badge tone="neutral">Internal only</Badge>}
                  {stage.stageType !== 'GENERIC' && <Badge tone="accent">{stage.stageType}</Badge>}
                  {stage.requiresSignoff && <Badge tone="violet">Sign-off</Badge>}
                  {stage.requiresDocument && <Badge tone="accent">Document required</Badge>}
                </div>

                {stage.blocker && <p className="journey-flag is-blocked">Blocked: {stage.blocker}</p>}
                {stage.holdReason && <p className="journey-flag is-hold">On hold: {stage.holdReason}</p>}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TeamTab({ project }) {
  if (!project.members) {
    return <EmptyState title="Team not visible" hint="Your role cannot view project membership." />;
  }

  // Stages each person owns on this project — the reason they are on it.
  const stagesByUser = project.stages.reduce((acc, stage) => {
    if (stage.assignedTo) (acc[stage.assignedTo] ??= []).push(stage);
    return acc;
  }, {});

  return (
    <section className="card card-pad">
      <div className="card-head bare">
        <div>
          <h3>Project team</h3>
          <p className="muted xsmall">Everyone with a stake in this board, and what they own.</p>
        </div>
        <span className="stage-counter">{project.members.length} people</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Team</th><th>Role</th><th>Owns</th><th>On project</th><th>Status</th></tr>
          </thead>
          <tbody>
            {project.members.map((m) => {
              const owned = stagesByUser[m.userId] ?? [];
              return (
                <tr key={m.userId}>
                  <td>
                    <div className="user-cell">
                      <span className="user-avatar">{m.fullName.slice(0, 1)}</span>
                      <span>
                        <strong>{m.fullName}</strong>
                        <small className="muted">{m.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {m.team
                      ? <span className="chip">{m.team}</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="muted">{m.roleKey}</td>
                  <td>
                    {owned.length === 0
                      ? <span className="muted xsmall">—</span>
                      : (
                        <span className="owned-stages" title={owned.map((st) => st.name).join(', ')}>
                          {owned.length} stage{owned.length === 1 ? '' : 's'}
                        </span>
                      )}
                  </td>
                  <td><Badge tone={m.roleInProject === 'OWNER' ? 'accent' : 'neutral'}>{m.roleInProject}</Badge></td>
                  <td>{m.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DocumentsTab({ project, onOpenStage }) {
  const docs = useMemo(
    () => project.stages.flatMap((s) => (s.documents ?? []).map((d) => ({ ...d, stageName: s.name, stageId: s.id }))),
    [project.stages],
  );

  const missing = project.stages.filter((s) => s.requiresDocument && (s.documents ?? []).length === 0);

  if (!docs.length) {
    return (
      <section className="card card-pad">
        <EmptyState
          title="No attachments yet"
          hint="Open a stage from the Workflow tab and attach a file or link as evidence."
        />
        {missing.length > 0 && (
          <div className="warn-note" style={{ marginBottom: 0 }}>
            {missing.length} stage{missing.length === 1 ? '' : 's'} require a document before completing:{' '}
            {missing.map((s) => s.name).join(', ')}.
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="card card-pad">
      <div className="card-head bare">
        <div>
          <h3>Attachments</h3>
          <p className="muted xsmall">
            Every file and link attached as stage evidence. Attaching one never moves a stage.
          </p>
        </div>
        <span className="stage-counter">{docs.length} attached</span>
      </div>

      {missing.length > 0 && (
        <div className="warn-note">
          Still missing evidence on {missing.length} stage{missing.length === 1 ? '' : 's'}:{' '}
          {missing.map((s) => s.name).join(', ')}.
        </div>
      )}

      <ul className="attachment-list">
        {docs.map((doc) => (
          <li key={doc.id} className="attachment">
            <span className={`attachment-icon ${doc.docType === 'LINK' ? 'is-link' : 'is-file'}`} aria-hidden="true">
              {doc.docType === 'LINK' ? '🔗' : '▤'}
            </span>

            <div className="attachment-body">
              <a className="attachment-name" href={doc.fileUrl} target="_blank" rel="noreferrer">
                {doc.fileName}
              </a>
              <div className="attachment-meta">
                <button type="button" className="link" onClick={() => onOpenStage(doc.stageId)}>
                  {doc.stageName}
                </button>
                <span>v{doc.version}</span>
                <span>{doc.uploadedByName}</span>
                {doc.uploadedAt && <span>{doc.uploadedAt.slice(0, 10)}</span>}
              </div>
              {doc.notes && <p className="attachment-note">{doc.notes}</p>}
            </div>

            <a className="btn btn-ghost btn-sm" href={doc.fileUrl} target="_blank" rel="noreferrer">Open</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const project = useSelector(selectCurrentProject);
  const status = useSelector(selectProjectsStatus);
  const error = useSelector(selectProjectsError);

  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('overview');
  const openStageId = params.get('stage') ? Number(params.get('stage')) : null;

  useEffect(() => { dispatch(fetchProject(id)); }, [dispatch, id]);

  // The header names the project rather than the module.
  usePageMeta(
    project?.name,
    project ? `${project.code}${project.brdNumber ? ` · ${project.brdNumber}` : ''} · ${project.clientName}` : '',
  );

  const openStage = (stageId) => {
    setParams({ stage: String(stageId) }, { replace: true });
    setTab('workflow');
  };
  const closeStage = () => {
    setParams({}, { replace: true });
    dispatch(fetchProject(id));
  };

  if (status === 'loading' && !project) return <Spinner label="Loading project…" />;
  if (error && !project) return <ErrorNote error={error} />;
  if (!project) return null;

  return (
    <div className={`project-screen ${openStageId ? 'with-drawer' : ''}`}>
      <div className="project-main">
        <header className="project-hero">
          <Link to="/projects" className="back-link">← All projects</Link>

          <div className="project-hero-main">
            <div className="project-hero-title">
              <h2>{project.name}</h2>
              <Badge tone={DERIVED_TONE[project.progress.derivedStatus]}>
                {project.progress.derivedStatus.replace('_', ' ')}
              </Badge>
            </div>
            <div className="project-hero-pct">
              <span>{project.progress.percentComplete}%</span>
              <small className="muted xsmall">complete</small>
            </div>
          </div>

          {project.description && <p className="project-hero-desc">{project.description}</p>}

          <dl className="hero-facts">
            <div><dt>Engagement BRD</dt><dd className="mono">{project.brdNumber ?? project.code}</dd></div>
            <div><dt>Client</dt><dd>{project.clientName}</dd></div>
            <div><dt>Lead owner</dt><dd>{project.ownerName ?? '—'}</dd></div>
            <div><dt>Kickoff</dt><dd>{project.startDate ?? '—'}</dd></div>
            <div><dt>Target completion</dt><dd>{project.targetEndDate ?? '—'}</dd></div>
            <div><dt>SOP version</dt><dd>v{project.sopVersionNumber}</dd></div>
          </dl>
        </header>

        <nav className="tabs">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>

        <ErrorNote error={error} />

        {tab === 'overview' && <OverviewTab project={project} onOpenStage={openStage} />}
        {tab === 'assign' && <AssignTab project={project} onChanged={() => dispatch(fetchProject(id))} />}
        {tab === 'workflow' && <WorkflowTab project={project} onOpenStage={openStage} />}
        {tab === 'team' && <TeamTab project={project} />}
        {tab === 'documents' && <DocumentsTab project={project} onOpenStage={openStage} />}
      </div>

      {openStageId && <StageDrawer projectId={project.id} stageId={openStageId} onClose={closeStage} />}
    </div>
  );
}

export default ProjectDetailPage;
