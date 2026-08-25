import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchTemplates, fetchTemplate, createTemplate,
  addStage, updateStage, deleteStage, reorderStages, publishTemplate,
  clearSopError, dismissPublishResult,
  selectTemplates, selectCurrentTemplate, selectSopError,
  selectSopStatus, selectSopMutationStatus, selectLastPublished,
} from '../features/sop/sopSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { Modal } from '../components/ui/Modal.jsx';
import { Badge, ErrorNote, Field, Spinner, EmptyState } from '../components/ui/Bits.jsx';

const blankStage = {
  name: '', description: '', clientVisible: true, requiresDocument: false,
  stageType: 'GENERIC', requiresSignoff: false,
  expectedDurationDays: '', defaultOwnerTeam: '',
};

const STAGE_TYPES = [
  ['GENERIC', 'Generic'],
  ['DEVELOPMENT', 'Development'],
  ['TESTING', 'Testing — carries the bug loop'],
  ['UAT', 'UAT'],
];

function StageDialog({ stage, onSave, onClose, busy }) {
  const [form, setForm] = useState(stage ? { ...blankStage, ...stage } : blankStage);
  const isEdit = Boolean(stage?.id);

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
      defaultOwnerTeam: form.defaultOwnerTeam?.trim() || null,
    });
  };

  return (
    <Modal
      title={isEdit ? 'Edit stage' : 'Add stage'}
      subtitle="Changes apply to the current DRAFT only. Published versions are frozen."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="stage-form" className="btn" disabled={busy || !form.name.trim()}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add stage'}
          </button>
        </>
      }
    >
      <form id="stage-form" onSubmit={submit}>
        <Field label="Stage name" required>
          <input
            type="text" required autoFocus value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Environment Provisioning"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What happens in this stage?"
          />
        </Field>

        <div className="grid grid-2">
          <Field label="Expected duration (days)">
            <input
              type="number" min="0" value={form.expectedDurationDays ?? ''}
              onChange={(e) => setForm({ ...form, expectedDurationDays: e.target.value })}
            />
          </Field>
          <Field label="Default owner team">
            <input
              type="text" value={form.defaultOwnerTeam ?? ''}
              onChange={(e) => setForm({ ...form, defaultOwnerTeam: e.target.value })}
              placeholder="e.g. Infrastructure"
            />
          </Field>
        </div>

        <label className="check" style={{ marginBottom: 10 }}>
          <input
            type="checkbox" checked={form.clientVisible}
            onChange={(e) => setForm({ ...form, clientVisible: e.target.checked })}
          />
          <span>
            <strong>Visible to client</strong>
            <br />
            <small className="muted">
              When off, this stage is stripped from Client/Ops API responses entirely — not just hidden in the UI.
            </small>
          </span>
        </label>

        <label className="check" style={{ marginBottom: 10 }}>
          <input
            type="checkbox" checked={form.requiresDocument}
            onChange={(e) => setForm({ ...form, requiresDocument: e.target.checked })}
          />
          <span>Requires a supporting document</span>
        </label>

        <label className="check" style={{ marginBottom: 14 }}>
          <input
            type="checkbox" checked={form.requiresSignoff}
            onChange={(e) => setForm({ ...form, requiresSignoff: e.target.checked })}
          />
          <span>
            <strong>Requires sign-off</strong>
            <br />
            <small className="muted">
              The stage cannot be completed until its latest sign-off decision is Approved.
            </small>
          </span>
        </label>

        <Field
          label="Stage type"
          hint="A Testing stage gains the QA/development bug loop and cannot be completed while any bug is open."
        >
          <select
            value={form.stageType}
            onChange={(e) => setForm({ ...form, stageType: e.target.value })}
          >
            {STAGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function PublishDialog({ template, onConfirm, onClose, busy }) {
  const [changeNote, setChangeNote] = useState('');
  const stageCount = template.draft.stages.length;
  const projectCount = template.projectCount;

  return (
    <Modal
      title={`Publish version ${template.draft.version}`}
      subtitle={`${stageCount} stages will be frozen into an immutable version.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={() => onConfirm(changeNote)} disabled={busy || !stageCount}>
            {busy ? 'Publishing…' : `Publish v${template.draft.version}`}
          </button>
        </>
      }
    >
      {/* Business Rule 5, stated plainly to the person about to trigger it. */}
      <div className="info-note">
        <strong>Existing projects are not affected.</strong>
        <br />
        {projectCount > 0
          ? `${projectCount} project${projectCount === 1 ? '' : 's'} already built from earlier versions keep their own sopVersionId and their current workflow boards. Only projects created after this publish will use v${template.draft.version}.`
          : 'No projects use this template yet. Once published, new projects will be generated from this version.'}
      </div>

      <Field label="Change note" hint="Shown in the version history. What changed and why?">
        <textarea
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder="e.g. Added hypercare stage; made cost negotiation internal-only."
        />
      </Field>

      <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
        <h3 style={{ marginBottom: 8 }}>Stages in this version</h3>
        {template.draft.stages.map((stage) => (
          <div key={stage.id} className="row" style={{ padding: '4px 0', fontSize: 13 }}>
            <span className="stage-seq">{stage.sequence}</span>
            <span>{stage.name}</span>
            <span className="spacer" />
            <Badge tone={stage.clientVisible ? 'green' : 'neutral'}>
              {stage.clientVisible ? 'Client-visible' : 'Internal'}
            </Badge>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function SopBuilderPage() {
  const dispatch = useDispatch();
  const templates = useSelector(selectTemplates);
  const template = useSelector(selectCurrentTemplate);
  const error = useSelector(selectSopError);
  const status = useSelector(selectSopStatus);
  const mutationStatus = useSelector(selectSopMutationStatus);
  const lastPublished = useSelector(selectLastPublished);

  const canPublish = usePermission('sop', 'publish');
  const canEdit = usePermission('sop', 'update');
  const canCreate = usePermission('sop', 'create');

  const [selectedId, setSelectedId] = useState(null);
  const [stageDialog, setStageDialog] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  useEffect(() => { dispatch(fetchTemplates()); }, [dispatch]);

  useEffect(() => {
    if (!selectedId && templates.length) setSelectedId(templates[0].id);
  }, [templates, selectedId]);

  useEffect(() => {
    if (selectedId) dispatch(fetchTemplate(selectedId));
  }, [dispatch, selectedId]);

  const busy = mutationStatus === 'loading';
  const draftStages = template?.draft?.stages ?? [];

  const saveStage = (payload) => {
    const action = stageDialog?.id
      ? updateStage({ templateId: template.id, stageId: stageDialog.id, patch: payload })
      : addStage({ templateId: template.id, stage: payload });

    dispatch(action).then((result) => {
      if (!result.error) setStageDialog(null);
    });
  };

  const move = (index, direction) => {
    const next = [...draftStages];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    dispatch(reorderStages({ templateId: template.id, stageIds: next.map((s) => s.id) }));
  };

  const onPublish = (changeNote) => {
    dispatch(publishTemplate({ templateId: template.id, changeNote })).then((result) => {
      if (!result.error) setPublishing(false);
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>SOP Builder</h1>
          <p>
            Configure the stage template every project is generated from. Editing always happens on
            the <strong>draft</strong>; publishing freezes it as an immutable version and opens a fresh draft,
            leaving existing projects untouched.
          </p>
        </div>
        <div className="row">
          <select value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))} style={{ width: 260 }}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.publishedVersion ? `(v${t.publishedVersion.version} live)` : '(unpublished)'}
              </option>
            ))}
          </select>
          {canPublish && template && (
            <button type="button" className="btn" onClick={() => setPublishing(true)} disabled={!draftStages.length}>
              Publish v{template.draft.version}
            </button>
          )}
        </div>
      </div>

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

      {status === 'loading' && !template && <Spinner label="Loading SOP…" />}

      {canCreate && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              dispatch(createTemplate({ name: newTemplateName.trim() })).then((result) => {
                if (!result.error) {
                  setNewTemplateName('');
                  dispatch(fetchTemplates());
                  setSelectedId(result.payload.id);
                }
              });
            }}
          >
            <input
              type="text" value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="New SOP template name…" style={{ maxWidth: 340 }}
            />
            <button type="submit" className="btn btn-secondary" disabled={newTemplateName.trim().length < 3}>
              Create template
            </button>
          </form>
        </div>
      )}

      {template && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Draft — version {template.draft.version}</h2>
                <small>{draftStages.length} stages · editable</small>
              </div>
              {canEdit && (
                <button type="button" className="btn btn-sm" onClick={() => setStageDialog({})}>+ Add stage</button>
              )}
            </div>

            <div className="card-pad">
              {draftStages.length === 0 ? (
                <EmptyState title="No stages yet" hint="Add the first stage to start building this SOP." />
              ) : (
                draftStages.map((stage, index) => (
                  <div key={stage.id} className={`sop-stage ${stage.clientVisible ? '' : 'is-hidden'}`}>
                    {canEdit && (
                      <div className="reorder">
                        <button type="button" onClick={() => move(index, -1)} disabled={index === 0 || busy} title="Move up">▲</button>
                        <button type="button" onClick={() => move(index, 1)} disabled={index === draftStages.length - 1 || busy} title="Move down">▼</button>
                      </div>
                    )}
                    <span className="stage-seq">{stage.sequence}</span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{stage.name}</strong>
                      {stage.description && (
                        <div className="muted" style={{ fontSize: 12.5 }}>{stage.description}</div>
                      )}
                      <div className="row" style={{ gap: 6, marginTop: 5 }}>
                        <Badge tone={stage.clientVisible ? 'green' : 'neutral'}>
                          {stage.clientVisible ? 'Client-visible' : 'Internal only'}
                        </Badge>
                        {stage.requiresDocument && <Badge tone="accent">Document required</Badge>}
                        {stage.stageType && stage.stageType !== 'GENERIC' && (
                          <Badge tone="accent">{stage.stageType}</Badge>
                        )}
                        {stage.requiresSignoff && <Badge tone="violet">Sign-off</Badge>}
                        {stage.expectedDurationDays != null && <Badge>{stage.expectedDurationDays}d</Badge>}
                      </div>
                    </div>

                    {canEdit && (
                      <div className="row" style={{ gap: 4 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStageDialog(stage)}>Edit</button>
                        <button
                          type="button" className="btn btn-ghost btn-sm"
                          onClick={() =>
                            window.confirm(`Delete "${stage.name}" from the draft?`) &&
                            dispatch(deleteStage({ templateId: template.id, stageId: stage.id }))
                          }
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Version history ── */}
          <div className="stack">
            <div className="card">
              <div className="card-head">
                <h2>Version history</h2>
                <small>{template.versions.length} versions</small>
              </div>
              {template.versions.map((version) => (
                <div key={version.id} className="version-row">
                  <Badge tone={version.status === 'PUBLISHED' ? 'green' : version.status === 'DRAFT' ? 'amber' : 'neutral'}>
                    v{version.version}
                  </Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{version.status}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {version.stageCount} stages
                      {version.publishedAt ? ` · published ${version.publishedAt.slice(0, 10)}` : ' · not published'}
                      {version.publishedByName ? ` by ${version.publishedByName}` : ''}
                    </div>
                    {version.changeNote && (
                      <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>“{version.changeNote}”</div>
                    )}
                  </div>
                  {/* The count that proves Business Rule 5: old versions keep
                      serving the projects that were built from them. */}
                  <Badge tone={version.projectCount ? 'accent' : 'neutral'}>
                    {version.projectCount} project{version.projectCount === 1 ? '' : 's'}
                  </Badge>
                </div>
              ))}
            </div>

            {template.publishedVersion && (
              <div className="card">
                <div className="card-head">
                  <h2>Live version — v{template.publishedVersion.version}</h2>
                  <small>frozen · used by new projects</small>
                </div>
                <div className="card-pad">
                  {template.publishedVersion.stages.map((stage) => (
                    <div key={stage.id} className="row" style={{ padding: '5px 0', fontSize: 13 }}>
                      <span className="stage-seq">{stage.sequence}</span>
                      <span style={{ flex: 1 }}>{stage.name}</span>
                      <Badge tone={stage.clientVisible ? 'green' : 'neutral'}>
                        {stage.clientVisible ? 'Visible' : 'Internal'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {stageDialog && (
        <StageDialog
          stage={stageDialog.id ? stageDialog : null}
          onSave={saveStage}
          onClose={() => setStageDialog(null)}
          busy={busy}
        />
      )}

      {publishing && template && (
        <PublishDialog template={template} onConfirm={onPublish} onClose={() => setPublishing(false)} busy={busy} />
      )}
    </>
  );
}
