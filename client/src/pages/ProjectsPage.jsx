import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  fetchProjects, selectProjects, selectProjectsStatus, selectProjectsError,
} from '../features/projects/projectsSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { Badge, ErrorNote, Spinner, EmptyState } from '../components/ui/Bits.jsx';

export function ProjectsPage() {
  const dispatch = useDispatch();
  const projects = useSelector(selectProjects);
  const status = useSelector(selectProjectsStatus);
  const error = useSelector(selectProjectsError);
  const canCreate = usePermission('projects', 'create');

  const [search, setSearch] = useState('');

  useEffect(() => { dispatch(fetchProjects({ limit: 50 })); }, [dispatch]);

  const filtered = projects.filter(
    (p) => !search || `${p.code} ${p.name} ${p.clientName}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p>
            You see only the projects in your scope — the API filters rows before they leave the
            server, so this list is never a client-side subset of something larger.
          </p>
        </div>
        <div className="row">
          <input type="text" placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
          {canCreate && <Link to="/projects/new" className="btn">+ New project</Link>}
        </div>
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
            <table>
              <thead>
                <tr><th>Code</th><th>Project</th><th>Client</th><th>Owner</th><th>SOP version</th><th>Status</th><th>Target</th></tr>
              </thead>
              <tbody>
                {filtered.map((project) => (
                  <tr key={project.id}>
                    <td className="mono">{project.code}</td>
                    <td><Link to={`/projects/${project.id}`}><strong>{project.name}</strong></Link></td>
                    <td className="muted">{project.clientName}</td>
                    <td className="muted">{project.ownerName ?? '—'}</td>
                    <td>
                      <Badge tone="violet">v{project.sopVersionNumber}</Badge>
                      <div className="muted" style={{ fontSize: 11.5 }}>{project.sopTemplateName}</div>
                    </td>
                    <td><Badge tone={project.status === 'ACTIVE' ? 'green' : 'neutral'}>{project.status}</Badge></td>
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
