// Admin-only User Management: list, add, edit, change role, activate / deactivate, reset password.
// Everything is enforced by the server (ADMIN only); this screen only talks to /api/users.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ConfirmDialog } from './Dialogs.jsx';
import { Field, inputCls, CardTitle } from './uiKit.jsx';
import { apiListUsers, apiCreateUser, apiUpdateUser, apiResetPassword, ApiError } from './api.js';
import { ROLE_LABEL } from './access.js';
import { loadUsers as loadBrowserWorkers } from './technicianStore.js';
import DeveloperInvites from './DeveloperInvites.jsx';

const btnOutline = 'h-[38px] px-4 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50 transition-colors disabled:opacity-60';
const btnPrimary = 'h-[42px] px-5 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] transition-colors disabled:opacity-60';
const ROLE_BADGE = { ADMIN: 'bg-[#e6edfc] text-[#3b82f6]', TECHNICIAN: 'bg-[#fff3d6] text-[#c98a0a]', STAFF: 'bg-[#eceff3] text-[#5b6b82]', BASIC: 'bg-[#e3f4ea] text-[#1f9a52]', DEVELOPER: 'bg-[#efe7fb] text-[#7a4bc4]' };
const Tag = ({ cls, children }) => <span className={`inline-flex items-center justify-center rounded-md text-[11px] font-bold uppercase px-2.5 h-7 ${cls}`}>{children}</span>;
const StatusTag = ({ status }) => <Tag cls={status === 'ACTIVE' ? 'bg-[#e3f4ea] text-[#1f9a52]' : 'bg-[#fde8e8] text-[#e04040]'}>{status === 'ACTIVE' ? 'Active' : 'Inactive'}</Tag>;
const when = (ms) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

const ModalHeader = ({ id, title, sub, onClose }) => (
  <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-[#e6ebf1]">
    <div className="min-w-0">
      <h2 id={id} className="text-lg font-bold text-[#14233c]">{title}</h2>
      {sub && <div className="text-xs text-[#6b7a90] mt-0.5">{sub}</div>}
    </div>
    <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 w-10 h-10 flex items-center justify-center rounded-lg text-xl leading-none text-[#6b7a90] hover:bg-gray-50">×</button>
  </div>
);

// Shown exactly once. The server never returns a temporary password again.
const TempPassword = ({ title, who, password, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(password); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <Modal labelledBy="tp-title" onClose={onClose}>
      <ModalHeader id="tp-title" title={title} sub={who} onClose={onClose} />
      <div className="px-5 sm:px-6 py-5">
        <p className="text-sm text-[#5b6b82]">Give this temporary password to the user in person or by a private channel. It is shown <b>only once</b>. They must choose a new password the first time they sign in.</p>
        <div className="mt-4 flex items-center gap-2">
          <code data-testid="temp-password" className="flex-1 min-w-0 break-all rounded-lg bg-[#f3f6f9] border border-[#e1e7ee] px-4 py-3 text-base font-bold tracking-wide text-[#14233c]">{password}</code>
          <button type="button" onClick={copy} className={btnOutline}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
      <div className="flex justify-end px-5 sm:px-6 py-4 border-t border-[#e6ebf1]"><button type="button" onClick={onClose} className={btnPrimary}>I have saved it</button></div>
    </Modal>
  );
};

const emptyAdd = { fullName: '', username: '', email: '', role: 'STAFF', accountStatus: 'ACTIVE', generate: true, password: '', confirmPassword: '' };

const UserForm = ({ user, onCancel, onSaved }) => {
  const [f, setF] = useState(user ? { fullName: user.fullName, username: user.username, email: user.email, role: user.role, accountStatus: user.accountStatus } : emptyAdd);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      if (user) {
        const saved = await apiUpdateUser(user.id, { fullName: f.fullName, username: f.username, email: f.email, role: f.role, accountStatus: f.accountStatus });
        onSaved({ user: saved, edited: true });
      } else {
        const r = await apiCreateUser({ fullName: f.fullName, username: f.username, email: f.email, role: f.role, accountStatus: f.accountStatus, generateTemporaryPassword: f.generate, password: f.generate ? undefined : f.password, confirmPassword: f.generate ? undefined : f.confirmPassword });
        onSaved({ user: r.user, temporaryPassword: r.temporaryPassword });
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <div className="px-5 sm:px-6 pt-5 grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4">
        <div className="sm:col-span-2"><Field label="Full name *" error={errors.fullName}><input className={inputCls} value={f.fullName} onChange={set('fullName')} maxLength={80} autoComplete="off" /></Field></div>
        <Field label="Username *" error={errors.username} hint="Letters, numbers, . - _"><input className={inputCls} value={f.username} onChange={set('username')} maxLength={32} autoComplete="off" /></Field>
        <Field label="Email address *" error={errors.email}><input type="email" className={inputCls} value={f.email} onChange={set('email')} autoComplete="off" /></Field>
        <Field label="User role *" error={errors.role}>
          <select className={inputCls} value={f.role} onChange={set('role')}>
            <option value="ADMIN">Administrator: full access</option>
            <option value="TECHNICIAN">Technician: maintenance tasks</option>
            <option value="STAFF">Staff: general dashboard access</option>
            <option value="BASIC">Basic: simplified read-only dashboard</option>
            <option value="DEVELOPER">Developer: read-only technical access</option>
          </select>
        </Field>
        <Field label="Account status" error={errors.accountStatus}>
          <select className={inputCls} value={f.accountStatus} onChange={set('accountStatus')}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive (cannot sign in)</option>
          </select>
        </Field>
        {!user && (
          <>
            <div className="sm:col-span-2 mb-3">
              <label className="flex items-start gap-2 text-sm text-[#14233c]">
                <input type="checkbox" checked={f.generate} onChange={(e) => setF((p) => ({ ...p, generate: e.target.checked }))} className="mt-1 accent-[#27a85a]" />
                <span><b>Generate a secure temporary password</b><span className="block text-xs text-[#6b7a90]">Recommended. It is shown once after saving.</span></span>
              </label>
            </div>
            {!f.generate && (
              <>
                <Field label="Password *" error={errors.password} hint="At least 10 characters, with a letter and a number."><input type="password" className={inputCls} value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
                <Field label="Confirm password *" error={errors.confirmPassword}><input type="password" className={inputCls} value={f.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" /></Field>
              </>
            )}
          </>
        )}
      </div>
      {formError && <div role="alert" className="mx-5 sm:mx-6 mb-3 px-3 py-2 rounded-lg bg-[#fde8e8] text-[#e04040] text-sm font-semibold">{formError}</div>}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 px-5 sm:px-6 py-4 border-t border-[#e6ebf1]">
        <button type="button" onClick={onCancel} className={btnOutline}>Cancel</button>
        <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : user ? 'Save changes' : 'Create user'}</button>
      </div>
    </form>
  );
};

export default function UserManagement({ Page, Header, Card, currentUser }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // {mode:'add'} | {mode:'edit', user} | {mode:'deactivate', user} | {mode:'reset', user} | {mode:'temp', ...}
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const browserWorkers = useMemo(() => loadBrowserWorkers(), []);

  const reload = useCallback(async () => {
    try {
      setUsers(await apiListUsers());
      setError('');
    } catch (e) {
      setError(e.message);
      setUsers((u) => u ?? []);
    }
  }, []);
  useEffect(() => {
    let live = true;
    apiListUsers()
      .then((u) => { if (live) { setUsers(u); setError(''); } })
      .catch((e) => { if (live) { setError(e.message); setUsers((x) => x ?? []); } });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const term = search.trim().toLowerCase();
  const rows = (users || []).filter((u) => !term || [u.fullName, u.username, u.email, u.role].some((v) => v.toLowerCase().includes(term)));
  const admins = (users || []).filter((u) => u.role === 'ADMIN' && u.accountStatus === 'ACTIVE').length;

  const setStatus = async (u, accountStatus) => {
    setBusy(true);
    try {
      await apiUpdateUser(u.id, { accountStatus });
      setToast({ kind: 'ok', text: `${u.fullName} is now ${accountStatus === 'ACTIVE' ? 'active' : 'inactive'}.` });
      setDialog(null);
      await reload();
    } catch (e) {
      setToast({ kind: 'error', text: e.message });
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };
  const doReset = async (u) => {
    setBusy(true);
    try {
      const r = await apiResetPassword(u.id);
      setDialog({ mode: 'temp', title: 'Temporary password', who: `${u.fullName} (${u.username})`, password: r.temporaryPassword });
      await reload();
    } catch (e) {
      setToast({ kind: 'error', text: e.message });
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const Actions = ({ u }) => (
    <div className="flex flex-wrap gap-2 justify-end">
      <button type="button" className={btnOutline} onClick={() => setDialog({ mode: 'edit', user: u })} aria-label={`Edit ${u.fullName}`}>Edit</button>
      <button type="button" className={btnOutline} onClick={() => setDialog({ mode: 'reset', user: u })} aria-label={`Reset password for ${u.fullName}`}>Reset password</button>
      {u.accountStatus === 'ACTIVE'
        ? <button type="button" className={btnOutline} onClick={() => setDialog({ mode: 'deactivate', user: u })} aria-label={`Deactivate ${u.fullName}`}>Deactivate</button>
        : <button type="button" className={btnOutline} onClick={() => setStatus(u, 'ACTIVE')} aria-label={`Activate ${u.fullName}`}>Activate</button>}
    </div>
  );

  return (
    <Page>
      <Header
        title="User Management"
        subtitle="Create accounts and control who can sign in"
        actions={
          <div className="flex flex-wrap gap-3">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." aria-label="Search users" className="h-[42px] w-full sm:w-56 px-3 bg-white border border-[#e1e7ee] rounded-md text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-[#27a85a]/30" />
            <button type="button" onClick={() => setDialog({ mode: 'add' })} className="h-[42px] px-6 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] transition-colors">+ Add User</button>
          </div>
        }
      />
      {toast && (
        <div role={toast.kind === 'error' ? 'alert' : 'status'} className={`mb-4 px-4 py-3 rounded-lg text-sm font-semibold flex items-start justify-between gap-3 ${toast.kind === 'error' ? 'bg-[#fde8e8] text-[#e04040]' : 'bg-[#e3f4ea] text-[#1f9a52]'}`}>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss message" className="leading-none text-lg -mt-0.5">×</button>
        </div>
      )}
      {browserWorkers.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg text-xs text-[#8a6410] bg-[#fffaf0] border border-[#f6d587]">
          <b>Workers registered in this browser by the old prototype ({browserWorkers.length}):</b> {browserWorkers.map((w) => `${w.name}${w.email ? ` <${w.email}>` : ''}`).join(', ')}. They never had passwords and cannot sign in. Create them here with “Add User” so they can be assigned to tickets.
        </div>
      )}
      <Card big className="p-4 md:p-6">
        <CardTitle right={<span className="text-xs text-[#6b7a90]">{users ? `${users.length} user${users.length === 1 ? '' : 's'} · ${admins} active administrator${admins === 1 ? '' : 's'}` : ''}</span>}>Registered users</CardTitle>
        {error && <div role="alert" className="mb-3 text-sm font-semibold text-[#e04040]">{error}</div>}
        {users === null ? <p className="py-8 text-center text-sm text-[#6b7a90]">Loading users…</p> : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#f3f6f9] text-xs font-bold text-[#6b7a90] uppercase">
                    <th className="py-4 pl-4 rounded-l-lg">Name</th><th className="py-4">Username / Email</th><th className="py-4">Role</th><th className="py-4">Status</th><th className="py-4">Last sign-in</th>
                    <th className="py-4 pr-4 rounded-r-lg"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u, i) => (
                    <tr key={u.id} className={`${i % 2 === 1 ? 'bg-[#f8fafc]' : ''}`}>
                      <td className="pl-4 py-3 font-bold text-sm">{u.fullName}{u.id === currentUser.id && <span className="ml-2 text-[11px] font-semibold text-[#6b7a90]">(you)</span>}</td>
                      <td className="text-sm py-3"><div>{u.username}</div><div className="text-xs text-[#6b7a90]">{u.email}</div></td>
                      <td><Tag cls={ROLE_BADGE[u.role]}>{ROLE_LABEL[u.role]}</Tag></td>
                      <td><StatusTag status={u.accountStatus} />{u.mustChangePassword && <div className="text-[10px] text-[#8a6410] mt-1">Must change password</div>}</td>
                      <td className="text-sm text-[#6b7a90]">{when(u.lastLoginAt)}</td>
                      <td className="pr-4"><Actions u={u} /></td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-[#6b7a90]">{users.length === 0 ? 'No users yet.' : 'No users match your search.'}</td></tr>}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden">
              {rows.map((u) => (
                <li key={u.id} className="py-4 border-b-2 border-[#e6ebf1] last:border-b-0">
                  <div className="flex items-center justify-between gap-3"><span className="font-bold text-sm">{u.fullName}{u.id === currentUser.id ? ' (you)' : ''}</span><StatusTag status={u.accountStatus} /></div>
                  <div className="text-xs text-[#6b7a90] mt-0.5 break-all">{u.username} · {u.email}</div>
                  <div className="mt-2 flex items-center gap-2"><Tag cls={ROLE_BADGE[u.role]}>{ROLE_LABEL[u.role]}</Tag><span className="text-[11px] text-[#6b7a90]">Last sign-in: {when(u.lastLoginAt)}</span></div>
                  <div className="mt-3"><Actions u={u} /></div>
                </li>
              ))}
              {rows.length === 0 && <li className="py-10 text-center text-sm text-[#6b7a90]">{users.length === 0 ? 'No users yet.' : 'No users match your search.'}</li>}
            </ul>
          </>
        )}
      </Card>

      <DeveloperInvites />

      {(dialog?.mode === 'add' || dialog?.mode === 'edit') && (
        <Modal labelledBy="um-title" onClose={() => setDialog(null)} wide>
          <ModalHeader id="um-title" title={dialog.mode === 'add' ? 'Add user' : `Edit ${dialog.user.fullName}`} sub="Fields marked * are required." onClose={() => setDialog(null)} />
          <UserForm
            user={dialog.mode === 'edit' ? dialog.user : null}
            onCancel={() => setDialog(null)}
            onSaved={async (r) => {
              await reload();
              if (r.temporaryPassword) setDialog({ mode: 'temp', title: 'User created', who: `${r.user.fullName} (${r.user.username}) · ${ROLE_LABEL[r.user.role]}`, password: r.temporaryPassword });
              else { setDialog(null); setToast({ kind: 'ok', text: r.edited ? `${r.user.fullName} updated.` : `${r.user.fullName} created.` }); }
            }}
          />
        </Modal>
      )}
      {dialog?.mode === 'temp' && <TempPassword title={dialog.title} who={dialog.who} password={dialog.password} onClose={() => setDialog(null)} />}
      {dialog?.mode === 'deactivate' && (
        <ConfirmDialog title={`Deactivate ${dialog.user.fullName}?`} confirmLabel={busy ? 'Working…' : 'Deactivate'} onCancel={() => setDialog(null)} onConfirm={() => setStatus(dialog.user, 'INACTIVE')}>
          They will be signed out immediately and cannot sign in again until you activate the account. Their tickets and history are kept.
        </ConfirmDialog>
      )}
      {dialog?.mode === 'reset' && (
        <ConfirmDialog title={`Reset password for ${dialog.user.fullName}?`} confirmLabel={busy ? 'Working…' : 'Reset password'} onCancel={() => setDialog(null)} onConfirm={() => doReset(dialog.user)}>
          A new temporary password is generated and shown once. Their current password stops working, every device is signed out, and they must choose a new password at the next sign-in.
        </ConfirmDialog>
      )}
    </Page>
  );
}
