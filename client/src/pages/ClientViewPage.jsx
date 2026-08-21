import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, Link } from 'react-router-dom';
import {
  fetchProject, selectCurrentProject, selectProjectsStatus,
  selectProjectsError, selectProgressStats,
} from '../features/projects/projectsSlice.js';
import { selectUser } from '../features/auth/authSlice.js';
import { Badge, ErrorNote, ProgressBar, Spinner, StatusBadge } from '../components/ui/Bits.jsx';

export function ClientViewPage() {
  const { id } = useParams();
  const dispatch = useDispatch();

  const project = useSelector(selectCurrentProject);
  const status = useSelector(selectProjectsStatus);
  const error = useSelector(selectProjectsError);
  const stats = useSelector(selectProgressStats);
  const user = useSelector(selectUser);

  useEffect(() => { dispatch(fetchProject(Number(id))); }, [dispatch, id]);

  if (status === 'loading' && !project) return <Spinner label="Loading project…" />;
  if (error) return <ErrorNote error={error} />;
  if (!project) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <Link to="/projects" className="muted" style={{ fontSize: 13 }}>← My projects</Link>
            <span className="mono muted">{project.code}</span>
          </div>
          <h1>{project.name}</h1>
          <p>{project.clientName} · Target completion {project.targetEndDate ?? 'TBC'}</p>
        </div>
        <div style={{ minWidth: 220 }}>
          <ProgressBar value={stats.percentComplete} label={`${stats.completed}/${stats.total} done`} />
        </div>
      </div>

      <div className="client-banner">
        <span style={{ fontSize: 18, lineHeight: 1 }}>👁</span>
        <div>
          <strong>Read-only view for {user?.clientName}</strong>
          <br />
          You are seeing the {stats.total} milestones shared with your organisation. Internal stages,
          documents and audit records are removed by the API before the response is sent — they are
          not present in this page's data at all.
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="stat-value">{stats.total}</div><div className="stat-label">Milestones</div></div>
        <div className="stat"><div className="stat-value" style={{ color: 'var(--green)' }}>{stats.completed}</div><div className="stat-label">Completed</div></div>
        <div className="stat"><div className="stat-value">{stats.percentComplete}%</div><div className="stat-label">Progress</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Project milestones</h2>
          <small>Updated by your delivery team</small>
        </div>
        <div className="card-pad stack">
          {project.stages.map((stage, index) => (
            <div key={stage.id} className={`stage-card is-${stage.status.toLowerCase().replace('_', '-')}`}>
              <div className="stage-top">
                <div className="stage-title">
                  <span className="stage-seq">{index + 1}</span>
                  <div>
                    <strong>{stage.name}</strong>
                    {stage.description && <div className="muted" style={{ fontSize: 12.5 }}>{stage.description}</div>}
                  </div>
                </div>
                <StatusBadge status={stage.status} />
              </div>
              {stage.completionDate && (
                <div className="stage-meta">
                  <span>Completed: <b>{stage.completionDate}</b></span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 14, textAlign: 'center' }}>
        Need something changed? Contact your delivery manager —{' '}
        <Badge tone="neutral">this view is read-only</Badge>
      </p>
    </>
  );
}
