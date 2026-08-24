import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { fetchProject, selectCurrentProject, selectProjectsStatus, selectProjectsError } from '../features/projects/projectsSlice.js';
import { assignStage } from '../features/stages/stagesSlice.js';
import { fetchUsers, selectUsers } from '../features/users/usersSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { StageDrawer } from '../components/StageDrawer.jsx';
import { Badge, ErrorNote, Field, ProgressBar, Spinner, StatusBadge, EmptyState } from '../components/ui/Bits.jsx';

const TABS = [
  ['overview', 'Overview'],
  ['assign', 'Assign'],
  ['workflow', 'Workflow'],
  ['team', 'Team'],
  ['documents', 'Documents'],
];

const DERIVED_TONE = {
  NOT_STARTED: 'neutral', IN_PROGRESS: 'info', AT_RISK: 'danger',
  ON_HOLD: 'warn', COMPLETED: 'success', CANCELLED: 'neutral',
};

function OverviewTab({ project }) {
  const p = project.progress;
  return (
    <div className="stack">
      <section className="card">
        <h3>Project details</h3>
        <dl className="field-grid wide">
          <div><dt>Code</dt><dd>{project.code}</dd></div>
          <div><dt>BRD number</dt><dd>{project.brdNumber ?? '—'}</dd></div>
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

      <section className="card">
        <h3>Overall progress</h3>
        {}
        {/* Percentage and status are derived server-side from the stage rows. */}
        <div className="progress-hero">
          <span className="progress-figure">{p.percentComplete}%</span>
          <div className="grow">
            <ProgressBar value={p.percentComplete} />
            <p className="muted xsmall">{p.completed} of {p.total} stages complete</p>
          </div>
        </div>
        <div className="stat-row">
          {[['Completed', p.completed, 'success'], ['In progress', p.inProgress, 'info'],
            ['Blocked', p.blocked, 'danger'], ['On hold', p.onHold, 'warn'],
            ['Not started', p.notStarted, 'neutral']].map(([label, value, tone]) => (
            <div key={label} className={`stat tone-${tone}`}>
              <span className="stat-value">{value}</span>
              <span className="muted xsmall">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Stage statuses</h3>
        <ul className="stage-status-list">
          {project.stages.map((stage) => (
            <li key={stage.id}>
              <span className="seq">{stage.sequence}</span>
              <span className="grow">{stage.name}</span>
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
  const canAssign = usePermission('stages', 'assign');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { if (canAssign) dispatch(fetchUsers({ isActive: true })); }, [dispatch, canAssign]);

  if (!canAssign) return <EmptyState title="No assignment permission" hint="Your role cannot assign stage owners." />;

  const change = async (stage, patch) => {
    setBusyId(stage.id);
    await dispatch(assignStage({ projectId: project.id, stageId: stage.id, payload: patch }));
    setBusyId(null);
    onChanged();
  };

  return (
    <section className="card">
      <h3>Stage owners and dates</h3>
      <p className="muted small">Assignment never changes a stage status.</p>
      <table className="table">
        <thead>
          <tr><th>#</th><th>Stage</th><th>Owner</th><th>Due date</th><th>Status</th></tr>
        </thead>
        <tbody>
          {project.stages.map((stage) => (
            <tr key={stage.id}>
              <td>{stage.sequence}</td>
              <td>{stage.name}</td>
              <td>
                <select
                  value={stage.assignedTo ?? ''} disabled={busyId === stage.id}
                  onChange={(e) => change(stage, { assignedTo: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </td>
              <td>
                <input
                  type="date" value={stage.dueDate ?? ''} disabled={busyId === stage.id}
                  onChange={(e) => change(stage, { dueDate: e.target.value || null })}
                />
              </td>
              <td><StatusBadge status={stage.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function WorkflowTab({ project, onOpenStage }) {
  return (
    <section className="card">
      <h3>Workflow journey</h3>
      <p className="muted small">Open a stage to update status, attach evidence, sign off, or work the bug loop.</p>
      <ol className="journey">
        {project.stages.map((stage, index) => (
          <li key={stage.id} className={`journey-step status-${stage.status.toLowerCase()}`}>
            <div className="journey-marker">
              <span className="journey-dot" />
              {index < project.stages.length - 1 && <span className="journey-line" />}
            </div>
            <button type="button" className="journey-card" onClick={() => onOpenStage(stage.id)}>
              <div className="row between">
                <strong>{stage.sequence}. {stage.name}</strong>
                <StatusBadge status={stage.status} />
              </div>
              <div className="row gap-sm wrap">
                {stage.assigneeName && <span className="muted xsmall">{stage.assigneeName}</span>}
                {stage.dueDate && <span className="muted xsmall">due {stage.dueDate}</span>}
                {!stage.clientVisible && <Badge tone="neutral">Internal</Badge>}
                {stage.stageType !== 'GENERIC' && <Badge tone="info">{stage.stageType}</Badge>}
                {stage.requiresSignoff && <Badge tone="violet">Sign-off</Badge>}
              </div>
              {stage.blocker && <p className="small danger-text">Blocked: {stage.blocker}</p>}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TeamTab({ project }) {
  if (!project.members) {
    return <EmptyState title="Team not visible" hint="Your role cannot view project membership." />;
  }
  return (
    <section className="card">
      <h3>Project team</h3>
      <table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>On project</th><th>Status</th></tr></thead>
        <tbody>
          {project.members.map((m) => (
            <tr key={m.userId}>
              <td>{m.fullName}</td>
              <td className="muted">{m.email}</td>
              <td>{m.roleKey}</td>
              <td><Badge tone={m.roleInProject === 'OWNER' ? 'info' : 'neutral'}>{m.roleInProject}</Badge></td>
              <td>{m.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DocumentsTab({ project, onOpenStage }) {
  const docs = useMemo(
    () => project.stages.flatMap((s) => (s.documents ?? []).map((d) => ({ ...d, stageName: s.name, stageId: s.id }))),
    [project.stages],
  );

  if (!docs.length) {
    return <EmptyState title="No documents yet" hint="Attach evidence from a stage in the Workflow tab." />;
  }

  return (
    <section className="card">
      <h3>All project documents</h3>
      <table className="table">
        <thead><tr><th>Document</th><th>Stage</th><th>Version</th><th>Uploaded by</th><th /></tr></thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.fileName}</td>
              <td>
                <button type="button" className="link" onClick={() => onOpenStage(doc.stageId)}>{doc.stageName}</button>
              </td>
              <td>v{doc.version}</td>
              <td className="muted">{doc.uploadedByName}</td>
              <td><a className="btn tiny" href={doc.fileUrl} target="_blank" rel="noreferrer">Open</a></td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <header className="page-head">
          <div>
            <Link to="/projects" className="muted xsmall">← Projects</Link>
            <h1>{project.name}</h1>
            <p className="muted small">
              {project.code}
              {project.brdNumber ? ` · ${project.brdNumber}` : ''} · {project.clientName}
            </p>
          </div>
          <div className="row gap-sm">
            <Badge tone={DERIVED_TONE[project.progress.derivedStatus]}>
              {project.progress.derivedStatus.replace('_', ' ')}
            </Badge>
            <Badge tone="neutral">{project.progress.percentComplete}%</Badge>
          </div>
        </header>

        <nav className="tabs">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>

        <ErrorNote error={error} />

        {tab === 'overview' && <OverviewTab project={project} />}
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
