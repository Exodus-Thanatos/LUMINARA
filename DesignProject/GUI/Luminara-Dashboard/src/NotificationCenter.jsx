// Bell button + notification panel for the header. Same round button as before; adds an unread count and a panel.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Bell } from 'lucide-react';
import { clearNotifications, getNotifications, markAllRead, markRead, subscribeNotifications, unreadCount } from './notifications.js';
import { SEVERITY } from './faultInfo.js';

const KINDS = [['all', 'All'], ['fault', 'Faults'], ['offline', 'Offline'], ['connection', 'System']];
const when = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const NotificationCenter = ({ live, onOpenFault, compact = false }) => {
  const list = useSyncExternalStore(subscribeNotifications, getNotifications);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const wrap = useRef(null);
  const unread = unreadCount(list);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const shown = list.filter((n) => kind === 'all' || n.kind === kind || (kind === 'fault' && n.kind === 'warning'));

  return (
    <div className="relative" ref={wrap}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`relative flex items-center justify-center ${compact ? 'w-10 h-10 rounded-lg text-white hover:bg-[#1b2e4b]' : 'w-12 h-12 bg-white border border-[#e1e7ee] rounded-full hover:bg-gray-50'}`}
      >
        <Bell className={`w-5 h-5 ${compact ? 'text-[#cdd7e5]' : 'text-[#5b6b82]'}`} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#e04848] text-white text-[11px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notification Center" className={`z-50 bg-white border border-[#e6ebf1] rounded-2xl shadow-xl ${compact ? 'fixed left-3 right-3 top-16 sm:left-auto sm:w-[380px]' : 'absolute right-0 top-14 w-[380px] max-w-[calc(100vw-2rem)]'}`}>
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-[#e6ebf1]">
            <h2 className="font-bold text-[#14233c]">Notifications</h2>
            <button onClick={markAllRead} disabled={unread === 0} className="text-xs font-bold text-[#27a85a] hover:underline disabled:text-[#9aa7b8] disabled:no-underline">Mark all as read</button>
          </div>
          <div className="flex gap-1 px-4 pt-3" role="group" aria-label="Filter notifications">
            {KINDS.map(([id, label]) => (
              <button key={id} aria-pressed={kind === id} onClick={() => setKind(id)} className={`px-3 h-8 rounded-md text-xs font-semibold ${kind === id ? 'bg-[#27a85a] text-white' : 'text-[#6b7a90] hover:text-[#14233c]'}`}>{label}</button>
            ))}
          </div>
          <ul className="max-h-[360px] overflow-y-auto px-2 py-2">
            {shown.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-[#6b7a90]">
                {list.length === 0
                  ? live ? 'No notifications yet. Faults, offline lamps and connection changes will appear here.' : 'Notifications start when the receiver is connected. Demo data does not create them.'
                  : 'No notifications in this category.'}
              </li>
            )}
            {shown.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    markRead(n.id);
                    if (n.lampId && onOpenFault) {
                      setOpen(false);
                      onOpenFault(n.lampId);
                    }
                  }}
                  className="w-full text-left px-3 py-3 rounded-lg hover:bg-[#f8fafc] flex gap-3 items-start"
                >
                  <span className={`mt-1.5 w-2.5 h-2.5 shrink-0 rounded-full ${n.read ? 'bg-transparent border border-[#cfd6df]' : SEVERITY[n.severity].dot}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm text-[#14233c] ${n.read ? 'font-semibold' : 'font-bold'}`}>{n.title}</span>
                      <span className="shrink-0 text-[10px] font-bold uppercase text-[#6b7a90]">{n.read ? 'Read' : 'Unread'}</span>
                    </span>
                    <span className="block text-xs text-[#6b7a90] mt-0.5">{n.text}</span>
                    <span className="block text-[11px] text-[#8895a7] mt-1">
                      {when(n.at)}
                      {n.state === 'active' && ' · Still active'}
                      {n.state === 'cleared' && ` · Cleared ${when(n.clearedAt)}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-5 py-3 border-t border-[#e6ebf1] text-[11px] text-[#6b7a90] flex items-center justify-between gap-3">
            <span>Saved in this browser only. Maintenance notifications need a maintenance backend and are not available yet.</span>
            {list.length > 0 &&
              (confirmClear ? (
                <span className="shrink-0 flex gap-2">
                  <button onClick={() => { clearNotifications(); setConfirmClear(false); }} className="font-bold text-[#e04040] hover:underline">Confirm</button>
                  <button onClick={() => setConfirmClear(false)} className="font-bold text-[#6b7a90] hover:underline">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmClear(true)} className="shrink-0 font-bold text-[#6b7a90] hover:underline">Clear all</button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
