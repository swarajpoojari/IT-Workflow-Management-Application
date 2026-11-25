import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  FileCog, FileText, Layers, Workflow, Boxes, GitBranch,
  CheckCircle2, CircleDot, AlertTriangle, ChevronRight,
} from 'lucide-react';
import {
  fetchTemplates, clearSopError,
  selectTemplates, selectSopError, selectSopStatus,
} from '../features/sop/sopSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { ErrorNote, Spinner, EmptyState } from '../components/ui/Bits.jsx';

const FILTERS = [
  ['all', 'All Templates'],
  ['live', 'Active in Engagements'],
  ['draft', 'Draft Updates Ready'],
  ['archived', 'Archived'],
];

/** A stable icon per template, so a card is recognisable at a glance. */
const ICONS = [FileCog, FileText, Layers, Workflow, Boxes, GitBranch];
const iconFor = (id) => ICONS[id % ICONS.length];

function relativeTime(value) {
  if (!value) return null;
  const then = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(then.getTime())) return null;

  const seconds = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (seconds < 90) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return then.toISOString().slice(0, 10);
}

function SopCard({ template, onOpen }) {
  const live = template.publishedVersion;
  const draft = template.draftVersion;
  const edited = relativeTime(template.lastEdit?.createdAt);
  const stages = template.stages ?? [];
  const stageCount = template.stageCount ?? stages.length;
  const activeProjects = template.activeProjectCount ?? template.projectCount ?? 0;
  const Icon = iconFor(template.id);

  return (
    <article className="sop-card">
      <div className="sop-card-top">
        <span className="sop-glyph" aria-hidden="true"><Icon size={17} strokeWidth={2} /></span>

        <div className="sop-card-ident">
          <div className="sop-card-title">
            <h3>{template.name}</h3>
            {live && <span className="ver-chip is-live">v{live.version} Published (Locked)</span>}
            {draft && <span className="ver-chip is-draft">v{draft.version} Draft (Editable)</span>}
            {!live && !draft && <span className="ver-chip">No versions</span>}
          </div>
          {template.description && <p className="sop-card-desc">{template.description}</p>}
        </div>

        <dl className="sop-card-meta">
          <div>
            <dt>Projects</dt>
            <dd>
              {activeProjects > 0
                ? (
                  <span className="meta-live">
                    <CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" />
                    {' '}{activeProjects} Active{live ? ` (v${live.version})` : ''}
                  </span>
                )
                : <span className="muted">None yet</span>}
            </dd>
          </div>
          <div>
            <dt>{live ? 'Published' : 'Last edit'}</dt>
            <dd>
              {live
                ? live.publishedAt?.slice(0, 10)
                : edited ?? '—'}
              {template.lastEdit?.actorName && (
                <span className="muted"> · {template.lastEdit.actorName}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="sop-stages-row">
        <div className="sop-stages-head">
          <span className="sop-stages-label">
            <GitBranch size={11} strokeWidth={2} aria-hidden="true" /> Workflow stages ({stageCount} {stageCount === 1 ? 'stage' : 'stages'} sequenced)
          </span>
          {template.estimatedCycleDays > 0 && (
            <span className="muted xsmall">Estimated cycle: {template.estimatedCycleDays} days</span>
          )}
        </div>

        {stages.length === 0 ? (
          <p className="muted small">No stages yet — open the SOP to build the sequence.</p>
        ) : (
          <ol className="sop-chain">
            {stages.map((stage, index) => (
              <li key={stage.id}>
                <span
                  className={`chain-chip ${stage.clientVisible ? '' : 'is-internal'}`}
                  title={[
                    stage.clientVisible ? 'Client-visible' : 'Internal only',
                    stage.defaultOwnerTeamName ? `Owned by ${stage.defaultOwnerTeamName}` : null,
                    stage.expectedDurationDays ? `${stage.expectedDurationDays} days` : null,
                    stage.requiresSignoff ? 'Requires sign-off' : null,
                  ].filter(Boolean).join(' · ')}
                >
                  <b>{stage.sequence}</b> {stage.name}
                </span>
                {index < stages.length - 1 && (
                  <span className="chain-arrow" aria-hidden="true"><ChevronRight size={13} strokeWidth={2} /></span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="sop-card-foot">
        <span className="sop-card-note">
          {draft && live && (
            <><CircleDot size={12} strokeWidth={2} aria-hidden="true" /> Live projects unaffected by v{draft.version} draft changes</>
          )}
          {live && !draft && (
            <><CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" /> Production baseline locked · v{live.version}</>
          )}
          {!live && (
            <><AlertTriangle size={12} strokeWidth={2} aria-hidden="true" /> Not published yet — no project can use this SOP</>
          )}
        </span>

        <div className="row gap-sm">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(template.id)}>
            {live ? `Preview v${live.version} (Live)` : 'Open draft'}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => onOpen(template.id)}>
            {draft
              ? `Edit version ${draft.version}`
              : `Create version ${(live?.version ?? 0) + 1}`}
          </button>
        </div>
      </footer>
    </article>
  );
}

export function SopLibraryPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const templates = useSelector(selectTemplates);
  const status = useSelector(selectSopStatus);
  const error = useSelector(selectSopError);
  const canCreate = usePermission('sop', 'create');

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => { dispatch(fetchTemplates()); }, [dispatch]);

  const counts = useMemo(() => ({
    all: templates.length,
    live: templates.filter((t) => (t.activeProjectCount ?? t.projectCount ?? 0) > 0).length,
    draft: templates.filter((t) => t.draftVersion && t.publishedVersion).length,
    archived: templates.filter((t) => !t.isActive).length,
  }), [templates]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return templates
      .filter((t) => {
        if (filter === 'live') return (t.activeProjectCount ?? t.projectCount ?? 0) > 0;
        if (filter === 'draft') return Boolean(t.draftVersion && t.publishedVersion);
        if (filter === 'archived') return !t.isActive;
        return true;
      })
      .filter((t) => !term || `${t.name} ${t.category ?? ''} ${t.description ?? ''}`.toLowerCase().includes(term));
  }, [templates, filter, search]);

  const open = (id) => navigate(`/sop/${id}`);

  return (
    <div className="stack">
      <section className="sop-hero">
        <div className="sop-hero-text">
          <div className="row gap-sm" style={{ marginBottom: 8 }}>
            <span className="hero-badge">Enterprise catalog</span>
            <span className="muted xsmall">
              {counts.all} template{counts.all === 1 ? '' : 's'} · {counts.live} in active engagements
            </span>
          </div>
          <h2>SOP Templates &amp; Library</h2>
          <p>
            Manage the baseline procedures every project is generated from. A published version is
            frozen for life, so live boards never shift under a running engagement — new work picks
            up the latest published version instead.
          </p>
        </div>
        {canCreate && (
          <button type="button" className="btn btn-lg" onClick={() => navigate('/sop/new')}>
            + Create New SOP
          </button>
        )}
      </section>

      <div className="sop-toolbar">
        <div className="filter-tabs">
          {FILTERS.map(([key, label]) => (
            <button
              key={key} type="button"
              className={`filter-tab ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label} ({counts[key]})
              {key === 'draft' && counts.draft > 0 && <span className="filter-dot" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <input
          type="search" value={search} placeholder="Filter templates by name or tag…"
          onChange={(e) => setSearch(e.target.value)} style={{ width: 270 }}
        />
      </div>

      <ErrorNote error={error} onDismiss={() => dispatch(clearSopError())} />

      {status === 'loading' && !templates.length && <Spinner label="Loading SOP library…" />}

      {status !== 'loading' && visible.length === 0 ? (
        <div className="card">
          <EmptyState
            title={templates.length ? 'Nothing matches that filter' : 'No SOP templates yet'}
            hint={templates.length
              ? 'Try another tab, or clear the search.'
              : 'Create one to define the stage sequence every project is generated from.'}
            action={canCreate && !templates.length
              ? <button type="button" className="btn" onClick={() => navigate('/sop/new')}>+ Create New SOP</button>
              : null}
          />
        </div>
      ) : (
        <div className="sop-list">
          {visible.map((template) => (
            <SopCard key={template.id} template={template} onOpen={open} />
          ))}
        </div>
      )}

      <div className="callout info sop-governance">
        <strong>⛉ Version immutability is enforced by the database.</strong>{' '}
        A published version's stages reject <code>UPDATE</code>, <code>INSERT</code> and{' '}
        <code>DELETE</code> at the table level, so editing always happens on the draft and existing
        projects keep the version they were created with.
      </div>
    </div>
  );
}

export default SopLibraryPage;
