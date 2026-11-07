// Settings (Phase 1, UI only). Layout follows the reference images.
// Only "Compact Map View" is connected to anything that exists today (the Map's "show sample locations" setting).
// Everything tagged UI ONLY is a preview: no alert, threshold or export is created or sent.
// Create Worker Account is the exception: it registers the person in the PROTOTYPE technician registry saved in this browser (technicianStore.js).
// There is still no server-side user database or login, so this creates no login account.
import { useState } from 'react';
import { CircleCheck, Download, Info } from 'lucide-react';
import { ConfirmDialog } from './Dialogs.jsx';
import { CardTitle, Field, StatusTag, ToggleRow, inputCls } from './uiKit.jsx';
import { setTheme, useTheme } from './theme.js';
import { ROLES, loadUsers, saveUsers, registerUser, validateRegistration } from './technicianStore.js';

const TABS = [
  ['profile', 'Profile & Account'],
  ['system', 'System & Notifications'],
];

const Notice = ({ children }) => (
  <div className="flex gap-2.5 items-start bg-[#fffaf0] border border-[#f6d587] text-[#8a6410] rounded-lg px-4 py-3 text-xs mb-5">
    <Info size={15} className="shrink-0 mt-0.5" />
    <div>{children}</div>
  </div>
);

const Settings = ({ Page, Header, Card, compactMap, onCompactMapChange }) => {
  const theme = useTheme();
  const [tab, setTab] = useState('profile');
  const [alerts, setAlerts] = useState({ email: true, sms: true, daily: false });
  const [msg, setMsg] = useState('');
  const switchTab = (t) => { setTab(t); setMsg(''); };

  // Compact Map View is the one setting that is really saved. It is staged first: Save Changes asks for confirmation, Cancel discards.
  const [draft, setDraft] = useState(null); // null = untouched
  const compactValue = draft ?? compactMap;
  const dirty = draft !== null && draft !== compactMap;
  const [confirmSave, setConfirmSave] = useState(false);
  const [saved, setSaved] = useState('');

  // Worker registration: saved to the prototype registry in this browser. No login account exists; the password is checked but never stored.
  const [worker, setWorker] = useState({ name: '', email: '', password: '', role: 'TECHNICIAN' });
  const [tried, setTried] = useState(false);
  const [registered, setRegistered] = useState(() => loadUsers());
  const workerErrors = validateRegistration(worker, registered);
  const setW = (k) => (e) => setWorker({ ...worker, [k]: e.target.value });
  const [msgOk, setMsgOk] = useState(false);

  // Low-voltage threshold: checked as you type, but it is a preview and is not used anywhere yet.
  const [volts, setVolts] = useState('');
  const voltsNum = Number(volts);
  const voltsError = volts.trim() !== '' && (!Number.isFinite(voltsNum) || voltsNum < 150 || voltsNum > 230) ? 'Enter a number between 150 and 230 volts.' : '';

  const tabs = (
    <div className="inline-flex bg-white border border-[#e1e7ee] rounded-lg p-1" role="tablist">
      {TABS.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          onClick={() => switchTab(id)}
          className={`px-3 sm:px-4 h-9 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
            tab === id ? 'bg-[#27a85a] text-white' : 'text-[#6b7a90] hover:text-[#14233c]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Page>
      <Header
        title={tab === 'profile' ? 'Settings' : 'System & Notifications'}
        subtitle={tab === 'profile' ? 'Profile & Account Management' : 'Configure alerts, data handling, and hardware thresholds'}
        actions={tabs}
      />
      <Notice>
        Only items tagged <b>WORKING</b> change anything today. Items tagged <b>UI ONLY</b> are layout previews: nothing is saved, created or sent.
      </Notice>

      {tab === 'profile' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start">
          <div className="space-y-5 lg:space-y-6">
            <Card big className="p-5 sm:p-7">
              <CardTitle right={<StatusTag kind="sample" />}>Admin Information</CardTitle>
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-full bg-[#27a85a] text-white grid place-items-center text-2xl font-bold shrink-0">A</div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-[#14233c]">Admin User</div>
                  <div className="text-sm text-[#6b7a90] break-all">admin@lumen.local</div>
                  <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-[#e8f6ee] text-[#1b7a42] text-[11px] font-bold">System Administrator</span>
                </div>
              </div>
            </Card>

            <Card big className="p-5 sm:p-7">
              <CardTitle>Appearance Preferences</CardTitle>
              <div className="divide-y divide-[#eef1f5]">
                <ToggleRow title="Dark Theme Mode" desc="Switch interface to low-light view (saved in this browser)" tag={<StatusTag kind="working" />} checked={theme === 'dark'} onChange={(v) => setTheme(v ? 'dark' : 'light')} />
                <ToggleRow
                  title="Compact Map View"
                  desc="Hide sample markers on the Streetlight Map (same setting as “Show sample locations” on the map)"
                  tag={<StatusTag kind="working" />}
                  checked={compactValue}
                  onChange={(v) => {
                    setDraft(v);
                    setSaved('');
                  }}
                />
              </div>
              {dirty && (
                <div className="mt-4 pt-4 border-t border-[#eef1f5] flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-bold text-[#b9770e]">Unsaved change. The map has not been changed yet.</span>
                  <div className="flex gap-2">
                    <button onClick={() => setDraft(null)} className="h-[42px] px-5 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">Cancel</button>
                    <button onClick={() => setConfirmSave(true)} className="h-[42px] px-5 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52]">Save Changes</button>
                  </div>
                </div>
              )}
              {saved && !dirty && (
                <p role="status" className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#1f9a52] bg-[#e8f6ee] rounded-lg px-3 py-2">
                  <CircleCheck size={15} aria-hidden="true" /> {saved}
                </p>
              )}
            </Card>
          </div>

          <Card big className="p-5 sm:p-7">
            <CardTitle right={<StatusTag kind="prototype" />}>Create Worker Account</CardTitle>
            <p className="text-xs text-[#6b7a90] mb-5">Register field technicians and maintenance workers. Technicians appear in the Maintenance technician list. Saved in this browser only: there is no server user database or login yet.</p>
            <Field label="Full Name" error={tried && workerErrors.name}><input className={inputCls} placeholder="e.g. Juan Dela Cruz" value={worker.name} onChange={setW('name')} aria-invalid={tried && !!workerErrors.name} /></Field>
            <Field label="Email Address" error={tried && workerErrors.email}><input type="email" className={inputCls} placeholder="worker@lumen.local" value={worker.email} onChange={setW('email')} aria-invalid={tried && !!workerErrors.email} /></Field>
            <Field label="Temporary Password" hint="Checked but not stored: there is no login system yet." error={tried && workerErrors.password}><input type="password" className={inputCls} placeholder="Temporary password" autoComplete="new-password" value={worker.password} onChange={setW('password')} aria-invalid={tried && !!workerErrors.password} /></Field>
            <Field label="Access Role">
              <select className={inputCls} value={worker.role} onChange={setW('role')}>
                {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <button
              onClick={() => {
                setTried(true);
                const fresh = loadUsers(); // another tab may have registered someone since this page opened
                setRegistered(fresh);
                if (Object.keys(validateRegistration(worker, fresh)).length > 0) { setMsg(''); return; }
                const user = registerUser(fresh, worker);
                const next = [...fresh, user];
                if (saveUsers(next)) {
                  setRegistered(next);
                  setMsgOk(true);
                  setMsg(`${user.name} registered as ${ROLES[user.role]} (${user.id}) in this browser. ${user.role === 'TECHNICIAN' ? 'They now appear in the Maintenance technician list, marked absent until you switch them on duty.' : 'No login account was created.'}`);
                  setWorker({ name: '', email: '', password: '', role: worker.role });
                  setTried(false);
                } else {
                  setMsgOk(false);
                  setMsg('Could not save: the browser blocked storage, so nobody was registered.');
                }
              }}
              className="w-full h-11 rounded-lg bg-[#27a85a] hover:bg-[#1f8f4b] text-white text-sm font-bold transition-colors"
            >
              Create Account
            </button>
            {msg && <p role="status" className={`mt-3 text-xs rounded-lg px-3 py-2 ${msgOk ? 'text-[#1f9a52] bg-[#e8f6ee]' : 'text-[#8a6410] bg-[#fffaf0] border border-[#f6d587]'}`}>{msg}</p>}
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start">
          <Card big className="p-5 sm:p-7">
            <CardTitle right={<StatusTag kind="ui" />}>Alert Preferences</CardTitle>
            <div className="divide-y divide-[#eef1f5]">
              <ToggleRow title="Email Fault Alerts" desc="Notify admin@lumen.local on lamp failure" checked={alerts.email} onChange={(v) => setAlerts({ ...alerts, email: v })} />
              <ToggleRow title="SMS Technician Dispatch" desc="Auto-SMS workers for HIGH priority tickets" checked={alerts.sms} onChange={(v) => setAlerts({ ...alerts, sms: v })} />
              <ToggleRow title="Daily Summary Report" desc="Receive network status daily at 8:00 AM" checked={alerts.daily} onChange={(v) => setAlerts({ ...alerts, daily: v })} />
            </div>
            <p className="text-[11px] text-[#6b7a90] mt-3">These switches are not saved and no email or SMS service is connected.</p>
          </Card>

          <Card big className="p-5 sm:p-7">
            <CardTitle right={<StatusTag kind="ui" />}>System Configuration</CardTitle>
            <Field label="System Timezone">
              <select className={inputCls} defaultValue="manila">
                <option value="manila">(GMT+8) Asia/Manila</option>
                <option value="utc">(GMT+0) UTC</option>
              </select>
            </Field>
            <Field label="Low Voltage Warning Threshold" error={voltsError} hint="Not connected: the PZEM voltage on the Dashboard is not compared with this value, so it has no effect yet. The Dashboard uses fixed guide ranges (207–253 V).">
              <div className="relative">
                <input className={`${inputCls} pr-16`} placeholder="Below 200V" inputMode="decimal" value={volts} onChange={(e) => setVolts(e.target.value)} aria-invalid={!!voltsError} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#6b7a90]">Volts</span>
              </div>
            </Field>
            <div className="flex items-center justify-between gap-3 flex-wrap bg-[#f3f6f9] rounded-lg px-4 py-3 mb-2">
              <span className="text-xs text-[#5b6b82]">Changes here are previews and cannot be saved: the receiver has no setting to store them.</span>
              <button disabled className="h-9 px-4 rounded-lg bg-[#cfd6df] text-white text-xs font-bold">Save Changes (not available)</button>
            </div>
            <div className="border-t border-[#e6ebf1] pt-5 mt-6">
              <div className="text-sm font-bold text-[#14233c] mb-1">Database & Logs</div>
              <p className="text-[11px] text-[#6b7a90] mb-3">Export telemetry data and maintenance logs for external auditing.</p>
              <button
                onClick={() => { setMsgOk(false); setMsg('Preview only: the server keeps no history to export yet. The Streetlight Map’s Export CSV works today.'); }}
                className="w-full h-11 rounded-lg bg-[#f3f6f9] hover:bg-[#e9eef3] border border-[#e1e7ee] text-[#14233c] text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
              >
                <Download size={15} /> Export System Logs (CSV)
              </button>
              {msg && <p className="mt-3 text-xs text-[#8a6410] bg-[#fffaf0] border border-[#f6d587] rounded-lg px-3 py-2">{msg}</p>}
            </div>
          </Card>
        </div>
      )}
      {confirmSave && (
        <ConfirmDialog
          title="Save this change?"
          confirmLabel="Save Changes"
          onCancel={() => setConfirmSave(false)}
          onConfirm={() => {
            onCompactMapChange(draft);
            setSaved(draft ? 'Saved. Sample markers are now hidden on the Streetlight Map.' : 'Saved. Sample markers are shown again on the Streetlight Map.');
            setDraft(null);
            setConfirmSave(false);
          }}
        >
          Compact Map View will be turned <b>{draft ? 'ON' : 'OFF'}</b>. This changes which markers the Streetlight Map shows, and the same setting on the map.
        </ConfirmDialog>
      )}
    </Page>
  );
};

export default Settings;
