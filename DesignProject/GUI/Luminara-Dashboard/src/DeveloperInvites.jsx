// Admin-only panel inside User Management: create, list and revoke developer registration keys.
// The server shows a key ONCE, in the response that creates it. This screen keeps it in memory only while the dialog is open
// (never in localStorage) and the list never receives it.
import { useCallback, useEffect, useState } from 'react';
import { Modal, ConfirmDialog } from './Dialogs.jsx';
import { Field, inputCls, CardTitle } from './uiKit.jsx';
import { apiListInvites, apiCreateInvite, apiRevokeInvite } from './api.js';

const btnOutline = 'h-[38px] px-4 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50 transition-colors disabled:opacity-60';
const btnPrimary = 'h-[42px] px-5 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52] transition-colors disabled:opacity-60';
const STATUS = {
  ACTIVE: ['Active', 'bg-[#e3f4ea] text-[#1f9a52]'],
  USED: ['Used', 'bg-[#e6edfc] text-[#3b82f6]'],
  REVOKED: ['Revoked', 'bg-[#fde8e8] text-[#e04040]'],
  EXPIRED: ['Expired', 'bg-[#eceff3] text-[#5b6b82]'],
};
const when = (ms) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const Tag = ({ status }) => {
  const [label, cls] = STATUS[status] || STATUS.EXPIRED;
  return <span className={`inline-flex items-center justify-center rounded-md text-[11px] font-bold uppercase px-2.5 h-7 ${cls}`}>{label}</span>;
};

const Head = ({ id, title, sub, onClose }) => (
  <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-[#e6ebf1]">
    <div className="min-w-0">
      <h2 id={id} className="text-lg font-bold text-[#14233c]">{title}</h2>
      {sub && <div className="text-xs text-[#6b7a90] mt-0.5">{sub}</div>}
    </div>
    <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 w-10 h-10 flex items-center justify-center rounded-lg text-xl leading-none text-[#6b7a90] hover:bg-gray-50">×</button>
  </div>
);

const NewKeyForm = ({ onCancel, onCreated }) => {
  const [label, setLabel] = useState('');
  const [days, setDays] = useState('7');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError('');
    try {
      onCreated(await apiCreateInvite(label, Number(days)));
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate>
      <Head id="di-title" title="New developer registration key" sub="A key lets ONE person create a Developer account." onClose={onCancel} />
      <div className="px-5 sm:px-6 pt-5">
        <Field label="Who is this key for? *" error={errors.label} hint="A label only you will see, for example the person’s name.">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} autoComplete="off" />
        </Field>
        <Field label="Valid for" error={errors.expiresInDays}>
          <select className={inputCls} value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </Field>
      </div>
      {formError && <div role="alert" className="mx-5 sm:mx-6 mb-3 px-3 py-2 rounded-lg bg-[#fde8e8] text-[#e04040] text-sm font-semibold">{formError}</div>}
      <div className="flex justify-end gap-3 px-5 sm:px-6 py-4 border-t border-[#e6ebf1]">
        <button type="button" onClick={onCancel} className={btnOutline}>Cancel</button>
        <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Creating…' : 'Create key'}</button>
      </div>
    </form>
  );
};

// Shown exactly once. The server cannot show the key again, it keeps only a hash.
const ShowKey = ({ invite, keyText, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(keyText); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <>
      <Head id="di-title" title="Registration key created" sub={`${invite.label} · valid until ${when(invite.expiresAt)}`} onClose={onClose} />
      <div className="px-5 sm:px-6 py-5">
        <p className="text-sm text-[#5b6b82]">Give this key to the developer in person or by a private channel. It is shown <b>only once</b> and works <b>one time</b>. If you lose it, revoke it and create a new one.</p>
        <div className="mt-4 flex items-center gap-2">
          <code data-testid="invite-key" className="flex-1 min-w-0 break-all rounded-lg bg-[#f3f6f9] border border-[#e1e7ee] px-4 py-3 text-sm font-bold text-[#14233c]">{keyText}</code>
          <button type="button" onClick={copy} className={btnOutline}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>
      <div className="flex justify-end px-5 sm:px-6 py-4 border-t border-[#e6ebf1]"><button type="button" onClick={onClose} className={btnPrimary}>I have saved it</button></div>
    </>
  );
};

export default function DeveloperInvites() {
  const [invites, setInvites] = useState(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // { mode: 'new' } | { mode: 'key', invite, key } | { mode: 'revoke', invite }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const reload = useCallback(async () => {
    try {
      setInvites(await apiListInvites());
      setError('');
    } catch (e) {
      setError(e.message);
      setInvites((x) => x ?? []);
    }
  }, []);
  useEffect(() => {
    let live = true;
    apiListInvites()
      .then((r) => { if (live) { setInvites(r); setError(''); } })
      .catch((e) => { if (live) { setError(e.message); setInvites((x) => x ?? []); } });
    return () => { live = false; };
  }, []);

  const revoke = async (invite) => {
    setBusy(true);
    try {
      await apiRevokeInvite(invite.id);
      setToast({ kind: 'ok', text: `The key for “${invite.label}” was revoked.` });
    } catch (e) {
      setToast({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
      setDialog(null);
      await reload();
    }
  };

  return (
    <div className="mt-6 bg-white border border-[#e6ebf1] rounded-2xl p-4 md:p-6">
      <CardTitle right={<button type="button" onClick={() => setDialog({ mode: 'new' })} className={btnPrimary}>+ New key</button>}>Developer registration keys</CardTitle>
      <p className="text-xs text-[#6b7a90] -mt-2 mb-4">A developer registers themselves on the sign-in page with one of these keys. Each key works once, expires, and can create only a Developer account (read-only technical access), never an Administrator.</p>
      {toast && <div role={toast.kind === 'error' ? 'alert' : 'status'} className={`mb-4 px-4 py-3 rounded-lg text-sm font-semibold ${toast.kind === 'error' ? 'bg-[#fde8e8] text-[#e04040]' : 'bg-[#e3f4ea] text-[#1f9a52]'}`}>{toast.text}</div>}
      {error && <div role="alert" className="mb-3 text-sm font-semibold text-[#e04040]">{error}</div>}
      {invites === null ? <p className="py-6 text-center text-sm text-[#6b7a90]">Loading keys…</p> : invites.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#6b7a90]">No registration keys yet.</p>
      ) : (
        <ul>
          {invites.map((i) => (
            <li key={i.id} className="py-3 border-b border-[#e6ebf1] last:border-b-0 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><span className="font-bold text-sm">{i.label}</span><Tag status={i.status} /></div>
                <div className="text-xs text-[#6b7a90] mt-1">
                  Created {when(i.createdAt)}{i.createdByName ? ` by ${i.createdByName}` : ''} · expires {when(i.expiresAt)}
                  {i.status === 'USED' && ` · used ${when(i.usedAt)}${i.usedByUsername ? ` by ${i.usedByUsername}` : ''}`}
                  {i.status === 'REVOKED' && ` · revoked ${when(i.revokedAt)}${i.revokedByName ? ` by ${i.revokedByName}` : ''}`}
                </div>
              </div>
              {i.status === 'ACTIVE' && <button type="button" onClick={() => setDialog({ mode: 'revoke', invite: i })} className={btnOutline}>Revoke</button>}
            </li>
          ))}
        </ul>
      )}

      {dialog?.mode === 'new' && (
        <Modal labelledBy="di-title" onClose={() => setDialog(null)}>
          <NewKeyForm onCancel={() => setDialog(null)} onCreated={async (r) => { setDialog({ mode: 'key', invite: r.invite, key: r.key }); await reload(); }} />
        </Modal>
      )}
      {dialog?.mode === 'key' && <Modal labelledBy="di-title" onClose={() => setDialog(null)}><ShowKey invite={dialog.invite} keyText={dialog.key} onClose={() => setDialog(null)} /></Modal>}
      {dialog?.mode === 'revoke' && (
        <ConfirmDialog title={`Revoke the key for “${dialog.invite.label}”?`} confirmLabel={busy ? 'Working…' : 'Revoke key'} onCancel={() => setDialog(null)} onConfirm={() => revoke(dialog.invite)}>
          The key stops working immediately. Nobody can register with it afterwards.
        </ConfirmDialog>
      )}
    </div>
  );
}
