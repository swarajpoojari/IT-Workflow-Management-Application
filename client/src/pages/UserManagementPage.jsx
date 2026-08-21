import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchUsers, fetchRoles, createUser, deactivateUser, activateUser,
  reassignAssignments, closeReassignModal, clearUsersError,
  selectUsers, selectRoles, selectUsersStatus, selectUsersError,
  selectReassignState, selectReassignCandidates,
} from '../features/users/usersSlice.js';
import { usePermission } from '../hooks/usePermission.js';
import { Modal } from '../components/ui/Modal.jsx';
import { Badge, ErrorNote, Field, Spinner, StatusBadge } from '../components/ui/Bits.jsx';

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
    next.has(stageId) ? next.delete(stageId) : next.add(stageId);
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
      title={done ? 'Assignments moved' : 'Reassign work before deactivating'}
      subtitle={
        done
          ? `${reassign.movedCount} stage${reassign.movedCount === 1 ? '' : 's'} moved. You can now deactivate this user.`
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
            {/* Retrying deactivation now succeeds: the server's 409 guard has
                nothing left to find. */}
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
          All active assignments have been reassigned. Deactivation is no longer blocked.
        </div>
      ) : (
        <>
          {/* The server refused the deactivation and told us exactly why.
              This is `error.details.assignments` from the 409, rendered. */}
          <div className="warn-note">
            The API returned <code>409 ACTIVE_ASSIGNMENTS</code>. Deactivation stays blocked until every
            stage below has a new owner — this prevents orphaning live work.
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

          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Reassignment changes ownership only — every stage keeps its current status.
          </p>
        </>
      )}
    </Modal>
  );
}

function CreateUserDialog({ roles, onClose, busy }) {
  const dispatch = useDispatch();
  const [form, setForm] = useState({
    email: '', password: '', fullName: '', roleId: '', team: '', clientName: '',
  });

  const role = roles.find((r) => r.id === Number(form.roleId));
  const needsClientName = Boolean(role?.isClientScope);

  const submit = (event) => {
    event.preventDefault();
    dispatch(createUser({
      email: form.email.trim(),
      password: form.password,
      fullName: form.fullName.trim(),
      roleId: Number(form.roleId),
      team: form.team.trim() || null,
      clientName: needsClientName ? form.clientName.trim() : null,
    })).then((result) => { if (!result.error) onClose(); });
  };

  return (
    <Modal
      title="Create user"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="user-form" className="btn" disabled={busy}>Create user</button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit}>
        <Field label="Full name" required>
          <input type="text" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </Field>
        <Field label="Email" required>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" required hint="Minimum 8 characters, with at least one letter and one digit.">
          <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Field label="Role" required>
          <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
            <option value="">Select a role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Team">
          <input type="text" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} placeholder="e.g. Infrastructure" />
        </Field>
        {needsClientName && (
          <Field label="Client organisation" required hint="Scopes which projects this user can read. Required for client roles.">
            <input type="text" required value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

export function UserManagementPage() {
  const dispatch = useDispatch();
  const users = useSelector(selectUsers);
  const roles = useSelector(selectRoles);
  const status = useSelector(selectUsersStatus);
  const error = useSelector(selectUsersError);
  const reassign = useSelector(selectReassignState);

  const canCreate = usePermission('users', 'create');
  const canDeactivate = usePermission('users', 'deactivate');

  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    dispatch(fetchUsers());
    dispatch(fetchRoles());
  }, [dispatch]);

  const filtered = users.filter(
    (user) =>
      !search ||
      user.fullName.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>User Management</h1>
          <p>
            Create users, assign roles and teams. Deactivating a user who still owns live work is
            refused by the API with <code>409</code> until that work is reassigned.
          </p>
        </div>
        <div className="row">
          <input type="text" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
          {canCreate && <button type="button" className="btn" onClick={() => setCreating(true)}>+ New user</button>}
        </div>
      </div>

      <ErrorNote error={error} onDismiss={() => dispatch(clearUsersError())} />

      <div className="card">
        {status === 'loading' ? (
          <Spinner label="Loading users…" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.fullName}</strong></td>
                    <td className="muted">{user.email}</td>
                    <td>
                      <Badge tone={user.isClientScope ? 'violet' : 'accent'}>{user.roleName}</Badge>
                      {user.clientName && <div className="muted" style={{ fontSize: 11.5 }}>{user.clientName}</div>}
                    </td>
                    <td className="muted">{user.team ?? '—'}</td>
                    <td>
                      <Badge tone={user.isActive ? 'green' : 'neutral'}>{user.isActive ? 'Active' : 'Deactivated'}</Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {canDeactivate && (
                        user.isActive ? (
                          <button
                            type="button" className="btn btn-ghost btn-sm"
                            // A 409 opens the reassign modal with the blocking list.
                            onClick={() => dispatch(deactivateUser(user))}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch(activateUser(user.id))}>
                            Reactivate
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <CreateUserDialog roles={roles} onClose={() => setCreating(false)} busy={status === 'loading'} />}
      {reassign.user && <ReassignModal />}
    </>
  );
}
