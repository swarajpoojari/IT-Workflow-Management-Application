import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { GripVertical, FileCog, History as HistoryIcon, Lock } from 'lucide-react';
import {
  fetchTemplates, fetchTemplate, createTemplate,
  addStage, updateStage, deleteStage, reorderStages, publishTemplate,
  clearSopError, dismissPublishResult,
  selectTemplates, selectCurrentTemplate, selectSopError,
  selectSopTemplateStatus, selectSopMutationStatus, selectLastPublished,
} from '../features/sop/sopSlice.js';
import { fetchTeams, selectTeams } from '../features/users/usersSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { usePageMeta } from '../hooks/usePageMeta.js';
import { Modal } from '../components/ui/Modal.jsx';
import { pushToast } from '../features/ui/uiSlice.js';
import { Badge, ErrorNote, Field, Spinner, EmptyState } from '../components/ui/Bits.jsx';

const blankStage = {
  name: '', description: '', clientVisible: true, requiresDocument: false,
  stageType: 'GENERIC', requiresSignoff: false,
  expectedDurationDays: '', defaultOwnerTeamId: '',
};

const STAGE_TYPES = [
  ['GENERIC', 'Generic', 'A normal stage with no special machinery.'],
  ['DEVELOPMENT', 'Development', 'Build work. Pairs with a Testing stage in the bug loop.'],
  ['TESTING', 'Testing', 'Carries the bug loop and cannot complete while any bug is open.'],
  ['UAT', 'User acceptance', 'Client-facing acceptance before go-live.'],
];

/* ── Add / edit a stage ─────────────────────────────────────────────────────
   One form for both. Nothing is duplicated: the mode only changes the wording,
   the starting values and which verb the primary button uses.               */
function StageDialog({ stage, onSave, onClose, busy, teams, templateName, nextSequence }) {
  const isEdit = Boolean(stage?.id);
  const [form, setForm] = useState(
    isEdit ? { ...blankStage, ...stage, defaultOwnerTeamId: stage.defaultOwnerTeamId ?? '' } : blankStage,
  );

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const team = teams.find((t) => t.id === Number(form.defaultOwnerTeamId));

  const submit = (event) => {
    event.preventDefault();
    onSave({
      name: form.name.trim(),
      description: form.description?.trim() || null,
      clientVisible: form.clientVisible,
      requiresDocument: form.requiresDocument,
      stageType: form.stageType,
      requiresSignoff: form.requiresSignoff,
      expectedDurationDays: form.expectedDurationDays === '' ? null : Number(form.expectedDurationDays),
      defaultOwnerTeamId: form.defaultOwnerTeamId === '' ? null : Number(form.defaultOwnerTeamId),
    });
  };

  return (
    <Modal
      title={isEdit ? `Edit stage ${stage.sequence}` : 'Add a stage'}
      subtitle={isEdit
        ? `Editing the draft of ${templateName}. Published versions are frozen, so live projects are untouched.`
        : `Appended to ${templateName} as stage ${nextSequence}. It only reaches a project once this draft is published.`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="stage-form" className="btn" disabled={busy || !form.name.trim()}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add stage'}
          </button>
        </>
      }
    >
      <form id="stage-form" onSubmit={submit} className="stage-form">
        {/* Live preview of the chips this stage will carry on the board. */}
        <div className="stage-preview">
          <span className="stage-preview-index">{isEdit ? stage.sequence : nextSequence}</span>
          <div className="stage-preview-body">
            <strong>{form.name.trim() || 'Untitled stage'}</strong>
            <div className="stage-preview-chips">
              <Badge tone={form.clientVisible ? 'green' : 'neutral'}>
                {form.clientVisible ? 'Client-visible' : 'Internal only'}
              </Badge>
              {form.requiresDocument && <Badge tone="accent">Document required</Badge>}
              {form.stageType !== 'GENERIC' && <Badge tone="accent">{form.stageType}</Badge>}
              {form.requiresSignoff && <Badge tone="violet">Sign-off</Badge>}
              {form.expectedDurationDays !== '' && <Badge>{form.expectedDurationDays} days SLA</Badge>}
              {team && <Badge tone="violet">◌ {team.name}</Badge>}
            </div>
          </div>
        </div>

        <section className="form-section">
          <h4 className="form-section-title">What this stage is</h4>

          <Field label="Stage name" required>
            <input
              type="text" required autoFocus value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Environment Provisioning"
            />
          </Field>

          <Field label="Description" hint="One or two lines on what has to happen here.">
            <textarea
              rows={2} value={form.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Technical design, integration contracts and estimation baseline."
            />
          </Field>
        </section>

        <section className="form-section">
          <h4 className="form-section-title">Ownership &amp; pace</h4>

          <div className="grid grid-2">
            <Field
              label="Owning team"
              hint="Only this team's active members can own the stage on a project."
            >
              <select
                value={form.defaultOwnerTeamId ?? ''}
                onChange={(e) => set({ defaultOwnerTeamId: e.target.value })}
              >
                <option value="">No team — anyone may own it</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.category ? ` · ${t.category}` : ''} ({t.activeMemberCount} active)
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Expected duration (days)" hint="Feeds the SOP's estimated cycle time.">
              <input
                type="number" min="0" value={form.expectedDurationDays ?? ''}
                onChange={(e) => set({ expectedDurationDays: e.target.value })}
                placeholder="6"
              />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <h4 className="form-section-title">Behaviour</h4>

          <Field label="Stage type">
            <div className="type-grid">
              {STAGE_TYPES.map(([value, label, hint]) => (
                <button
                  key={value} type="button"
                  className={`type-option ${form.stageType === value ? 'is-picked' : ''}`}
                  onClick={() => set({ stageType: value })}
                  aria-pressed={form.stageType === value}
                >
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
          </Field>

          <div className="toggle-stack">
            <label className={`toggle-card ${form.clientVisible ? 'is-on' : ''}`}>
              <input
                type="checkbox" checked={form.clientVisible}
                onChange={(e) => set({ clientVisible: e.target.checked })}
              />
              <span>
                <strong>Visible to the client</strong>
                <small>
                  When off, the stage is stripped from Client/Ops API responses entirely — not
                  merely hidden in the interface.
                </small>
              </span>
            </label>

            <label className={`toggle-card ${form.requiresDocument ? 'is-on' : ''}`}>
              <input
                type="checkbox" checked={form.requiresDocument}
                onChange={(e) => set({ requiresDocument: e.target.checked })}
              />
              <span>
                <strong>Requires a supporting document</strong>
                <small>The stage cannot be completed until evidence is attached.</small>
              </span>
            </label>

            <label className={`toggle-card ${form.requiresSignoff ? 'is-on' : ''}`}>
              <input
                type="checkbox" checked={form.requiresSignoff}
                onChange={(e) => set({ requiresSignoff: e.target.checked })}
              />
              <span>
                <strong>Requires sign-off</strong>
                <small>
                  The stage cannot be completed until its latest sign-off decision is Approved.
                </small>
              </span>
            </label>
          </div>
        </section>
      </form>
    </Modal>
  );
}

/* ── Publish ───────────────────────────────────────────────────────────────── */
function PublishDialog({ template, draft, onConfirm, onClose, busy }) {
  const [changeNote, setChangeNote] = useState('');
  const stageCount = draft.stages.length;
  const projectCount = template.projectCount;

  return (
    <Modal
      title={`Review & publish version ${draft.version}`}
      subtitle={`${stageCount} stage${stageCount === 1 ? '' : 's'} will be frozen into an immutable version.`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={() => onConfirm(changeNote)} disabled={busy || !stageCount}>
            {busy ? 'Publishing…' : `Publish v${draft.version}`}
          </button>
        </>
      }
    >
      {/* Business Rule 5, stated plainly to the person about to trigger it. */}
      <div className="info-note">
        <strong>Existing projects are not affected.</strong>
        <br />
        {projectCount > 0
          ? `${projectCount} project${projectCount === 1 ? '' : 's'} already built from earlier versions keep their own sopVersionId and their current workflow boards. Only projects created after this publish will use v${draft.version}.`
          : 'No projects use this template yet. Once published, new projects will be generated from this version.'}
      </div>

      <Field label="Change note" hint="Shown in the version history. What changed and why?">
        <textarea
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder="e.g. Added hypercare stage; made cost negotiation internal-only."
        />
      </Field>

      <div className="publish-list">
        <h4 className="form-section-title">Sequence being frozen</h4>
        {draft.stages.map((stage) => (
          <div key={stage.id} className="publish-row">
            <span className="stage-index">{stage.sequence}</span>
            <span className="grow">{stage.name}</span>
            {stage.defaultOwnerTeamName && <span className="muted xsmall">{stage.defaultOwnerTeamName}</span>}
            <Badge tone={stage.clientVisible ? 'green' : 'neutral'}>
              {stage.clientVisible ? 'Visible' : 'Internal'}
            </Badge>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ── Draft vs live comparison ───────────────────────────────────────────────
   Stages keep their name when a draft is cloned from a published version, so
   the name is what identifies "the same stage" across the two sequences.    */
function diffAgainstLive(draftStages, liveStages) {
  const liveByName = new Map(liveStages.map((s) => [s.name.toLowerCase(), s]));
  const draftNames = new Set(draftStages.map((s) => s.name.toLowerCase()));

  const rows = draftStages.map((stage) => {
    const live = liveByName.get(stage.name.toLowerCase());
    return {
      stage,
      isNew: !live,
      movedFrom: live && live.sequence !== stage.sequence ? live.sequence : null,
      visibilityChanged: live ? live.clientVisible !== stage.clientVisible : false,
    };
  });

  const removed = liveStages.filter((s) => !draftNames.has(s.name.toLowerCase()));

  const notes = [];
  for (const row of rows) {
    if (row.isNew) notes.push(`"${row.stage.name}" added`);
    else if (row.movedFrom) notes.push(`${row.stage.name} moved from #${row.movedFrom} to #${row.stage.sequence}`);
    if (row.visibilityChanged) {
      notes.push(`${row.stage.name} is now ${row.stage.clientVisible ? 'client-visible' : 'internal only'}`);
    }
  }
  for (const stage of removed) notes.push(`"${stage.name}" removed`);

  return { rows, removed, notes };
}

/* ── Step one of the builder: the SOP does not exist on the server yet ─────
   Same chrome as editing, so creating one is continuous with building it.  */
function NameSopPanel({ busy, onCreate }) {
  const [form, setForm] = useState({ name: '', category: '', description: '' });

  const submit = (event) => {
    event.preventDefault();
    onCreate({
      name: form.name.trim(),
      category: form.category.trim() || null,
      description: form.description.trim() || null,
    });
  };

  return (
    <form className="name-sop" onSubmit={submit}>
      <div className="name-sop-lead">
        <span className="name-sop-step">1</span>
        <div>
          <h3>Name this procedure</h3>
          <p className="muted xsmall">
            Two details now, then the stage sequence. Nothing is live until you publish.
          </p>
        </div>
      </div>

      <Field label="SOP name" required hint="How it appears in the library and on every project built from it.">
        <input
          type="text" required autoFocus value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Cloud Infrastructure Migration SOP"
        />
      </Field>

      <div className="grid grid-2">
        <Field label="Category" hint="Groups the library — Delivery, Security, Infrastructure…">
          <input
            type="text" value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Delivery"
          />
        </Field>
        <Field label="Description" hint="One line on what this procedure covers.">
          <input
            type="text" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="End-to-end migration runbook."
          />
        </Field>
      </div>

      <div className="name-sop-foot">
        <p className="muted xsmall">
          Next you will add the stage sequence. Each stage can name the team that owns it, so every
          project generated from this SOP arrives with its work already routed.
        </p>
        <button type="submit" className="btn btn-lg" disabled={busy || form.name.trim().length < 3}>
          {busy ? 'Creating…' : 'Create SOP & add stages →'}
        </button>
      </div>
    </form>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */
export function SopBuilderPage({ isNew: isNewProp = false }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { id } = useParams();

  const templates = useSelector(selectTemplates);
  const template = useSelector(selectCurrentTemplate);
  const teams = useSelector(selectTeams);
  const error = useSelector(selectSopError);
  const templateStatus = useSelector(selectSopTemplateStatus);
  const mutationStatus = useSelector(selectSopMutationStatus);
  const lastPublished = useSelector(selectLastPublished);

  const canPublish = usePermission('sop', 'publish');
  const canEdit = usePermission('sop', 'update');

  // The route for creating an SOP (path="sop/new") has no :id segment, so
  // useParams().id is undefined there — it can never be the literal string
  // 'new'. isNew comes from the route element itself (see routes/index.jsx);
  // the id check is kept only as a harmless fallback.
  const isNew = isNewProp || id === 'new';
  const selectedId = isNew ? null : Number(id);
  const [stageDialog, setStageDialog] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  useEffect(() => {
    dispatch(fetchTemplates());
    dispatch(fetchTeams());
  }, [dispatch]);

  useEffect(() => {
    if (selectedId) dispatch(fetchTemplate(selectedId));
  }, [dispatch, selectedId]);

  // A plain network hang — not a rejected request, one that never settles at
  // all — would otherwise leave this on the spinner forever with no escape:
  // templateStatus never reaches 'failed' if the promise never resolves.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (isNew || !selectedId) return undefined;
    const timer = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, [selectedId, isNew]);

  // In "new" mode the draft is a placeholder: v1, empty, not yet on the server.
  const draft = isNew ? { version: 1, stages: [] } : (template?.draft ?? null);
  const draftStages = draft?.stages ?? [];
  const liveStages = template?.publishedVersion?.stages ?? [];
  const busy = mutationStatus === 'loading';

  usePageMeta(
    isNew ? 'New SOP' : template?.name,
    isNew
      ? 'Name the procedure, then build its stage sequence.'
      : template
        ? `Draft v${draft?.version ?? '?'}${template.publishedVersion ? ` · v${template.publishedVersion.version} live` : ' · not published yet'}`
        : '',
  );

  const comparison = useMemo(
    () => diffAgainstLive(draftStages, liveStages),
    [draftStages, liveStages],
  );

  const saveStage = (payload) => {
    const action = stageDialog?.id
      ? updateStage({ templateId: template.id, stageId: stageDialog.id, patch: payload })
      : addStage({ templateId: template.id, stage: payload });

    dispatch(action).then((result) => {
      if (!result.error) setStageDialog(null);
    });
  };

  /** Commits a new order to the server; the draft re-fetches on success. */
  const commitOrder = (ordered) => {
    dispatch(reorderStages({ templateId: template.id, stageIds: ordered.map((s) => s.id) })).then((result) => {
      if (!result.error) dispatch(pushToast('Stage Re-ordered', 'success'));
    });
  };

  const moveTo = (from, to) => {
    if (to < 0 || to >= draftStages.length || from === to) return;
    const next = [...draftStages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitOrder(next);
  };

  // Keyboard equivalent of the drag: a focused card moves with the arrow keys.
  const onCardKeyDown = (event, index) => {
    if (!canEdit) return;
    if (event.key === 'ArrowUp') { event.preventDefault(); moveTo(index, index - 1); }
    if (event.key === 'ArrowDown') { event.preventDefault(); moveTo(index, index + 1); }
  };

  const onCreate = (payload) => {
    dispatch(createTemplate(payload)).then((result) => {
      if (result.error) return;
      dispatch(pushToast(`"${payload.name}" created — draft v1 is open for editing.`, 'success'));
      navigate(`/sop/${result.payload.id}`, { replace: true });
    });
  };

  const onPublish = (changeNote) => {
    dispatch(publishTemplate({ templateId: template.id, changeNote })).then((result) => {
      if (!result.error) setPublishing(false);
    });
  };

  // Not just "is there a template" — also "is it the SOP this URL names".
  // Checking the id, not just templateStatus, matters because a mutation
  // (add/edit/delete/reorder a stage) also re-dispatches fetchTemplate for
  // the SAME id to refresh the page, which briefly sets templateStatus back
  // to 'loading' too — that must NOT blank the whole builder out while an
  // edit is saving. A genuine navigation either leaves template null (first
  // load) or leaves the *previous* SOP's id mismatched against the new URL;
  // both are caught here without the busy-edit case being caught as well.
  const templateMatches = template?.id === selectedId;

  // A genuine fetch failure and "still in flight" look identical if all you
  // check is "no matching template yet" — which was exactly the bug: a 404,
  // a permission error, anything rejected, left this stuck on an infinite
  // spinner with the error sitting unread in state and no way back out.
  if (!isNew && !templateMatches) {
    if (templateStatus === 'failed' || timedOut) {
      return (
        <div className="stack">
          <Link to="/sop" className="back-link">← SOP library</Link>
          {templateStatus === 'failed'
            ? <ErrorNote error={error} onDismiss={() => dispatch(clearSopError())} />
            : (
              <div className="warn-note">
                This is taking longer than it should. The request may be stuck —
                try again, or go back to the library.
              </div>
            )}
          <button
            type="button" className="btn"
            onClick={() => { setTimedOut(false); dispatch(fetchTemplate(selectedId)); }}
          >
            Try again
          </button>
        </div>
      );
    }
    return <Spinner label="Loading SOP…" />;
  }

  return (
    <>
      {/* ── Header: where you are, what state it is in, what you can do ── */}
      <header className="builder-hero">
        <div className="builder-hero-main">
          <Link to="/sop" className="back-link">← SOP library</Link>

          <div className="builder-hero-title">
            <h2>{isNew ? 'New SOP' : (template?.name ?? 'SOP Builder')}</h2>
            {draft && (
              <span className="state-chip is-draft">
                <span className="state-chip-dot" aria-hidden="true" />
                Draft v{draft.version} in progress
              </span>
            )}
            {template?.publishedVersion && (
              <span className="state-chip is-live">v{template.publishedVersion.version} live</span>
            )}
          </div>

          <p className="builder-hero-help">
            {isNew
              ? 'Name the procedure, add its stages, then publish. A published version is frozen for life, so the boards it generates never shift under a running engagement.'
              : (<>
                  You are editing the <strong>draft</strong>. Every change here is saved immediately
                  but reaches no project until you publish — and publishing freezes the draft as a
                  new immutable version, leaving running projects on the version they were created
                  with.
                </>)}
          </p>
        </div>

        <div className="builder-hero-actions">
          {!isNew && (
            <select
              value={selectedId || ''}
              onChange={(e) => navigate(`/sop/${e.target.value}`)}
              aria-label="Switch SOP"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.publishedVersion ? `(v${t.publishedVersion.version} live)` : '(unpublished)'}
                </option>
              ))}
            </select>
          )}

          {canPublish && draft && (
            <button
              type="button" className="btn btn-lg"
              onClick={() => setPublishing(true)}
              disabled={!draftStages.length}
              title={draftStages.length ? undefined : 'Add at least one stage before publishing'}
            >
              ✓ Review &amp; publish v{draft.version}
            </button>
          )}
        </div>
      </header>

      <ErrorNote error={error} onDismiss={() => dispatch(clearSopError())} />

      {lastPublished && (
        <div className="success-note">
          <strong>Version {lastPublished.published.version} published.</strong>{' '}
          {lastPublished.projectsUsingPreviousVersions} existing project
          {lastPublished.projectsUsingPreviousVersions === 1 ? '' : 's'} kept their original SOP version and
          workflow boards. Draft v{lastPublished.nextDraft.version} is now open for editing.
          <button type="button" className="icon-btn" onClick={() => dispatch(dismissPublishResult())}>×</button>
        </div>
      )}

      {(isNew || (template && draft)) && (
        <div className="builder-grid">
          {/* ── Draft sequence ── */}
          <section className="card builder-draft">
            <div className="card-head">
              <div className="card-head-title">
                <span className="panel-icon is-accent" aria-hidden="true"><FileCog size={16} /></span>
                <div>
                  <h2>
                    <span className="draft-dot" aria-hidden="true" />
                    Draft — version {draft.version}
                    <span className="editable-chip">Editable</span>
                  </h2>
                  <small>
                    {isNew
                      ? 'Not created yet · name it to start adding stages'
                      : `${draftStages.length} stage${draftStages.length === 1 ? '' : 's'} sequenced · saved as you go`}
                  </small>
                </div>
              </div>
              {canEdit && !isNew && (
                <button type="button" className="btn btn-sm" onClick={() => setStageDialog({})}>
                  + Add stage
                </button>
              )}
            </div>

            <div className="card-pad">
              {isNew && <NameSopPanel busy={busy} onCreate={onCreate} />}

              {canEdit && !isNew && draftStages.length > 1 && (
                <p className="reorder-hint">
                  <span aria-hidden="true">⇅</span>
                  Drag a stage card to re-order the sequence, or focus one and use ↑ / ↓.
                </p>
              )}

              {isNew ? null : draftStages.length === 0 ? (
                <EmptyState
                  title="No stages yet"
                  hint="Add the first stage to start building this SOP."
                  action={canEdit
                    ? <button type="button" className="btn" onClick={() => setStageDialog({})}>+ Add stage</button>
                    : null}
                />
              ) : (
                <ol className="draft-list">
                  {draftStages.map((stage, index) => {
                    const row = comparison.rows[index];
                    const dragging = dragIndex === index;
                    const dropTarget = overIndex === index && dragIndex !== null && dragIndex !== index;

                    return (
                      <li key={stage.id}>
                        <article
                          className={`draft-stage ${dragging ? 'is-dragging' : ''} ${dropTarget ? 'is-drop-target' : ''}`}
                          draggable={canEdit}
                          tabIndex={canEdit ? 0 : -1}
                          title={canEdit ? 'Drag to re-order' : undefined}
                          aria-label={`Stage ${stage.sequence}, ${stage.name}. Use arrow up or down to re-order.`}
                          onDragStart={(e) => {
                            setDragIndex(index);
                            e.dataTransfer.effectAllowed = 'move';
                            // Firefox will not start a drag without payload.
                            e.dataTransfer.setData('text/plain', String(stage.id));
                          }}
                          onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
                          onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragIndex !== null) moveTo(dragIndex, index);
                            setDragIndex(null);
                            setOverIndex(null);
                          }}
                          onKeyDown={(e) => onCardKeyDown(e, index)}
                        >
                          {canEdit && (
                            <span className="drag-handle" aria-hidden="true">
                              <GripVertical size={15} strokeWidth={2} />
                            </span>
                          )}
                          <span className="stage-index" aria-hidden="true">{stage.sequence}</span>

                          <div className="draft-stage-body">
                            <div className="draft-stage-head">
                              <h3>{stage.name}</h3>
                              {row?.isNew && liveStages.length > 0 && (
                                <span className="change-chip is-new">New in v{draft.version}</span>
                              )}
                              {row?.movedFrom && (
                                <span className="change-chip is-moved">Reordered in v{draft.version}</span>
                              )}
                              {canEdit && (
                                <div className="draft-stage-actions">
                                  <button
                                    type="button" className="btn btn-secondary btn-sm"
                                    onClick={() => setStageDialog(stage)}
                                  >
                                    ✎ Edit
                                  </button>
                                  <button
                                    type="button" className="btn btn-danger btn-sm"
                                    onClick={() =>
                                      window.confirm(`Delete "${stage.name}" from the draft?`) &&
                                      dispatch(deleteStage({ templateId: template.id, stageId: stage.id }))
                                    }
                                  >
                                    🗑 Delete
                                  </button>
                                </div>
                              )}
                            </div>

                            {stage.description && <p className="draft-stage-desc">{stage.description}</p>}

                            <div className="draft-stage-meta">
                              <Badge tone={stage.clientVisible ? 'green' : 'neutral'}>
                                {stage.clientVisible ? '◉ Client-visible' : '⛉ Internal only'}
                              </Badge>
                              {stage.requiresDocument && <Badge tone="accent">▤ Document required</Badge>}
                              {stage.stageType !== 'GENERIC' && <Badge tone="accent">{stage.stageType}</Badge>}
                              {stage.requiresSignoff && <Badge tone="violet">⊘ Sign-off</Badge>}
                              {stage.expectedDurationDays != null && (
                                <Badge>◷ {stage.expectedDurationDays} days SLA</Badge>
                              )}
                              {stage.defaultOwnerTeamName && (
                                <Badge tone="violet">◌ {stage.defaultOwnerTeamName}</Badge>
                              )}
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ol>
              )}

              {canEdit && !isNew && draftStages.length > 0 && (
                <button type="button" className="append-stage" onClick={() => setStageDialog({})}>
                  + Append stage to {template.name}
                </button>
              )}
            </div>
          </section>

          {/* ── Version history and the live baseline ── */}
          <aside className="builder-rail">
            <section className="card card-pad">
              <div className="card-head bare">
                <div className="card-head-title">
                  <span className="panel-icon" aria-hidden="true"><HistoryIcon size={16} /></span>
                  <div>
                    <h3>Version history</h3>
                    <p className="muted xsmall">Immutable audit trail</p>
                  </div>
                </div>
                <span className="stage-counter">
                  {isNew ? 1 : template.versions.length} version{(isNew ? 1 : template.versions.length) === 1 ? '' : 's'}
                </span>
              </div>

              <ol className="version-timeline">
                {isNew && (
                  <li className="version-node is-draft">
                    <span className="version-marker" aria-hidden="true" />
                    <div className="version-body">
                      <div className="version-head">
                        <span className="version-chip is-draft">v1</span>
                        <strong>DRAFT</strong>
                        <span className="version-projects">0 projects</span>
                      </div>
                      <p className="muted xsmall">0 stages · not created yet</p>
                      <p className="version-active">✎ Opens once you name the SOP</p>
                    </div>
                  </li>
                )}

                {(template?.versions ?? []).map((version) => (
                  <li key={version.id} className={`version-node is-${version.status.toLowerCase()}`}>
                    <span className="version-marker" aria-hidden="true" />

                    <div className="version-body">
                      <div className="version-head">
                        <span className={`version-chip is-${version.status.toLowerCase()}`}>
                          v{version.version}
                        </span>
                        <strong>{version.status}</strong>
                        {/* The count that proves Business Rule 5: old versions
                            keep serving the projects built from them. */}
                        <span className={`version-projects ${version.projectCount ? 'is-live' : ''}`}>
                          {version.projectCount} project{version.projectCount === 1 ? '' : 's'}
                        </span>
                      </div>

                      <p className="muted xsmall">
                        {version.stageCount} stage{version.stageCount === 1 ? '' : 's'}
                        {version.publishedAt ? ` · published ${version.publishedAt.slice(0, 10)}` : ' · not published'}
                      </p>

                      {version.changeNote && <p className="version-note">“{version.changeNote}”</p>}

                      {version.publishedByName && (
                        <p className="muted xsmall">Authored by {version.publishedByName}</p>
                      )}

                      {version.status === 'DRAFT' && (
                        <p className="version-active">✎ Active workspace draft</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {!isNew && template.publishedVersion ? (
              <section className="card card-pad">
                <div className="card-head bare">
                  <div className="card-head-title">
                    <span className="panel-icon is-green" aria-hidden="true"><Lock size={16} /></span>
                    <div>
                      <h3>
                        Live version — v{template.publishedVersion.version}
                        <span className="live-dot" aria-hidden="true" />
                      </h3>
                      <p className="muted xsmall">frozen · used by new projects</p>
                    </div>
                  </div>
                  <span className="immutable-chip"><Lock size={11} strokeWidth={2} aria-hidden="true" /> Immutable</span>
                </div>

                <p className="muted xsmall compare-intro">
                  Current draft sequence compared against the v{template.publishedVersion.version} baseline:
                </p>

                <ol className="compare-list">
                  {comparison.rows.map(({ stage, isNew, movedFrom, visibilityChanged }) => (
                    <li key={stage.id} className={isNew || movedFrom ? 'is-changed' : ''}>
                      <span className="compare-seq">{stage.sequence}</span>
                      <span className="compare-name">{stage.name}</span>
                      {isNew && <span className="compare-was is-new">new</span>}
                      {movedFrom && <span className="compare-was">(was #{movedFrom})</span>}
                      <span className={`compare-tag ${stage.clientVisible ? 'is-visible' : 'is-internal'}`}>
                        {stage.clientVisible ? 'Visible' : 'Internal'}
                        {visibilityChanged && ' *'}
                      </span>
                    </li>
                  ))}

                  {comparison.removed.map((stage) => (
                    <li key={`removed-${stage.id}`} className="is-removed">
                      <span className="compare-seq">—</span>
                      <span className="compare-name">{stage.name}</span>
                      <span className="compare-was is-removed">removed</span>
                    </li>
                  ))}
                </ol>

                {comparison.notes.length > 0 ? (
                  <div className="compare-summary">
                    <strong>◔ Draft v{draft.version} changes</strong>
                    <p>{comparison.notes.join('; ')}.</p>
                  </div>
                ) : (
                  <div className="compare-summary is-clean">
                    <strong>✓ No differences</strong>
                    <p>
                      The draft matches the live version exactly. Publishing it would change nothing
                      for new projects.
                    </p>
                  </div>
                )}
              </section>
            ) : (
              <section className="card card-pad">
                <h3>No live version yet</h3>
                <p className="muted small">
                  Nothing has been published, so no project can be created from this SOP. Build the
                  sequence, then publish v{draft.version} to make it available.
                </p>
              </section>
            )}
          </aside>
        </div>
      )}

      {stageDialog && template && (
        <StageDialog
          teams={teams}
          templateName={template.name}
          nextSequence={draftStages.length + 1}
          stage={stageDialog.id ? stageDialog : null}
          onSave={saveStage}
          onClose={() => setStageDialog(null)}
          busy={busy}
        />
      )}

      {publishing && template && draft && (
        <PublishDialog
          template={template} draft={draft}
          onConfirm={onPublish} onClose={() => setPublishing(false)} busy={busy}
        />
      )}
    </>
  );
}

export default SopBuilderPage;
