import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  FolderKanban, Clock, PauseCircle, AlertTriangle, Gauge,
  TrendingUp, Zap, PieChart as PieChartIcon, ListChecks, BellRing, Activity,
  FileCog, FilePlus,
  ChevronRight, ClipboardCheck, ChevronDown, Calendar,
  CirclePlus, CircleCheck, Pencil, Trash2, UserPlus, Upload, ArrowUpDown,
  Building2, Download,
} from 'lucide-react';
import {
  fetchProjectSummary,
  selectProjectSummary,
} from '../features/projects/projectsSlice.js';
import { fetchAuditLog, selectAuditItems } from '../features/audit/auditSlice.js';
import { usePermissionChecker } from '../hooks/usePermission.js';
import { useChartTheme, STATUS_COLOR, STATUS_LABEL } from '../components/charts/chartTheme.js';
import { EmptyState, KpiCard, ProgressBar } from '../components/ui/Bits.jsx';
import { usePageHeadingActions } from '../components/PageHeading.jsx';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.jsx';
import { createPortal } from 'react-dom';

/* ── Due-date pressure ──────────────────────────────────────────────────────
   Buckets run from the far future on the left to overdue on the right, so the
   series climbs as deadlines close in. The bar height is a weighted urgency
   score, not a raw count: one project due this week outranks three due in two
   months, which is the judgement a delivery lead actually makes.             */
const DUE_BUCKETS = [
  { key: 'later',   label: '60+ days',  min: 61,            max: Infinity, weight: 1 },
  { key: 'd60',     label: '31–60d',    min: 31,            max: 60,       weight: 2 },
  { key: 'd30',     label: '15–30d',    min: 15,            max: 30,       weight: 4 },
  { key: 'd14',     label: '8–14d',     min: 8,             max: 14,       weight: 7 },
  { key: 'd7',      label: 'Due ≤7d',   min: 0,             max: 7,        weight: 12 },
  { key: 'overdue', label: 'Overdue',   min: -Infinity,     max: -1,       weight: 20 },
];

const daysUntil = (isoDate) => {
  if (!isoDate) return null;
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86_400_000);
};

function buildDueSeries(projects) {
  const open = projects.filter(
    (p) => p.targetEndDate && p.progress?.derivedStatus !== 'COMPLETED',
  );

  return DUE_BUCKETS.map((bucket) => {
    const members = open.filter((p) => {
      const days = daysUntil(p.targetEndDate);
      return days !== null && days >= bucket.min && days <= bucket.max;
    });
    return {
      label: bucket.label,
      count: members.length,
      urgency: members.length * bucket.weight,
      projects: members,
    };
  });
}

function DueTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className="chart-tip">
      <strong>{point.label}</strong>
      <span className="muted xsmall">
        {point.count} open project{point.count === 1 ? '' : 's'}
      </span>
      {point.projects.slice(0, 5).map((p) => (
        <span key={p.id} className="chart-tip-row">
          <code>{p.code}</code> {p.name}
          <em>{daysUntil(p.targetEndDate)}d</em>
        </span>
      ))}
      {point.projects.length > 5 && (
        <span className="muted xsmall">+{point.projects.length - 5} more</span>
      )}
    </div>
  );
}

function StatusTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tip">
      <strong>{point.label}</strong>
      <span className="muted xsmall">
        {point.value} project{point.value === 1 ? '' : 's'}
      </span>
    </div>
  );
}

/* ── Date range ───────────────────────────────────────────────────────────── */
const DATE_RANGES = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function DateRangeControl({ value, onChange }) {
  const current = DATE_RANGES.find((r) => r.key === value) ?? DATE_RANGES[1];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="btn btn-secondary date-range-trigger">
          <Calendar size={14} aria-hidden="true" />
          {current.label}
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {DATE_RANGES.map((range) => (
          <DropdownMenuItem key={range.key} onSelect={() => onChange(range.key)}>
            {range.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Recent activity ──────────────────────────────────────────────────────── */
const ACTIVITY_ICON = {
  CREATE: CirclePlus, PUBLISH: CircleCheck, UPDATE: Pencil, DELETE: Trash2,
  STATUS_CHANGE: Clock, ASSIGN: UserPlus, REASSIGN: UserPlus, SIGNOFF: CircleCheck,
  UPLOAD: Upload, REORDER: ArrowUpDown,
};

const ACTIVITY_TONE = {
  CREATE: 'is-create', PUBLISH: 'is-publish', SIGNOFF: 'is-publish',
  UPDATE: 'is-update', STATUS_CHANGE: 'is-update', REORDER: 'is-update',
  DELETE: 'is-delete', DEACTIVATE: 'is-delete',
};

function timeAgo(value) {
  if (!value) return '';

  // The API hands back SQLite datetimes as "YYYY-MM-DD HH:MM:SS" in UTC with
  // no zone marker. Left alone, JS reads that as *local* time, which reports a
  // sign-in from ten seconds ago as hours old wherever the offset isn't zero.
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const then = new Date(hasZone ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(then.getTime())) return '';

  const mins = Math.round((Date.now() - then.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function RecentActivity({ items }) {
  return (
    <section className="card card-pad">
      <div className="card-head bare">
        <div className="card-head-title">
          <span className="panel-icon is-accent" aria-hidden="true"><Activity size={16} /></span>
          <div>
            <h3>Recent activity</h3>
            {/* <p className="muted xsmall">Latest entries from the audit trail, within the selected range.</p> */}
          </div>
        </div>
        <Link to="/audit" className="xsmall panel-link">View all <ChevronRight size={13} /></Link>
      </div>

      {items.length === 0 ? (
        <p className="muted small">No activity recorded in this range.</p>
      ) : (
        <ul className="activity-feed">
          {items.slice(0, 6).map((entry, index) => {
            const Icon = ACTIVITY_ICON[entry.action] ?? Activity;
            const isLast = index === Math.min(items.length, 6) - 1;
            return (
              <li key={entry.id}>
                <div className="activity-row">
                  <span className="activity-marker">
                    <span className={`activity-icon ${ACTIVITY_TONE[entry.action] ?? ''}`} aria-hidden="true">
                      <Icon size={10} strokeWidth={2.25} />
                    </span>
                    {!isLast && <span className="activity-rail" aria-hidden="true" />}
                  </span>
                  <span className="activity-text">
                    <strong>{entry.summary}</strong>
                    <small className="muted xsmall">{entry.actorName ?? 'System'}</small>
                  </span>
                  <span className="activity-when">{timeAgo(entry.createdAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Quick actions ────────────────────────────────────────────────────────── */
const QUICK_ACTIONS = [
  { to: '/sop',                       icon: FileCog,   label: 'SOP Builder',      hint: 'Author and publish stage templates', require: ['sop', 'update'] },
  { to: '/users?action=create-team',  icon: Building2, label: 'Create Team',      hint: 'Add a new team', require: ['users', 'create'] },
  { to: '/users?action=create-user',  icon: UserPlus,  label: 'Create User',      hint: 'Invite a new person', require: ['users', 'create'] },
  { to: '/projects/new',              icon: FilePlus,  label: 'New project',      hint: 'Generate a board from a published SOP', require: ['projects', 'create'] },
  { to: '/reports?action=export',     icon: Download,  label: 'Export Report',    hint: 'Download the project report CSV', require: ['reports', 'read'] },
  { to: '/audit?action=export',       icon: Download,  label: 'Export Audit Log', hint: 'Download the audit trail CSV', require: ['audit', 'read'] },
];

function QuickActions() {
  const can = usePermissionChecker();
  const visible = QUICK_ACTIONS.filter((a) => !a.require || can(a.require[0], a.require[1]));
  if (!visible.length) return null;

  return (
    <section className="card card-pad rail-card quick-actions-card">
      <div className="card-head bare">
        <div className="card-head-title">
          <span className="panel-icon is-accent" aria-hidden="true"><Zap size={16} /></span>
          <div>
            <h3>Quick actions</h3>
            {/* <p className="muted xsmall rail-sub">Get things done faster.</p> */}
          </div>
        </div>
      </div>
      <div className="quick-grid">
        {visible.map((action) => (
          <Link key={action.to} to={action.to} className="quick-action" title={action.hint}>
            <span className="quick-icon" aria-hidden="true"><action.icon size={15} strokeWidth={2} /></span>
            <span className="quick-text">{action.label}</span>
            <ChevronRight className="quick-chevron" size={14} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export function DashboardPage() {
  const dispatch = useDispatch();
  const projects = useSelector(selectProjectSummary);
  const auditItems = useSelector(selectAuditItems);
  const theme = useChartTheme();
  const can = usePermissionChecker();
  const canReadAudit = can('audit', 'read');
  const headingActions = usePageHeadingActions();

  const [range, setRange] = useState('30');

  useEffect(() => { dispatch(fetchProjectSummary()); }, [dispatch]);

  // The feed is a read of the audit log, so only fetch it for people who are
  // allowed one — otherwise every other role takes a guaranteed 403 on load.
  // Only the activity feed is time-windowed (spec: "Date range selector scopes
  // only time-windowed panels") — every other panel below reports current state
  // and ignores `range` entirely.
  useEffect(() => {
    if (!canReadAudit) return;
    const selected = DATE_RANGES.find((r) => r.key === range);
    const dateFrom = selected?.days ? isoDaysAgo(selected.days) : undefined;
    dispatch(fetchAuditLog({ limit: 6, dateFrom }));
  }, [dispatch, canReadAudit, range]);

  const stats = useMemo(() => {
    const by = (status) => projects.filter((p) => p.progress?.derivedStatus === status).length;
    const blockedStages = projects.reduce((n, p) => n + (p.progress?.blocked ?? 0), 0);
    const overdue = projects.filter((p) => {
      const days = daysUntil(p.targetEndDate);
      return days !== null && days < 0 && p.progress?.derivedStatus !== 'COMPLETED';
    }).length;

    return {
      total: projects.length,
      pending: by('NOT_STARTED'),
      onHold: by('ON_HOLD'),
      inProgress: by('IN_PROGRESS'),
      completed: by('COMPLETED'),
      atRisk: by('AT_RISK'),
      blockedStages,
      overdue,
      averageProgress: projects.length
        ? Math.round(projects.reduce((n, p) => n + (p.progress?.percentComplete ?? 0), 0) / projects.length)
        : 0,
    };
  }, [projects]);

  const dueSeries = useMemo(() => buildDueSeries(projects), [projects]);

  const statusSeries = useMemo(() => {
    const counts = projects.reduce((acc, p) => {
      const key = p.progress?.derivedStatus ?? 'NOT_STARTED';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([status, value]) => ({ status, label: STATUS_LABEL[status] ?? status, value }))
      .sort((a, b) => b.value - a.value);
  }, [projects]);

  const topStatus = statusSeries[0];
  const topStatusPct = topStatus && projects.length ? Math.round((topStatus.value / projects.length) * 100) : 0;

  const activeProjects = useMemo(
    () => projects
      .filter((p) => p.progress?.derivedStatus !== 'COMPLETED')
      .sort((a, b) => (a.progress?.percentComplete ?? 0) - (b.progress?.percentComplete ?? 0))
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        clientName: p.clientName,
        percent: p.progress?.percentComplete ?? 0,
        completed: p.progress?.completed ?? 0,
        total: p.progress?.total ?? 0,
        status: p.progress?.derivedStatus ?? 'NOT_STARTED',
      })),
    [projects],
  );

  const attention = useMemo(
    () => projects
      .map((p) => ({ ...p, days: daysUntil(p.targetEndDate) }))
      .filter((p) => p.progress?.derivedStatus !== 'COMPLETED')
      .filter((p) => (p.days !== null && p.days <= 14) || (p.progress?.blocked ?? 0) > 0 || p.progress?.derivedStatus === 'ON_HOLD')
      .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))
      .slice(0, 6),
    [projects],
  );

  const axis = { stroke: theme['text-3'], fontSize: 11 };

  if (!projects.length) {
    return (
      <div className="card">
        <EmptyState
          title="No projects in scope"
          hint="Projects appear here once an admin creates one and assigns you to it."
        />
      </div>
    );
  }

  return (
    <div className="dash-grid">
      {headingActions && createPortal(<DateRangeControl value={range} onChange={setRange} />, headingActions)}

      <div className="kpi-row dash-kpi-row">
        <KpiCard icon={FolderKanban} label="Total projects" value={stats.total} tone="accent" to="/projects" />
        <KpiCard icon={Clock} label="Pending" value={stats.pending} tone="neutral" to="/projects?status=NOT_STARTED" />
        <KpiCard icon={PauseCircle} label="On hold" value={stats.onHold} tone="red" to="/projects?status=ON_HOLD" />
        <KpiCard icon={AlertTriangle} label="At risk" value={stats.atRisk}  tone="amber" to="/projects?status=AT_RISK" />
        <KpiCard icon={Gauge} label="Avg. progress" value={`${stats.averageProgress}%`} tone="green" ring={stats.averageProgress} />
      </div>

      <div className="dash-row">
        <section className="card card-pad">
          <div className="card-head bare">
            <div className="card-head-title">
              <span className="panel-icon is-amber" aria-hidden="true"><TrendingUp size={16} /></span>
              <h3>Delivery pressure</h3>
            </div>
            <span className="chart-legend-note">far out → overdue</span>
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dueSeries} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="urgencyFill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor={theme.accent} stopOpacity={0.25} />
                  <stop offset="60%"  stopColor={theme.amber}  stopOpacity={0.35} />
                  <stop offset="100%" stopColor={theme.red}    stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="urgencyStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor={theme.accent} />
                  <stop offset="60%"  stopColor={theme.amber} />
                  <stop offset="100%" stopColor={theme.red} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.border }} {...axis} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} {...axis} />
              <Tooltip content={<DueTooltip />} cursor={{ stroke: theme['border-strong'], strokeWidth: 1 }} />
              <Area
                type="monotone" dataKey="urgency" name="Urgency"
                stroke="url(#urgencyStroke)" strokeWidth={2.5}
                fill="url(#urgencyFill)"
                dot={{ r: 3, fill: theme.surface, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </section>

        <QuickActions />
      </div>

      <div className="dash-row-3">
        <section className="card card-pad">
          <div className="card-head bare">
            <div className="card-head-title">
              <span className="panel-icon is-violet" aria-hidden="true"><PieChartIcon size={16} /></span>
              <div>
                <h3>Project Summary</h3>
                {/* <p className="muted xsmall">As of now — not affected by the selected range.</p> */}
              </div>
            </div>
          </div>
          <div className="portfolio-body">
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={statusSeries} dataKey="value" nameKey="label"
                    innerRadius={44} outerRadius={62} paddingAngle={4} strokeWidth={0}
                  >
                    {statusSeries.map((entry) => (
                      <Cell key={entry.status} fill={theme[STATUS_COLOR[entry.status] ?? 'slate']} />
                    ))}
                  </Pie>
                  <Tooltip content={<StatusTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {topStatus && (
                <div className="donut-center">
                  <strong>{topStatusPct}%</strong>
                  <span>{topStatus.label}</span>
                </div>
              )}
            </div>
            <ul className="chart-legend">
              {statusSeries.map((entry) => (
                <li key={entry.status}>
                  <span
                    className="legend-swatch"
                    style={{ background: theme[STATUS_COLOR[entry.status] ?? 'slate'] }}
                  />
                  {entry.label}
                  <b>{projects.length ? Math.round((entry.value / projects.length) * 100) : 0}%</b>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card card-pad">
          <div className="card-head bare">
            <div className="card-head-title">
              <span className="panel-icon is-green" aria-hidden="true"><ListChecks size={16} /></span>
              <div>
                <h3>Active projects</h3>
                {/* <p className="muted xsmall">Open work, least complete first. As of now.</p> */}
              </div>
            </div>
            <Link to="/projects" className="xsmall panel-link">View all <ChevronRight size={13} /></Link>
          </div>

          {activeProjects.length === 0 ? (
            <p className="muted small">Every project in scope is complete.</p>
          ) : (
            <ul className="active-list">
              {activeProjects.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="active-row">
                    <span
                      className="active-dot"
                      style={{ background: theme[STATUS_COLOR[p.status] ?? 'slate'] }}
                    />
                    <span className="active-main">
                      <strong>{p.name}</strong>
                      <small>{p.code} · {p.completed}/{p.total} stages</small>
                    </span>
                    <ProgressBar value={p.percent} label="" segments={p.total} />
                    <span className="active-pct">{p.percent}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-pad rail-card">
          <div className="card-head bare">
            <div className="card-head-title">
              <span className="panel-icon is-red" aria-hidden="true"><BellRing size={16} /></span>
              <div>
                <h3>Needs attention</h3>
                {/* <p className="muted xsmall rail-sub">Due within a fortnight, blocked, or on hold. As of now.</p> */}
              </div>
            </div>
            <Link to="/projects" className="xsmall panel-link">View all <ChevronRight size={13} /></Link>
          </div>

          {attention.length === 0 ? (
            <p className="muted small">Nothing pressing. Every project has room on its schedule.</p>
          ) : (
            <ul className="attention-list">
              {attention.map((p) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="attention-row">
                    <span className="attention-icon" aria-hidden="true">
                      <AlertTriangle size={14} />
                    </span>
                    <span className="attention-main">
                      <strong>{p.name}</strong>
                      <small className="muted">
                        {p.code}
                        {p.days !== null && p.days < 0 && (
                          <span className="danger-text"> · {Math.abs(p.days)}d overdue</span>
                        )}
                      </small>
                    </span>
                    <span className={`attention-flag ${p.days !== null && p.days < 0 ? 'is-overdue' : ''}`}>
                      {p.days === null
                        ? 'no date'
                        : p.days < 0 ? `${Math.abs(p.days)}d over` : `${p.days}d left`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="dash-row">
        {canReadAudit && <RecentActivity items={auditItems} />}

        <section className="card promo-card">
          <div className="promo-content">
            <h3>Stay on Track</h3>
            <p>Monitor your workflow and ensure compliance.</p>
            <Link to="/reports" className="promo-cta">
              Explore Reports <ChevronRight size={13} />
            </Link>
          </div>
          <span className="promo-illustration" aria-hidden="true"><ClipboardCheck size={136} /></span>
        </section>
      </div>
    </div>
  );
}
