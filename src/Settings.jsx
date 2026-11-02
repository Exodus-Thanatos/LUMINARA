// Settings (Phase 1, UI only). Layout follows the reference images.
// Only "Compact Map View" is connected to anything that exists today (the Map's "show sample locations" setting).
// Everything tagged UI ONLY is a preview: no account, alert, threshold or export is created or sent.
import { useState } from 'react';
import { Download, Info } from 'lucide-react';
import { CardTitle, Field, StatusTag, ToggleRow, inputCls } from './uiKit.jsx';

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
  const [tab, setTab] = useState('profile');
  const [alerts, setAlerts] = useState({ email: true, sms: true, daily: false });
  const [msg, setMsg] = useState('');
  const switchTab = (t) => { setTab(t); setMsg(''); };

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
                <ToggleRow title="Dark Theme Mode" desc="Switch interface to low-light view" tag={<StatusTag kind="later" />} checked={false} disabled />
                <ToggleRow
                  title="Compact Map View"
                  desc="Hide sample markers on the Streetlight Map (same setting as “Show sample locations” on the map)"
                  tag={<StatusTag kind="working" />}
                  checked={compactMap}
                  onChange={onCompactMapChange}
                />
              </div>
            </Card>
          </div>

          <Card big className="p-5 sm:p-7">
            <CardTitle right={<StatusTag kind="ui" />}>Create Worker Account</CardTitle>
            <p className="text-xs text-[#6b7a90] mb-5">Provision a basic access account for field technicians and maintenance workers.</p>
            <Field label="Full Name"><input className={inputCls} placeholder="e.g. Juan Dela Cruz" /></Field>
            <Field label="Email Address"><input type="email" className={inputCls} placeholder="worker@lumen.local" /></Field>
            <Field label="Temporary Password"><input type="password" className={inputCls} placeholder="Temporary password" autoComplete="new-password" /></Field>
            <Field label="Access Role">
              <select className={inputCls}>
                <option>Basic Worker / Technician</option>
                <option>Read-only Viewer</option>
              </select>
            </Field>
            <button
              onClick={() => setMsg('Preview only: no account was created. Worker accounts need a login system on the server, which this release does not include.')}
              className="w-full h-11 rounded-lg bg-[#27a85a] hover:bg-[#1f8f4b] text-white text-sm font-bold transition-colors"
            >
              Create Account
            </button>
            {msg && <p className="mt-3 text-xs text-[#8a6410] bg-[#fffaf0] border border-[#f6d587] rounded-lg px-3 py-2">{msg}</p>}
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
            <Field label="Low Voltage Warning Threshold" hint="Lamp nodes do not measure voltage yet, so this value has no effect.">
              <div className="relative">
                <input className={`${inputCls} pr-16`} placeholder="Below 200V" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#6b7a90]">Volts</span>
              </div>
            </Field>
            <div className="border-t border-[#e6ebf1] pt-5 mt-6">
              <div className="text-sm font-bold text-[#14233c] mb-1">Database & Logs</div>
              <p className="text-[11px] text-[#6b7a90] mb-3">Export telemetry data and maintenance logs for external auditing.</p>
              <button
                onClick={() => setMsg('Preview only: the server keeps no history to export yet. The Streetlight Map’s Export CSV works today.')}
                className="w-full h-11 rounded-lg bg-[#f3f6f9] hover:bg-[#e9eef3] border border-[#e1e7ee] text-[#14233c] text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
              >
                <Download size={15} /> Export System Logs (CSV)
              </button>
              {msg && <p className="mt-3 text-xs text-[#8a6410] bg-[#fffaf0] border border-[#f6d587] rounded-lg px-3 py-2">{msg}</p>}
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
};

export default Settings;
