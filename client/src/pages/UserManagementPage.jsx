import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchUsers, fetchRoles, createUser, deactivateUser, activateUser, deleteUser,
  reassignAssignments, closeReassignModal, clearUsersError, clearInvite,
  fetchTeams, createTeam, updateTeam, deleteTeam,
  selectUsers, selectRoles, selectUsersStatus, selectUsersError,
  selectReassignState, selectReassignCandidates, selectMutationStatus,
  selectTeams, selectTeamError, selectLastInvite, selectDeleteError,
} from '../features/users/usersSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { Modal } from '../components/ui/Modal.jsx';
import { Badge, ErrorNote, Field, Spinner, StatusBadge, KpiCard } from '../components/ui/Bits.jsx';
import { Users as UsersIcon, Building2, Hourglass, KeyRound } from 'lucide-react';
import { TeamCard } from '../components/ui/TeamCard.jsx';
import { pushToast } from '../features/ui/uiSlice.js';

/* ── Reassign-before-deactivate ───────────────────────────────────────────── */
function ReassignModal() {
  const dispatch = useDispatch();
  const reassign = useSelector(selectReassignState);
  const candidates = useSelector(selectReassignCandidates);

  const [toUserId, setToUserId] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    setSelected(new Set(reassign.assignments.map((a) => a.stageId)));
  }, [reassign.assignments]);

  if (!reassign.user) return null;

  const busy = reassign.status === 'loading';
  const done = reassign.assignments.length === 0 && reassign.movedCount > 0;

  const toggle = (stageId) => {
    const next = new Set(selected);
    if (next.has(stageId)) next.delete(stageId); else next.add(stageId);
    setSelected(next);
  };

  const submitReassign = () => {
    dispatch(reassignAssignments({
      fromUserId: reassign.user.id,
      toUserId: Number(toUserId),
      stageIds: selected.size === reassign.assignments.length ? undefined : [...selected],
    }));
  };

  return (
    <Modal
      title={done ? 'Assignments moved' : 'Reassign work first'}
      subtitle={
        done
          ? `${reassign.movedCount} stage${reassign.movedCount === 1 ? '' : 's'} moved. This account can now be deactivated.`
          : `${reassign.user.fullName} still owns ${reassign.assignments.length} active stage${reassign.assignments.length === 1 ? '' : 's'}.`
      }
      onClose={() => dispatch(closeReassignModal())}
      wide
      footer={
        done ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => dispatch(closeReassignModal())}>
              Close
            </button>
            <button
              type="button" className="btn btn-danger"
              onClick={() => dispatch(deactivateUser(reassign.user))}
            >
              Deactivate {reassign.user.fullName}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => dispatch(closeReassignModal())}>
              Cancel
            </button>
            <button
              type="button" className="btn"
              onClick={submitReassign}
              disabled={busy || !toUserId || selected.size === 0}
            >
              {busy ? 'Moving…' : `Move ${selected.size} stage${selected.size === 1 ? '' : 's'}`}
            </button>
          </>
        )
      }
    >
      <ErrorNote error={reassign.error} />

      {done ? (
        <div className="success-note" style={{ marginBottom: 0 }}>
          All active assignments have been reassigned.
        </div>
      ) : (
        <>
          <div className="warn-note">
            The API returned <code>409 ACTIVE_ASSIGNMENTS</code>. Every stage below needs a new
            owner first — this is what stops live work being orphaned.
          </div>

          <Field label="Reassign to" required hint="Only active users can receive work.">
            <select value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
              <option value="">Select a user…</option>
              {candidates.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName} — {user.roleName}{user.team ? ` · ${user.team}` : ''}
                </option>
              ))}
            </select>
          </Field>

          <div className="table-wrap card" style={{ marginTop: 4 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === reassign.assignments.length}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(reassign.assignments.map((a) => a.stageId)) : new Set())
                      }
                    />
                  </th>
                  <th>Project</th><th>Stage</th><th>Status</th><th>Due</th>
                </tr>
              </thead>
              <tbody>
                {reassign.assignments.map((assignment) => (
                  <tr key={assignment.stageId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(assignment.stageId)}
                        onChange={() => toggle(assignment.stageId)}
                      />
                    </td>
                    <td className="mono">{assignment.projectCode}</td>
                    <td>{assignment.stageName}</td>
                    <td><StatusBadge status={assignment.status} /></td>
                    <td className="muted">{assignment.dueDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="muted xsmall" style={{ marginTop: 10 }}>
            Reassignment changes ownership only — every stage keeps its current status.
          </p>
        </>
      )}
    </Modal>
  );
}

/* ── Create user ──────────────────────────────────────────────────────────── */
function CreateUserDialog({ roles, teams, onClose, busy, onNeedTeam }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState({ email: '', fullName: '', roleId: '', teamId: '', clientName: '' });

  const role = roles.find((r) => r.id === Number(form.roleId));
  const needsClientName = Boolean(role?.isClientScope);

  const submit = (event) => {
    event.preventDefault();
    dispatch(createUser({
      email: form.email.trim(),
      fullName: form.fullName.trim(),
      roleId: Number(form.roleId),
      teamId: form.teamId ? Number(form.teamId) : null,
      clientName: needsClientName ? form.clientName.trim() : null,
    })).then((result) => { if (!result.error) onClose(); });
  };

  return (
    <Modal
      title="Create user"
      subtitle="Fields marked * are required."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="user-form" className="btn" disabled={busy}>
            {busy ? 'Creating…' : 'Create & send invite'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit}>
        <Field label="Full name" required>
          <input type="text" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </Field>

        <Field label="Email" required hint="The invitation and temporary password are sent here.">
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>

        <Field label="Role" required>
          <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
            <option value="">Select a role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>

        <div className="field">
          <span className="field-label">
            Team
            <button type="button" className="link field-action" onClick={onNeedTeam}>+ Create team</button>
          </span>
          <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.memberCount} member{t.memberCount === 1 ? '' : 's'})
              </option>
            ))}
          </select>
          <small className="field-hint">Teams are managed in the Teams panel on this page.</small>
        </div>

        {needsClientName && (
          <Field label="Client organisation" required hint="Scopes which projects this user can read.">
            <input type="text" required value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          </Field>
        )}

        <div className="info-note" style={{ marginBottom: 0 }}>
          No password is set here. The API generates a temporary one, emails it to the user, and
          shows it to you once — they replace it the first time they sign in.
        </div>
      </form>
    </Modal>
  );
}

/* ── The one-time temporary password ──────────────────────────────────────── */
function InviteResultDialog({ invite, onClose }) {
  const dispatch = useDispatch();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      dispatch(pushToast('Could not reach the clipboard — select and copy the password manually.', 'error'));
    }
  };

  return (
    <Modal
      title="User created"
      subtitle={`An invitation has been sent to ${invite.user.email}.`}
      onClose={onClose}
      footer={<button type="button" className="btn" onClick={onClose}>Done</button>}
    >
      <div className="invite-user">
        <span className="invite-avatar">{invite.user.fullName.slice(0, 1)}</span>
        <div>
          <strong>{invite.user.fullName}</strong>
          <small className="muted">{invite.user.roleName}{invite.user.team ? ` · ${invite.user.team}` : ''}</small>
        </div>
      </div>

      <div className="temp-pass">
        <span className="temp-pass-label">Temporary password</span>
        <div className="temp-pass-row">
          <code>{invite.temporaryPassword}</code>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <p className="muted xsmall">
        Shown once and never retrievable again — it is stored only as a hash. The user must
        replace it when they first sign in, and it stops working the moment they do.
        {invite.invite?.transport === 'console' && (
          <> In this environment the email is printed to the API console rather than sent.</>
        )}
      </p>
    </Modal>
  );
}

/* ── Delete confirmation ──────────────────────────────────────────────────── */
function DeleteUserDialog({ user, onClose }) {
  const dispatch = useDispatch();
  const error = useSelector(selectDeleteError);
  const status = useSelector(selectMutationStatus);
  const [typed, setTyped] = useState('');

  const blockedByHistory = error?.code === 'HAS_HISTORY';
  const confirmed = typed.trim().toLowerCase() === user.fullName.trim().toLowerCase();

  const confirm = () => {
    dispatch(deleteUser(user)).then((result) => {
      if (!result.error) {
        dispatch(pushToast(`${user.fullName} was deleted.`, 'success'));
        onClose();
      }
    });
  };

  return (
    <Modal
      title={blockedByHistory ? 'This account cannot be deleted' : `Delete ${user.fullName}?`}
      subtitle={blockedByHistory ? undefined : 'This is permanent and cannot be undone.'}
      onClose={onClose}
      footer={
        blockedByHistory ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            {user.isActive && (
              <button
                type="button" className="btn btn-danger"
                onClick={() => {
                  dispatch(deactivateUser(user)).then((r) => {
                    if (!r.error) dispatch(pushToast(`${user.fullName} was deactivated.`, 'success'));
                    onClose();
                  });
                }}
              >
                Deactivate instead
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              type="button" className="btn btn-danger"
              disabled={!confirmed || status === 'loading'}
              onClick={confirm}
            >
              {status === 'loading' ? 'Deleting…' : 'Delete permanently'}
            </button>
          </>
        )
      }
    >
      {blockedByHistory ? (
        <>
          <div className="warn-note">{error.message}</div>
          {error.details?.breakdown && (
            <ul className="history-breakdown">
              {Object.entries(error.details.breakdown).map(([key, count]) => (
                <li key={key}>
                  <b>{count}</b> {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            Deactivating blocks every form of access and revokes existing sessions, while the
            audit trail keeps naming this person for the actions they actually took.
          </p>
        </>
      ) : (
        <>
          <ErrorNote error={error?.code === 'HAS_HISTORY' ? null : error} />

          <div className="danger-note">
            <strong>{user.fullName}</strong> ({user.email}) will be removed from the system.
            Any project they own or stage they are assigned to must be handed over first.
          </div>

          <Field
            label={`Type “${user.fullName}” to confirm`}
            required
          >
            <input
              type="text" value={typed} autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
              placeholder={user.fullName}
            />
          </Field>
        </>
      )}
    </Modal>
  );
}

/* ── Team create / edit ───────────────────────────────────────────────────── */
function TeamDialog({ team, onClose }) {
  const dispatch = useDispatch();
  const error = useSelector(selectTeamError);
  const users = useSelector(selectUsers);
  const editing = Boolean(team?.id);
  const [form, setForm] = useState({
    name: team?.name ?? '',
    description: team?.description ?? '',
    category: team?.category ?? '',
    leadUserId: team?.leadUserId ?? '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      leadUserId: form.leadUserId ? Number(form.leadUserId) : null,
    };
    const result = editing
      ? await dispatch(updateTeam({ id: team.id, patch: payload }))
      : await dispatch(createTeam(payload));
    setBusy(false);
    if (!result.error) {
      dispatch(pushToast(editing ? `Team “${payload.name}” updated.` : `Team “${payload.name}” created.`, 'success'));
      onClose();
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${team.name}` : 'Create team'}
      subtitle={editing ? `${team.memberCount} member${team.memberCount === 1 ? '' : 's'}` : 'Fields marked * are required.'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="team-form" className="btn" disabled={busy || form.name.trim().length < 2}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create team'}
          </button>
        </>
      }
    >
      <ErrorNote error={error} />
      <form id="team-form" onSubmit={submit}>
        <Field label="Team name" required>
          <input
            type="text" required value={form.name} autoFocus
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Infrastructure"
          />
        </Field>
        <Field label="Department" hint="Groups teams on the cards — Technology, Infrastructure…">
          <input
            type="text" value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Technology"
          />
        </Field>

        <Field label="Team lead" hint="Shown on the team card. Only active users can lead a team.">
          <select
            value={form.leadUserId}
            onChange={(e) => setForm({ ...form, leadUserId: e.target.value })}
          >
            <option value="">No lead yet</option>
            {users.filter((u) => u.isActive && !u.isClientScope).map((u) => (
              <option key={u.id} value={u.id}>{u.fullName} — {u.roleName}</option>
            ))}
          </select>
        </Field>

        <Field label="Description" hint="One line on what this team is responsible for.">
          <input
            type="text" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Environments, networking and platform provisioning."
          />
        </Field>

        {editing && team.members?.length > 0 && (
          <div className="team-members">
            <span className="field-label">Members</span>
            <div className="chip-row">
              {team.members.map((m) => (
                <span key={m.id} className={`chip ${m.isActive ? '' : 'is-muted'}`}>{m.fullName}</span>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

function DeleteTeamDialog({ team, onClose }) {
  const dispatch = useDispatch();
  const error = useSelector(selectTeamError);
  const blocked = error?.code === 'TEAM_IN_PUBLISHED_SOP';

  const confirm = () => {
    dispatch(deleteTeam(team.id)).then((r) => {
      if (!r.error) {
        dispatch(pushToast(`Team “${team.name}” deleted.`, 'success'));
        onClose();
      }
    });
  };

  return (
    <Modal
      title={blocked ? 'This team cannot be deleted' : `Delete ${team.name}?`}
      subtitle={blocked ? undefined : 'The team is removed. Nobody is deleted.'}
      onClose={onClose}
      footer={
        blocked ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            {team.isActive !== false && (
              <button
                type="button" className="btn btn-danger"
                onClick={() => {
                  dispatch(updateTeam({ id: team.id, patch: { isActive: false } })).then((r) => {
                    if (!r.error) dispatch(pushToast(`Team “${team.name}” deactivated.`, 'success'));
                    onClose();
                  });
                }}
              >
                Deactivate instead
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={confirm}>Delete team</button>
          </>
        )
      }
    >
      {blocked ? (
        <>
          <div className="warn-note">{error.message}</div>
          <ul className="history-breakdown">
            {(error.details?.stages ?? []).slice(0, 6).map((row, index) => (
              <li key={index}>{row.templateName} v{row.version} · {row.stageName}</li>
            ))}
          </ul>
          <p className="muted small">
            A deactivated team keeps every published SOP honest: it stops appearing in pickers,
            while the versions that named it stay exactly as they were published.
          </p>
        </>
      ) : (
        <div className="danger-note">
          {team.memberCount === 0
            ? 'This team has no members.'
            : `${team.memberCount} member${team.memberCount === 1 ? '' : 's'} will be left without a team. Their accounts, roles and assignments are untouched.`}
        </div>
      )}
    </Modal>
  );
}

/* ── Teams panel ──────────────────────────────────────────────────────────── */
function TeamsPanel({ canManage, onCreate, onEdit, onDelete }) {
  const teams = useSelector(selectTeams);

  return (
    <section className="card card-pad">
      <div className="card-head bare">
        <div>
          <h3>Teams &amp; departments</h3>
          <p className="muted xsmall">
            Teams drive stage ownership: an SOP stage names a team, and only that team&apos;s
            active members can own it on a project.
          </p>
        </div>
        {canManage && (
          <button type="button" className="btn btn-sm" onClick={onCreate}>+ Create team</button>
        )}
      </div>

      {teams.length === 0 ? (
        <p className="muted small">No teams yet. Create one to group people by function.</p>
      ) : (
        <div className="team-lg-grid">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              onManage={canManage ? onEdit : undefined}
              actions={canManage ? (
                <button
                  type="button" className="icon-btn is-danger"
                  title={`Delete ${team.name}`}
                  onClick={() => onDelete(team)}
                >
                  &#128465;
                </button>
              ) : null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export function UserManagementPage() {
  const dispatch = useDispatch();
  const users = useSelector(selectUsers);
  const roles = useSelector(selectRoles);
  const teams = useSelector(selectTeams);
  const status = useSelector(selectUsersStatus);
  const mutationStatus = useSelector(selectMutationStatus);
  const error = useSelector(selectUsersError);
  const reassign = useSelector(selectReassignState);
  const invite = useSelector(selectLastInvite);

  const canCreate = usePermission('users', 'create');
  const canDelete = usePermission('users', 'delete');
  const canDeactivate = usePermission('users', 'deactivate');

  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [teamDialog, setTeamDialog] = useState(null);   // { team } | { } for new
  const [teamToDelete, setTeamToDelete] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);

  useEffect(() => {
    dispatch(fetchUsers());
    dispatch(fetchRoles());
    dispatch(fetchTeams());
  }, [dispatch]);

  const filtered = useMemo(() => users.filter((user) => {
    const term = search.trim().toLowerCase();
    const matchesTerm = !term
      || user.fullName.toLowerCase().includes(term)
      || user.email.toLowerCase().includes(term);
    const matchesTeam = !teamFilter || String(user.teamId) === teamFilter;
    return matchesTerm && matchesTeam;
  }), [users, search, teamFilter]);

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    pendingInvite: users.filter((u) => u.mustChangePassword).length,
    teams: teams.length,
  }), [users, teams]);

  return (
    <div className="stack">
      <div className="kpi-row">
        <KpiCard icon={UsersIcon} label="Users" value={counts.total} sub={`${counts.active} active`} tone="accent" />
        <KpiCard icon={Building2} label="Teams" value={counts.teams} tone="violet" />
        <KpiCard
          icon={Hourglass} label="Awaiting first sign-in" value={counts.pendingInvite}
          sub="Still on a temporary password" tone="amber"
        />
        <KpiCard icon={KeyRound} label="Roles in use" value={new Set(users.map((u) => u.roleId)).size} tone="neutral" />
      </div>

      <ErrorNote error={error} onDismiss={() => dispatch(clearUsersError())} />

      <TeamsPanel
        canManage={canCreate}
        onCreate={() => setTeamDialog({})}
        onEdit={(team) => setTeamDialog({ team })}
        onDelete={(team) => setTeamToDelete(team)}
      />

      <section className="card">
        <div className="card-head">
          <div className="row gap-sm">
            <input
              type="text" placeholder="Search name or email…" value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ width: 230 }}
            />
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ width: 170 }}>
              <option value="">All teams</option>
              {teams.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
          </div>
          {canCreate && <button type="button" className="btn" onClick={() => setCreating(true)}>+ New user</button>}
        </div>

        {status === 'loading' && !users.length ? (
          <Spinner label="Loading users…" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Role</th><th>Team</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <span className="user-avatar">{user.fullName.slice(0, 1)}</span>
                        <span>
                          <strong>{user.fullName}</strong>
                          <small className="muted">{user.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <Badge tone={user.isClientScope ? 'violet' : 'accent'}>{user.roleName}</Badge>
                      {user.clientName && <div className="muted xsmall">{user.clientName}</div>}
                    </td>
                    <td className="muted">{user.team ?? '—'}</td>
                    <td>
                      <span className={`state-pill ${user.isActive ? 'is-active' : 'is-inactive'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {user.mustChangePassword && (
                        <div className="muted xsmall" title="Has not signed in and replaced the temporary password yet">
                          invite pending
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {!user.isActive && canDeactivate && (
                          <button
                            type="button" className="btn btn-success btn-sm"
                            onClick={() => dispatch(activateUser(user.id)).then((r) => {
                              if (!r.error) dispatch(pushToast(`${user.fullName} activated.`, 'success'));
                            })}
                          >
                            Activate
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button" className="btn btn-danger btn-sm"
                            onClick={() => { dispatch(clearUsersError()); setUserToDelete(user); }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="muted pad">No users match that filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <CreateUserDialog
          roles={roles} teams={teams}
          onClose={() => setCreating(false)}
          busy={mutationStatus === 'loading'}
          onNeedTeam={() => setTeamDialog({})}
        />
      )}
      {invite && <InviteResultDialog invite={invite} onClose={() => dispatch(clearInvite())} />}
      {teamDialog && <TeamDialog team={teamDialog.team} onClose={() => setTeamDialog(null)} />}
      {teamToDelete && <DeleteTeamDialog team={teamToDelete} onClose={() => setTeamToDelete(null)} />}
      {userToDelete && <DeleteUserDialog user={userToDelete} onClose={() => setUserToDelete(null)} />}
      {reassign.user && <ReassignModal />}
    </div>
  );
}
