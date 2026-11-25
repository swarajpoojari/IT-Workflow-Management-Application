import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Layers, Users as UsersIcon } from 'lucide-react';
import {
  previewStages, createProject, clearPreview, clearProjectsError,
  selectPreview, selectCreateStatus, selectProjectsError,
} from '../features/projects/projectsSlice.js';
import { fetchTemplates, selectTemplates } from '../features/sop/sopSlice.js';
import { fetchUsers, fetchTeams, selectUsers, selectTeams } from '../features/users/usersSlice.js';
import { Badge, ErrorNote, Field, Spinner } from '../components/ui/Bits.jsx';
import { TeamCard } from '../components/ui/TeamCard.jsx';

export function CreateProjectPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const templates = useSelector(selectTemplates);
  const users = useSelector(selectUsers);
  const teams = useSelector(selectTeams);
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
    dispatch(fetchTeams());
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

  /**
   * Which teams this SOP hands work to, and how much. Derived from the preview
   * stages, so it reflects the exact published version that will be generated.
   */
  const involvedTeams = useMemo(() => {
    const stages = preview.data?.stages ?? [];
    const counts = new Map();

    for (const stage of stages) {
      if (!stage.defaultOwnerTeamId) continue;
      counts.set(stage.defaultOwnerTeamId, (counts.get(stage.defaultOwnerTeamId) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([teamId, stageCount]) => ({ team: teams.find((t) => t.id === teamId), stageCount }))
      .filter((row) => row.team)
      .sort((a, b) => b.stageCount - a.stageCount);
  }, [preview.data, teams]);

  const unownedStages = (preview.data?.stages ?? []).filter((s) => !s.defaultOwnerTeamId).length;
  const ready = form.code && form.name && form.clientName && form.sopTemplateId && preview.status === 'succeeded';

  return (
    <>
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
            <div className="card-head-title">
              <span className="panel-icon is-accent" aria-hidden="true"><Layers size={16} /></span>
              <div>
                <h2>Stages to be generated</h2>
                <small>
                  {preview.data
                    ? `From "${preview.data.template.name}" v${preview.data.sopVersion.version} (published ${preview.data.sopVersion.publishedAt?.slice(0, 10)})`
                    : 'Select an SOP template to preview'}
                </small>
              </div>
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
                      {stage.defaultOwnerTeamName && (
                        <div className="muted xsmall row-inline-icon">
                          <UsersIcon size={11} strokeWidth={2} aria-hidden="true" /> {stage.defaultOwnerTeamName}
                        </div>
                      )}
                    </div>
                    <Badge tone={stage.clientVisible ? 'green' : 'neutral'}>
                      {stage.clientVisible ? 'Client-visible' : 'Internal'}
                    </Badge>
                  </div>
                ))}

                {involvedTeams.length > 0 && (
                  <div className="involved-teams">
                    <div className="card-head bare">
                      <div className="card-head-title">
                        <span className="panel-icon is-violet" aria-hidden="true"><UsersIcon size={16} /></span>
                        <div>
                          <h3>Teams this SOP commits</h3>
                          <p className="muted xsmall">
                            Each stage arrives already routed to its team. Only that team&apos;s active
                            members can be made its owner.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="team-lg-grid">
                      {involvedTeams.map(({ team, stageCount }) => (
                        <TeamCard
                          key={team.id}
                          team={team}
                          stageCount={stageCount}
                          stageLabel="stages on this project"
                        />
                      ))}
                    </div>

                    {unownedStages > 0 && (
                      <p className="muted xsmall" style={{ marginTop: 10 }}>
                        {unownedStages} stage{unownedStages === 1 ? '' : 's'} name no team — anyone
                        active can be assigned to {unownedStages === 1 ? 'it' : 'them'}.
                      </p>
                    )}
                  </div>
                )}
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
