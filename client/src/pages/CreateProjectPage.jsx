import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  previewStages, createProject, clearPreview, clearProjectsError,
  selectPreview, selectCreateStatus, selectProjectsError,
} from '../features/projects/projectsSlice.js';
import { fetchTemplates, selectTemplates } from '../features/sop/sopSlice.js';
import { fetchUsers, selectUsers } from '../features/users/usersSlice.js';
import { Badge, ErrorNote, Field, Spinner } from '../components/ui/Bits.jsx';

export function CreateProjectPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const templates = useSelector(selectTemplates);
  const users = useSelector(selectUsers);
  const preview = useSelector(selectPreview);
  const createStatus = useSelector(selectCreateStatus);
  const error = useSelector(selectProjectsError);

  const [form, setForm] = useState({
    code: '', name: '', description: '', clientName: '',
    sopTemplateId: '', ownerId: '', startDate: '', targetEndDate: '',
  });

  useEffect(() => {
    dispatch(fetchTemplates());
    dispatch(fetchUsers({ isActive: true, limit: 100 }));
    return () => { dispatch(clearPreview()); dispatch(clearProjectsError()); };
  }, [dispatch]);

  useEffect(() => {
    if (form.sopTemplateId) dispatch(previewStages(Number(form.sopTemplateId)));
    else dispatch(clearPreview());
  }, [dispatch, form.sopTemplateId]);

  const submit = (event) => {
    event.preventDefault();
    dispatch(createProject({
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      clientName: form.clientName.trim(),
      sopTemplateId: Number(form.sopTemplateId),
      ownerId: form.ownerId ? Number(form.ownerId) : null,
      startDate: form.startDate || null,
      targetEndDate: form.targetEndDate || null,
    })).then((result) => {
      if (!result.error) navigate(`/projects/${result.payload.id}`);
    });
  };

  const itMembers = users.filter((u) => !u.isClientScope && u.isActive);
  const ready = form.code && form.name && form.clientName && form.sopTemplateId && preview.status === 'succeeded';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Create project</h1>
          <p>
            The workflow board is generated automatically from the latest <strong>published</strong> version
            of the chosen SOP. Drafts are never used, and the version is pinned to the project for life.
          </p>
        </div>
      </div>

      <ErrorNote error={error} onDismiss={() => dispatch(clearProjectsError())} />

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form className="card card-pad" onSubmit={submit}>
          <div className="grid grid-2" style={{ gap: '0 14px' }}>
            <Field label="Project code" required hint="Uppercase letters, digits and dashes.">
              <input
                type="text" required value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="NWL-ERP-2026"
              />
            </Field>
            <Field label="Client organisation" required hint="Client users with this name will see the project.">
              <input type="text" required value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Northwind Logistics" />
            </Field>
          </div>

          <Field label="Project name" required>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Northwind ERP Rollout" />
          </Field>

          <Field label="Description">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>

          <Field label="SOP template" required hint="Only templates with a published version can be used.">
            <select required value={form.sopTemplateId} onChange={(e) => setForm({ ...form, sopTemplateId: e.target.value })}>
              <option value="">Select an SOP…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id} disabled={!template.publishedVersion}>
                  {template.name}
                  {template.publishedVersion ? ` — v${template.publishedVersion.version} published` : ' — no published version'}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Project owner">
            <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
              <option value="">Unassigned</option>
              {itMembers.map((user) => (
                <option key={user.id} value={user.id}>{user.fullName} — {user.roleName}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-2" style={{ gap: '0 14px' }}>
            <Field label="Start date">
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label="Target end date">
              <input type="date" value={form.targetEndDate} onChange={(e) => setForm({ ...form, targetEndDate: e.target.value })} />
            </Field>
          </div>

          <div className="row row-end">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/projects')}>Cancel</button>
            <button type="submit" className="btn" disabled={!ready || createStatus === 'loading'}>
              {createStatus === 'loading'
                ? 'Creating…'
                : `Create project${preview.data ? ` + ${preview.data.stages.length} stages` : ''}`}
            </button>
          </div>
        </form>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Stages to be generated</h2>
              <small>
                {preview.data
                  ? `From "${preview.data.template.name}" v${preview.data.sopVersion.version} (published ${preview.data.sopVersion.publishedAt?.slice(0, 10)})`
                  : 'Select an SOP template to preview'}
              </small>
            </div>
            {preview.data && <Badge tone="violet">v{preview.data.sopVersion.version}</Badge>}
          </div>

          <div className="card-pad">
            {preview.status === 'loading' && <Spinner label="Resolving published SOP…" />}
            <ErrorNote error={preview.error} />

            {preview.data ? (
              <>
                <div className="info-note">
                  {preview.data.stages.length} workflow stages will be created in a single transaction —{' '}
                  {preview.data.stages.filter((s) => s.clientVisible).length} visible to the client,{' '}
                  {preview.data.stages.filter((s) => !s.clientVisible).length} internal only. All start at
                  <strong> Not started</strong>; status is only ever changed manually.
                </div>

                {preview.data.stages.map((stage) => (
                  <div key={stage.id} className={`sop-stage ${stage.clientVisible ? '' : 'is-hidden'}`}>
                    <span className="stage-seq">{stage.sequence}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{stage.name}</strong>
                      {stage.description && <div className="muted" style={{ fontSize: 12.5 }}>{stage.description}</div>}
                    </div>
                    <Badge tone={stage.clientVisible ? 'green' : 'neutral'}>
                      {stage.clientVisible ? 'Client-visible' : 'Internal'}
                    </Badge>
                  </div>
                ))}
              </>
            ) : (
              preview.status !== 'loading' && (
                <p className="muted" style={{ fontSize: 13 }}>
                  Pick an SOP template on the left and its published stages will appear here.
                </p>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
