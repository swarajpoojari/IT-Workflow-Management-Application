import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Layers, AlertTriangle, Bug } from 'lucide-react';
import { fetchReports } from '../features/reports/reportsSlice.js';
import { downloadCsv } from '../lib/csv.js';
import { ErrorNote, Spinner, EmptyState, KpiCard } from '../components/ui/Bits.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Avatar, AvatarFallback } from '../components/ui/avatar.jsx';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../components/ui/table.jsx';

const DERIVED_TONE = {
  NOT_STARTED: 'neutral', IN_PROGRESS: 'accent', AT_RISK: 'red',
  ON_HOLD: 'amber', COMPLETED: 'green', CANCELLED: 'neutral',
};

function initialsOf(name) {
  if (!name) return '•';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

/** Up to three initials-avatars for the team, then a "+N" overflow count. */
function TeamStack({ names }) {
  if (!names?.length) return <span className="text-muted-foreground">Unassigned</span>;
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  return (
    <div className="flex items-center" title={names.join(', ')}>
      <div className="flex -space-x-2">
        {shown.map((name) => (
          <Avatar key={name} size="sm" className="ring-2 ring-card">
            <AvatarFallback className="bg-brand-soft text-[10px] text-brand">{initialsOf(name)}</AvatarFallback>
          </Avatar>
        ))}
      </div>
      {extra > 0 && <span className="ml-1.5 text-xs text-muted-foreground">+{extra}</span>}
    </div>
  );
}

export function ReportsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const data = useSelector((s) => s.reports.data);
  const status = useSelector((s) => s.reports.status);
  const error = useSelector((s) => s.reports.error);

  useEffect(() => { dispatch(fetchReports()); }, [dispatch]);

  const openBugsBySeverity = useMemo(() => {
    if (!data) return {};
    return data.bugs
      .filter((b) => b.status !== 'CLOSED')
      .reduce((acc, b) => ({ ...acc, [b.severity]: (acc[b.severity] || 0) + b.total }), {});
  }, [data]);

  if (status === 'loading' && !data) return <Spinner label="Building reports…" />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return null;

  const exportProjects = () => {
    downloadCsv(`project-report-${new Date().toISOString().slice(0, 10)}.csv`, data.projects, [
      { label: 'Code', value: (p) => p.code },
      { label: 'Project', value: (p) => p.name },
      { label: 'Client', value: (p) => p.clientName },
      { label: 'Lead', value: (p) => p.ownerName ?? '' },
      { label: 'Team', value: (p) => (p.members ?? []).join('; ') },
      { label: 'Status', value: (p) => p.status },
      { label: 'Derived status', value: (p) => p.progress.derivedStatus },
      { label: 'Progress %', value: (p) => p.progress.percentComplete },
      { label: 'Target end date', value: (p) => p.targetEndDate ?? '' },
    ]);
  };

  return (
    <div className="stack">
      <div className="kpi-row">
        <KpiCard icon={FolderKanban} label="Projects" value={data.totals.projects} tone="accent" />
        <KpiCard icon={Layers} label="Stages" value={data.totals.stages} tone="neutral" />
        <KpiCard icon={AlertTriangle} label="Overdue" value={data.totals.overdue} tone="red" />
        <KpiCard icon={Bug} label="Open bugs" value={data.totals.openBugs} tone="amber" />
      </div>

      {/* The report itself: every ongoing project, its status, its lead and
          its team, in one table — exportable as the thing people actually
          came here for, rather than scattered across several small panels. */}
      <section className="card">
        <div className="card-head bare">
          <div>
            <h3>Project report</h3>
            <p className="muted xsmall">Every project in your scope, who leads it, and who's on it.</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={exportProjects}>
            ⭳ Export CSV
          </button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.projects.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => navigate(`/projects/${p.id}`)}
              >
                <TableCell>
                  <div className="font-medium text-foreground">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.code}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.clientName}</TableCell>
                <TableCell>{p.ownerName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                <TableCell><TeamStack names={p.members} /></TableCell>
                <TableCell>
                  <Badge variant={DERIVED_TONE[p.progress.derivedStatus]}>
                    {p.progress.derivedStatus.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell style={{ minWidth: 150 }}>
                  <div className="progress" title={`${p.progress.percentComplete}% complete`}>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${p.progress.percentComplete}%` }} />
                    </div>
                    <span className="progress-label">{p.progress.percentComplete}%</span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {p.targetEndDate ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <div className="grid grid-2">
        <section className="card card-pad">
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

        <section className="card card-pad">
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
                      <td>{w.blocked > 0 ? <Badge variant="red">{w.blocked}</Badge> : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card card-pad">
          <h3>Open bugs by severity</h3>
          {Object.keys(openBugsBySeverity).length === 0
            ? <EmptyState title="No open bugs" />
            : (
              <div className="row gap-sm">
                {Object.entries(openBugsBySeverity).map(([sev, count]) => (
                  <Badge key={sev} variant={sev === 'CRITICAL' ? 'red' : sev === 'HIGH' ? 'amber' : 'neutral'}>
                    {sev}: {count}
                  </Badge>
                ))}
              </div>
            )}
        </section>

        <section className="card card-pad">
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
