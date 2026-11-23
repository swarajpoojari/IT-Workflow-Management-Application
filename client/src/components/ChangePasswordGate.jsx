import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { changePassword, selectUser } from '../features/auth/authSlice.js';
import { Modal } from './ui/Modal.jsx';
import { Field, ErrorNote } from './ui/Bits.jsx';
import { pushToast } from '../features/ui/uiSlice.js';

/**
 * A temporary password is a credential someone else has seen. The app stays
 * behind this dialog until it is replaced — there is no dismiss, because
 * skipping it would leave that password valid indefinitely.
 */
export function ChangePasswordGate() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const error = useSelector((s) => s.auth.error);

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  if (!user?.mustChangePassword) return null;

  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;
  const valid = form.currentPassword.length > 0
    && form.newPassword.length >= 8
    && /[A-Za-z]/.test(form.newPassword)
    && /[0-9]/.test(form.newPassword)
    && !mismatch
    && form.confirm.length > 0;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const result = await dispatch(changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    }));
    setBusy(false);
    if (!result.error) dispatch(pushToast('Password updated. Other sessions were signed out.', 'success'));
  };

  return (
    <Modal
      title="Choose your password"
      subtitle="Your account was created with a temporary password. Replace it to continue."
      dismissible={false}
      footer={
        <button type="submit" form="change-password-form" className="btn" disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Set password'}
        </button>
      }
    >
      <ErrorNote error={error} />

      <form id="change-password-form" onSubmit={submit}>
        <Field label="Temporary password" required>
          <input
            type="password" required autoFocus autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
        </Field>

        <Field label="New password" required hint="At least 8 characters, with a letter and a digit.">
          <input
            type="password" required minLength={8} autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
        </Field>

        <Field
          label="Confirm new password" required
          error={mismatch ? 'The two passwords do not match.' : undefined}
        >
          <input
            type="password" required autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </Field>
      </form>
    </Modal>
  );
}
