import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  fetchProjectSummary,
  selectProjectSummary,
  selectPortfolioStats,
} from '../features/projects/projectsSlice.js';
import { selectUser } from '../features/auth/authSlice.js';
import { ProgressBar, EmptyState, Badge } from '../components/ui/Bits.jsx';

export function DashboardPage() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const projects = useSelector(selectProjectSummary);
  const stats = useSelector(selectPortfolioStats);

  useEffect(() => { dispatch(fetchProjectSummary()); }, [dispatch]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome back, {user?.fullName?.split(' ')[0]}</h1>
          <p>
            Signed in as <strong>{user?.role?.name}</strong>
            {user?.clientName ? ` · ${user.clientName}` : ''} — you are seeing the
            {' '}{projects.length} project{projects.length === 1 ? '' : 's'} in your scope.
          </p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-value">{stats.projects}</div>
          <div className="stat-label">Projects</div>
        </div>
        <div className="stat">
          <div className="stat-value">{stats.averageProgress}%</div>
          <div className="stat-label">Average progress</div>
        </div>
        <div className="stat">
          <div className="stat-value">{stats.completedStages}/{stats.totalStages}</div>
          <div className="stat-label">Stages complete</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: stats.blocked ? 'var(--red)' : undefined }}>
            {stats.blocked}
          </div>
          <div className="stat-label">Blocked stages</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Projects</h2>
          <Link to="/projects" className="btn btn-ghost btn-sm">View all</Link>
        </div>

        {projects.length === 0 ? (
          <EmptyState
            title="No projects in scope"
            hint="Projects appear here once an admin creates one and assigns you to it."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th><th>Project</th><th>Client</th>
                  <th>SOP</th><th>Status</th><th style={{ minWidth: 180 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td className="mono">{project.code}</td>
                    <td>
                      <Link to={`/projects/${project.id}`}><strong>{project.name}</strong></Link>
                    </td>
                    <td className="muted">{project.clientName}</td>
                    <td><Badge tone="violet">v{project.sopVersionNumber}</Badge></td>
                    <td><Badge tone={project.status === 'ACTIVE' ? 'green' : 'neutral'}>{project.status}</Badge></td>
                    <td>
                      <ProgressBar
                        value={project.progress.percentComplete}
                        label={`${project.progress.completed}/${project.progress.total}`}
                      />
                    </td>
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
