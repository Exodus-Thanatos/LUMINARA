// Shown instead of the dashboard when an account has a temporary password (new account or admin reset).
import { useState } from 'react';
import { Modal } from './Dialogs.jsx';
import { Field, inputCls } from './uiKit.jsx';
import { apiChangePassword, ApiError } from './api.js';

export default function PasswordChange({ user, onChanged, onSignOut }) {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setErrors((p) => ({ ...p, [k]: undefined })); };
  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.confirm) { setErrors({ confirm: 'The two passwords do not match.' }); return; }
    setBusy(true);
    setMsg('');
    try {
      onChanged(await apiChangePassword(f.current, f.next));
    } catch (err) {
      if (err instanceof ApiError && err.fields?.currentPassword) setErrors({ current: err.fields.currentPassword });
      else if (err instanceof ApiError && err.fields?.newPassword) setErrors({ next: err.fields.newPassword });
      else setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen bg-[#12213a]">
      <Modal labelledBy="pc-title" onClose={() => {}}>
        <form onSubmit={submit} noValidate>
          <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-[#e6ebf1]">
            <h2 id="pc-title" className="text-lg font-bold text-[#14233c]">Choose a new password</h2>
            <p className="text-xs text-[#6b7a90] mt-1">Hello {user.fullName}. Your account uses a temporary password, so you must set your own before continuing.</p>
          </div>
          <div className="px-5 sm:px-6 pt-5">
            <Field label="Current (temporary) password" error={errors.current}><input type="password" className={inputCls} value={f.current} onChange={set('current')} autoComplete="current-password" /></Field>
            <Field label="New password" error={errors.next} hint="At least 10 characters, with a letter and a number."><input type="password" className={inputCls} value={f.next} onChange={set('next')} autoComplete="new-password" /></Field>
            <Field label="Confirm new password" error={errors.confirm}><input type="password" className={inputCls} value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></Field>
            {msg && <div role="alert" className="mb-3 px-3 py-2 rounded-lg bg-[#fde8e8] text-[#e04040] text-sm font-semibold">{msg}</div>}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-5 sm:px-6 py-4 border-t border-[#e6ebf1]">
            <button type="button" onClick={onSignOut} className="h-[42px] px-5 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">Sign out</button>
            <button type="submit" disabled={busy} className="h-[42px] px-5 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] disabled:opacity-60">{busy ? 'Saving…' : 'Save new password'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
