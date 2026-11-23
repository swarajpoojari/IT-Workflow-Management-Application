import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { FolderKanban, TrendingUp, PauseCircle, AlertTriangle, Gauge } from 'lucide-react';
import {
  fetchProjects, selectProjects, selectProjectsStatus, selectProjectsError,
} from '../features/projects/projectsSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { Badge, ErrorNote, Spinner, EmptyState, KpiCard } from '../components/ui/Bits.jsx';

const STATUS_TONE = { ACTIVE: 'green', ON_HOLD: 'amber', COMPLETED: 'accent', CANCELLED: 'neutral' };

// Same vocabulary as the Dashboard's own KPIs (derived status, not the raw
// project.status column), so "at risk" means the same thing everywhere.
function useProjectKpis(projects) {
  return useMemo(() => {
    const by = (status) => projects.filter((p) => p.progress?.derivedStatus === status).length;
    return {
      total: projects.length,
      inProgress: by('IN_PROGRESS'),
      onHold: by('ON_HOLD'),
      atRisk: by('AT_RISK'),
      averageProgress: projects.length
        ? Math.round(projects.reduce((n, p) => n + (p.progress?.percentComplete ?? 0), 0) / projects.length)
        : 0,
    };
  }, [projects]);
}

export function ProjectsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const projects = useSelector(selectProjects);
  const status = useSelector(selectProjectsStatus);
  const error = useSelector(selectProjectsError);
  const canCreate = usePermission('projects', 'create');

  const [search, setSearch] = useState('');

  useEffect(() => { dispatch(fetchProjects({ limit: 50 })); }, [dispatch]);

  const kpis = useProjectKpis(projects);

  const filtered = useMemo(() => projects.filter(
    (p) => !search || `${p.code} ${p.name} ${p.clientName}`.toLowerCase().includes(search.toLowerCase()),
  ), [projects, search]);

  // The whole row is the target. A keyboard user gets the same behaviour via
  // Enter or Space, and the row carries the link role so it announces as one.
  const open = (id) => navigate(`/projects/${id}`);
  const onKeyDown = (event, id) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open(id);
    }
  };

  return (
    <>
      <div className="kpi-row">
        <KpiCard icon={FolderKanban} label="Total projects" value={kpis.total} tone="accent" />
        <KpiCard icon={TrendingUp} label="In progress" value={kpis.inProgress} tone="green" />
        <KpiCard icon={PauseCircle} label="On hold" value={kpis.onHold} tone="amber" />
        <KpiCard icon={AlertTriangle} label="At risk" value={kpis.atRisk} tone="red" />
        <KpiCard icon={Gauge} label="Avg. progress" value={`${kpis.averageProgress}%`} tone="violet" ring={kpis.averageProgress} />
      </div>

      <div className="row between" style={{ marginBottom: 16 }}>
        <input
          type="text" placeholder="Search projects…" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }}
        />
        {canCreate && (
          <Link
            to="/projects/new" className="btn"
            title="Create a project from a published SOP — its workflow stages are generated automatically"
          >
            + New project
          </Link>
        )}
      </div>

      <ErrorNote error={error} />

      <div className="card">
        {status === 'loading' && !projects.length ? (
          <Spinner label="Loading projects…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No projects"
            hint={canCreate ? 'Create one from a published SOP template to get started.' : 'Projects you are assigned to will appear here.'}
            action={canCreate ? <Link to="/projects/new" className="btn">+ New project</Link> : null}
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th><th>Project</th><th>Client</th><th>Owner</th>
                  <th>SOP version</th><th>Status</th><th>Target</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((project) => (
                  <tr
                    key={project.id}
                    className="row-link"
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${project.name}`}
                    onClick={() => open(project.id)}
                    onKeyDown={(e) => onKeyDown(e, project.id)}
                  >
                    <td className="mono">{project.code}</td>
                    <td>
                      <strong>{project.name}</strong>
                      {project.brdNumber && <div className="muted xsmall">{project.brdNumber}</div>}
                    </td>
                    <td className="muted">{project.clientName}</td>
                    <td className="muted">{project.ownerName ?? '—'}</td>
                    <td>
                      <Badge tone="violet">v{project.sopVersionNumber}</Badge>
                      <div className="muted xsmall">{project.sopTemplateName}</div>
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[project.status] ?? 'neutral'}>
                        {project.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="muted">{project.targetEndDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
