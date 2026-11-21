// Developer registration form (sign-in page). The key is checked by the server; this form never knows the valid keys, and it
// never sends a role: the server alone decides that a valid key creates a DEVELOPER account.
import { useState } from 'react';
import { apiRegisterDeveloper } from './api.js';

const fieldCls = 'w-full h-[48px] bg-[#f3f6f9] border border-[#e1e7ee] rounded-lg px-4 text-base text-[#14233c] placeholder:text-[#9aa7b8] outline-none focus:ring-1 focus:ring-[#27a85a]';
const labelCls = 'block text-xs font-bold text-[#6b7a90] uppercase mb-1.5';
const Err = ({ children }) => (children ? <p role="alert" className="text-[11px] font-semibold text-[#e04040] mt-1">{children}</p> : null);

export default function DeveloperRegister({ onBack, onDone }) {
  const [f, setF] = useState({ fullName: '', username: '', email: '', password: '', confirmPassword: '', registrationKey: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError('');
    try {
      await apiRegisterDeveloper(f);
      onDone(f.username.trim());
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(err.message);
      setF((x) => ({ ...x, password: '', confirmPassword: '' }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="bg-white rounded-[2rem] lg:rounded-[3rem] p-6 sm:p-10 lg:p-12 w-full max-w-[536px]">
      <h2 className="text-3xl font-bold text-[#14233c] mb-2">Developer registration</h2>
      <p className="text-sm text-[#6b7a90] mb-6">You need a registration key from a LUMINARA administrator.</p>

      <label htmlFor="reg-key" className={labelCls}>Registration key</label>
      <input id="reg-key" type="password" autoComplete="off" spellCheck={false} value={f.registrationKey} onChange={set('registrationKey')} placeholder="LDK-…" className={`${fieldCls} mb-1`} />
      <Err>{errors.registrationKey}</Err>

      <label htmlFor="reg-name" className={`${labelCls} mt-4`}>Full name</label>
      <input id="reg-name" type="text" autoComplete="name" value={f.fullName} onChange={set('fullName')} maxLength={80} className={fieldCls} />
      <Err>{errors.fullName}</Err>

      <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4">
        <div>
          <label htmlFor="reg-user" className={`${labelCls} mt-4`}>Username</label>
          <input id="reg-user" type="text" autoComplete="username" autoCapitalize="none" value={f.username} onChange={set('username')} maxLength={32} className={fieldCls} />
          <Err>{errors.username}</Err>
        </div>
        <div>
          <label htmlFor="reg-email" className={`${labelCls} mt-4`}>Email</label>
          <input id="reg-email" type="email" autoComplete="email" value={f.email} onChange={set('email')} className={fieldCls} />
          <Err>{errors.email}</Err>
        </div>
        <div>
          <label htmlFor="reg-pw" className={`${labelCls} mt-4`}>Password</label>
          <input id="reg-pw" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} className={fieldCls} />
          <Err>{errors.password}</Err>
        </div>
        <div>
          <label htmlFor="reg-pw2" className={`${labelCls} mt-4`}>Confirm password</label>
          <input id="reg-pw2" type="password" autoComplete="new-password" value={f.confirmPassword} onChange={set('confirmPassword')} className={fieldCls} />
          <Err>{errors.confirmPassword}</Err>
        </div>
      </div>
      <p className="text-[11px] text-[#6b7a90] mt-2">At least 10 characters, with a letter and a number.</p>

      {formError && <p role="alert" className="text-sm font-semibold text-[#e04040] bg-[#fde8e8] rounded-lg px-3 py-2 mt-4">{formError}</p>}
      <button type="submit" disabled={busy} className="w-full h-[56px] mt-5 bg-[#27a85a] hover:bg-[#1f9a52] disabled:opacity-70 text-white font-bold rounded-lg text-base">{busy ? 'CREATING ACCOUNT…' : 'CREATE DEVELOPER ACCOUNT'}</button>
      <button type="button" onClick={onBack} className="w-full text-center text-xs font-bold text-[#27a85a] mt-4">← Back to sign in</button>
    </form>
  );
}
