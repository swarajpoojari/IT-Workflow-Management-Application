import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { fetchReports } from '../features/reports/reportsSlice.js';
import { Badge, ErrorNote, ProgressBar, Spinner, EmptyState } from '../components/ui/Bits.jsx';

const TONE = {
  NOT_STARTED: 'neutral', IN_PROGRESS: 'info', AT_RISK: 'danger',
  ON_HOLD: 'warn', COMPLETED: 'success', CANCELLED: 'neutral',
};

export function ReportsPage() {
  const dispatch = useDispatch();
  const data = useSelector((s) => s.reports.data);
  const status = useSelector((s) => s.reports.status);
  const error = useSelector((s) => s.reports.error);

  useEffect(() => { dispatch(fetchReports()); }, [dispatch]);

  if (status === 'loading' && !data) return <Spinner label="Building reports…" />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const openBugsBySeverity = data.bugs
    .filter((b) => b.status !== 'CLOSED')
    .reduce((acc, b) => ({ ...acc, [b.severity]: (acc[b.severity] || 0) + b.total }), {});

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="muted small">Aggregated across the projects you can see.</p>
        </div>
      </header>

      <section className="stat-row cards">
        {[['Projects', data.totals.projects], ['Stages', data.totals.stages],
          ['Overdue', data.totals.overdue], ['Open bugs', data.totals.openBugs]].map(([label, value]) => (
          <div key={label} className="card stat-card">
            <span className="stat-value big">{value}</span>
            <span className="muted xsmall">{label}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>Projects by derived status</h3>
        <div className="row gap-sm wrap">
          {Object.entries(data.projectsByStatus).map(([key, count]) => (
            <Badge key={key} tone={TONE[key]}>{key.replace('_', ' ')}: {count}</Badge>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Project progress</h3>
        <table className="table">
          <thead><tr><th>Code</th><th>Project</th><th>Client</th><th>Target</th><th>Progress</th></tr></thead>
          <tbody>
            {data.projects.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/projects/${p.id}`}>{p.code}</Link></td>
                <td>{p.name}</td>
                <td className="muted">{p.clientName}</td>
                <td className="muted">{p.targetEndDate ?? '—'}</td>
                <td style={{ minWidth: 160 }}>
                  <ProgressBar value={p.progress.percentComplete} />
                  <span className="muted xsmall">{p.progress.percentComplete}% · {p.progress.derivedStatus.replace('_', ' ').toLowerCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid-2">
        <section className="card">
          <h3>Overdue stages</h3>
          {data.overdueStages.length === 0
            ? <EmptyState title="Nothing overdue" hint="Every dated stage is on time." />
            : (
              <table className="table">
                <thead><tr><th>Project</th><th>Stage</th><th>Due</th><th>Owner</th></tr></thead>
                <tbody>
                  {data.overdueStages.map((s) => (
                    <tr key={s.id}>
                      <td>{s.project_code}</td><td>{s.name}</td>
                      <td className="danger-text">{s.due_date}</td>
                      <td className="muted">{s.assignee ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>

        <section className="card">
          <h3>Workload</h3>
          {data.workload.length === 0
            ? <EmptyState title="No open assignments" />
            : (
              <table className="table">
                <thead><tr><th>Member</th><th>Team</th><th>Open</th><th>Blocked</th></tr></thead>
                <tbody>
                  {data.workload.map((w) => (
                    <tr key={w.id}>
                      <td>{w.full_name}</td><td className="muted">{w.team ?? '—'}</td>
                      <td>{w.open_stages}</td>
                      <td>{w.blocked > 0 ? <Badge tone="danger">{w.blocked}</Badge> : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h3>Open bugs by severity</h3>
          {Object.keys(openBugsBySeverity).length === 0
            ? <EmptyState title="No open bugs" />
            : (
              <div className="row gap-sm wrap">
                {Object.entries(openBugsBySeverity).map(([sev, count]) => (
                  <Badge key={sev} tone={sev === 'CRITICAL' ? 'danger' : sev === 'HIGH' ? 'warn' : 'neutral'}>
                    {sev}: {count}
                  </Badge>
                ))}
              </div>
            )}
        </section>

        <section className="card">
          <h3>Average stage cycle time</h3>
          {data.cycleTime.length === 0
            ? <EmptyState title="Not enough completed stages yet" />
            : (
              <table className="table">
                <thead><tr><th>Stage</th><th>Avg days</th><th>Samples</th></tr></thead>
                <tbody>
                  {data.cycleTime.map((c) => (
                    <tr key={c.name}><td>{c.name}</td><td>{c.avg_days ?? '—'}</td><td className="muted">{c.samples}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>
      </div>
    </div>
  );
}

export default ReportsPage;
