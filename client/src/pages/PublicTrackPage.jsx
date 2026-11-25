import { useMemo, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { ProgressBar, Spinner } from '../components/ui/Bits.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Avatar, AvatarFallback } from '../components/ui/avatar.jsx';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '../components/ui/card.jsx';
import { Separator } from '../components/ui/separator.jsx';
import { selectIsAuthenticated, selectRoleKey } from '../features/auth/authSlice.js';
import { formatDate } from '../lib/date.js';

// Internal staff viewing this page (e.g. via the "Track" shortcut in the app
// topbar) get the history/contacts panel; anonymous clients following a BRD
// link never see internal staffing or activity detail.
const INTERNAL_PANEL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN']);

// Bare axios: this page must work with no token, cookie or Redux session.
const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

const STATUS_LABEL = {
  NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', AT_RISK: 'At risk',
  BLOCKED: 'Blocked', ON_HOLD: 'On hold', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

const STATUS_BADGE_VARIANT = {
  NOT_STARTED: 'neutral', IN_PROGRESS: 'accent', AT_RISK: 'red',
  BLOCKED: 'red', ON_HOLD: 'amber', COMPLETED: 'green', CANCELLED: 'neutral',
};

function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

function formatWhen(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Yesterday ${time}`;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const ACTIVITY_ICON = { IN_PROGRESS: '↻', COMPLETED: '✓' };

function journeyPosition(stages) {
  const completedCount = stages.filter((s) => s.status === 'COMPLETED').length;
  const activeIndex = stages.findIndex((s) => s.status !== 'COMPLETED' && s.status !== 'CANCELLED');
  return { completedCount, activeIndex };
}

export function PublicTrackPage() {
  const [brd, setBrd] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isAuthenticated = useSelector(selectIsAuthenticated);
  const roleKey = useSelector(selectRoleKey);
  const showInternalPanel = isAuthenticated && INTERNAL_PANEL_ROLES.has(roleKey);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true); setError(null); setData(null);
    try {
      const res = await publicApi.get(`/public/track?brd=${encodeURIComponent(brd.trim())}`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Could not reach the tracking service.');
    } finally {
      setLoading(false);
    }
  };

  const { completedCount, activeIndex } = useMemo(
    () => (data ? journeyPosition(data.stages) : { completedCount: 0, activeIndex: -1 }),
    [data],
  );

  return (
    <div className="track-shell">
      <header className="track-topbar">
        <div className="track-brand">
          <span className="brand-mark">IT</span>
          <strong>IT Workflow</strong>
          <Badge variant="outline" className="track-brand-tag">Client Portal</Badge>
          {data && (
            <>
              <span className="track-breadcrumb-sep">/</span>
              <span className="muted">{data.project.clientName}</span>
              <span className="track-breadcrumb-sep">/</span>
              <span className="mono">{data.project.brdNumber}</span>
            </>
          )}
        </div>
      </header>

      <div className="track-body">
        {showInternalPanel && (
          <Link to="/projects" className="back-link">← Back to projects</Link>
        )}

        <section className="track-intro">
          <h1>Track your project</h1>
          <p className="muted">Enter the BRD number from your engagement paperwork. No account needed.</p>

          <form className="public-form" onSubmit={submit}>
            <input
              value={brd} onChange={(e) => setBrd(e.target.value)}
              placeholder="BRD-2026-0042" aria-label="BRD number" required
            />
            <button className="btn" type="submit" disabled={loading || !brd.trim()}>
              {loading ? 'Looking up…' : 'Track →'}
            </button>
          </form>
        </section>

        {loading && <Spinner label="Looking up your project…" />}
        {error && <div className="callout danger">{error}</div>}

        {data && (
          <div className={`track-grid ${showInternalPanel ? '' : 'is-solo'}`}>
            <div className="track-main stack">
              <Card className="track-hero">
                <CardContent className="stack">
                  <div className="track-hero-head">
                    <div>
                      <h2>{data.project.name}</h2>
                      {data.project.description && <p className="muted">{data.project.description}</p>}
                    </div>
                    <Badge variant={STATUS_BADGE_VARIANT[data.project.status] ?? 'neutral'}>
                      {STATUS_LABEL[data.project.status] ?? data.project.status}
                    </Badge>
                  </div>

                  <dl className="track-meta-grid">
                    <div>
                      <dt>Engagement BRD</dt>
                      <dd className="mono">{data.project.brdNumber}</dd>
                    </div>
                    <div>
                      <dt>Client name</dt>
                      <dd>{data.project.clientName}</dd>
                    </div>
                    <div>
                      <dt>Lead owner</dt>
                      <dd className="track-owner">
                        {data.project.owner ? (
                          <>
                            <Avatar size="sm">
                              <AvatarFallback className="bg-brand-soft text-brand">
                                {initialsOf(data.project.owner)}
                              </AvatarFallback>
                            </Avatar>
                            {data.project.owner}
                          </>
                        ) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Delivery status</dt>
                      <dd className="track-owner">
                        <span className={`track-status-dot is-${data.project.status.toLowerCase().replace('_', '-')}`} />
                        {STATUS_LABEL[data.project.status] ?? data.project.status}
                      </dd>
                    </div>
                    <div>
                      <dt>Kickoff date</dt>
                      <dd>{formatDate(data.project.startDate) ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Target completion</dt>
                      <dd>{formatDate(data.project.targetEndDate) ?? '—'}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="track-progress-head">
                  <div>
                    <CardTitle>Progress</CardTitle>
                    <p className="muted small">{completedCount} of {data.stages.length} stages complete</p>
                  </div>
                  <div className="track-progress-figure">
                    <span>{data.progress.percentComplete}%</span>
                    <small className="muted">Total completion</small>
                  </div>
                </CardHeader>
                <CardContent className="stack">
                  <ProgressBar value={data.progress.percentComplete} label="" segments={data.stages.length} />
                  <div className="track-progress-labels">
                    {data.stages.map((stage, index) => (
                      <span key={stage.sequence} className={stage.status === 'COMPLETED' ? 'is-done' : stage.status !== 'NOT_STARTED' ? 'is-active' : ''}>
                        {stage.status === 'COMPLETED' && '✓ '}
                        {index + 1}. {stage.name}
                      </span>
                    ))}
                  </div>

                  <div className="track-kpi-row">
                    <div className="track-kpi">
                      <span className="track-kpi-value">{completedCount} / {data.stages.length}</span>
                      <span className="track-kpi-label">Stages completed</span>
                    </div>
                    <div className="track-kpi">
                      <span className="track-kpi-value">
                        {activeIndex >= 0 ? `Stage ${activeIndex + 1}` : 'Done'}
                      </span>
                      <span className="track-kpi-label">
                        {activeIndex >= 0 ? data.stages[activeIndex].name : 'All stages complete'}
                      </span>
                    </div>
                    <div className="track-kpi">
                      <span className="track-kpi-value is-green">{data.progress.percentComplete}%</span>
                      <span className="track-kpi-label">Completion rate</span>
                    </div>
                    <div className="track-kpi">
                      <span className="track-kpi-value">{data.stages.filter((s) => s.dueDate).length}</span>
                      <span className="track-kpi-label">Milestones scheduled</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Workflow journey</CardTitle>
                  <p className="muted small">Live status for every stage of this engagement.</p>
                </CardHeader>
                <CardContent className="stack">
                  {data.stages.map((stage, index) => (
                    <div
                      key={stage.sequence}
                      className={`track-stage-card is-${stage.status.toLowerCase().replace('_', '-')}`}
                    >
                      <div className="track-stage-top">
                        <div className="track-stage-title">
                          <span className={`track-stage-dot is-${stage.status.toLowerCase().replace('_', '-')}`} />
                          <div>
                            <strong>{index + 1}. {stage.name}</strong>
                            <div className="muted xsmall track-stage-sub">
                              {stage.assigneeName && <span>{stage.assigneeName}</span>}
                              {stage.dueDate && <span>due {stage.dueDate}</span>}
                              {stage.completionDate && <span>✓ completed {stage.completionDate}</span>}
                            </div>
                          </div>
                        </div>
                        <Badge variant={STATUS_BADGE_VARIANT[stage.status] ?? 'neutral'}>
                          {STATUS_LABEL[stage.status] ?? stage.status}
                        </Badge>
                      </div>
                      {stage.description && <p className="muted small track-stage-desc">{stage.description}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {showInternalPanel && (
              <div className="track-side stack">
                <Card>
                  <CardHeader>
                    <div className="track-side-head">
                      <span className="track-side-icon" aria-hidden="true">🕐</span>
                      <div>
                        <CardTitle>Project history</CardTitle>
                        <p className="muted xsmall">Milestones logged on this engagement</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="stack track-activity">
                    {data.activity.length === 0 && <p className="muted small">No activity recorded yet.</p>}
                    {data.activity.map((event, index) => (
                      <div key={`${event.at}-${index}`} className="track-activity-row">
                        <span className={`track-activity-icon is-${event.status.toLowerCase().replace('_', '-')}`}>
                          {ACTIVITY_ICON[event.status] ?? '•'}
                        </span>
                        <div className="grow">
                          <div className="track-activity-top">
                            <Badge variant={STATUS_BADGE_VARIANT[event.status] ?? 'neutral'}>
                              {STATUS_LABEL[event.status] ?? event.status}
                            </Badge>
                            <span className="muted xsmall">{formatWhen(event.at)}</span>
                          </div>
                          <p>{event.label}</p>
                          {event.actor && <span className="muted xsmall">Actor: {event.actor}</span>}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="track-side-head between">
                      <div>
                        <CardTitle>Project contacts</CardTitle>
                        <p className="muted xsmall">Assigned team members for this engagement</p>
                      </div>
                      <Badge variant="outline">{data.contacts.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="stack">
                    {data.contacts.length === 0 && <p className="muted small">No contacts published yet.</p>}
                    {data.contacts.map((contact) => (
                      <div key={contact.name} className="track-contact-row">
                        <Avatar size="sm">
                          <AvatarFallback className="bg-brand-soft text-brand">
                            {initialsOf(contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <strong>{contact.name}</strong>
                          <div className="muted xsmall">{contact.role}</div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Separator />
                <p className="muted xsmall track-footnote">
                  This history and contacts panel is only shown to Super Admin and Admin accounts.
                </p>
              </div>
            )}
          </div>
        )}

        {data && !showInternalPanel && (
          <p className="muted xsmall track-footnote">
            This is a read-only view. Internal documents, notes and the full audit trail are not
            included in this page's data.
          </p>
        )}
      </div>
    </div>
  );
}

export default PublicTrackPage;
