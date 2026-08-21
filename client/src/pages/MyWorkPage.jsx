import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { api, toRejection } from '../api/axiosClient.js';
import { endpoints } from '../api/endpoints.js';
import { Badge, EmptyState, Spinner, StatusBadge, ErrorNote } from '../components/ui/Bits.jsx';
import { selectUser } from '../features/auth/authSlice.js';

export function MyWorkPage() {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();

  const [stages, setStages] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    api.get(endpoints.me.assignments)
      .then(({ data }) => {
        if (cancelled) return;
        setStages(data.stages);
        setStatus('succeeded');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(toRejection(err));
        setStatus('failed');
      });

    return () => { cancelled = true; };
  }, [dispatch]);

  const overdue = (stage) => stage.dueDate && stage.dueDate < new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Work</h1>
          <p>
            Open stages assigned to {user?.fullName}, across every project. Status only ever changes
            when you change it — nothing here moves on its own.
          </p>
        </div>
      </div>

      <ErrorNote error={error} />

      <div className="card">
        {status === 'loading' ? (
          <Spinner label="Loading your assignments…" />
        ) : stages.length === 0 ? (
          <EmptyState title="Nothing assigned" hint="Stages assigned to you will appear here." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Stage</th><th>Status</th><th>Due</th><th>Docs</th><th /></tr>
              </thead>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage.id}>
                    <td>
                      <strong>{stage.name}</strong>
                      {stage.blocker && (
                        <div className="muted" style={{ fontSize: 12 }}>Blocked: {stage.blocker}</div>
                      )}
                    </td>
                    <td><StatusBadge status={stage.status} /></td>
                    <td>
                      {stage.dueDate ? (
                        <span className={overdue(stage) ? '' : 'muted'}>
                          {stage.dueDate} {overdue(stage) && <Badge tone="red">overdue</Badge>}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">{stage.documentCount || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/projects/${stage.projectId}`} className="btn btn-ghost btn-sm">Open board</Link>
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
