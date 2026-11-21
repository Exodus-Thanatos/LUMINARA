// Shared presentation primitives for the Phase 1 UI refresh (card titles, form fields, toggles, status tags).
// Presentation only: nothing in here talks to the backend.

export const inputCls =
  'w-full h-11 px-4 bg-[#f8fafc] border border-[#e1e7ee] rounded-lg text-sm text-[#14233c] placeholder:text-[#9aa7b8] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#27a85a]/30 focus:border-[#27a85a] disabled:opacity-60 disabled:cursor-not-allowed';

// Card heading with the thin divider used in the reference design.
export const CardTitle = ({ children, right, className = '', small = false }) => (
  <div className={`flex items-center justify-between gap-3 flex-wrap pb-3 mb-5 border-b border-[#e6ebf1] ${className}`}>
    <h3 className={`font-bold text-[#14233c] ${small ? 'text-base' : 'text-lg'}`}>{children}</h3>
    {right}
  </div>
);

// WORKING = wired to something that exists today. UI ONLY = layout preview, nothing behind it.
export const StatusTag = ({ kind = 'ui' }) => {
  const map = {
    working: ['WORKING', 'bg-[#e8f6ee] text-[#27a85a]'],
    ui: ['UI ONLY · NOT CONNECTED', 'bg-[#eef1f5] text-[#6b7a90]'],
    sample: ['SAMPLE PROFILE', 'bg-[#fdf2d9] text-[#8a6410]'],
    later: ['NOT AVAILABLE YET', 'bg-[#eef1f5] text-[#6b7a90]'],
    prototype: ['PROTOTYPE · THIS BROWSER', 'bg-[#fdf2d9] text-[#8a6410]'],
  };
  const [label, cls] = map[kind];
  return <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider ${cls}`}>{label}</span>;
};

export const Field = ({ label, hint, error, children }) => (
  <label className="block mb-4">
    <span className="block text-xs font-semibold text-[#14233c] mb-1.5">{label}</span>
    {children}
    {error ? (
      <span role="alert" className="block text-[11px] font-semibold text-[#e04040] mt-1.5">{error}</span>
    ) : (
      hint && <span className="block text-[11px] text-[#6b7a90] mt-1.5">{hint}</span>
    )}
  </label>
);

export const Toggle = ({ checked, onChange, disabled = false, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange && onChange(!checked)}
    className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-150 ${
      checked ? 'bg-[#27a85a]' : 'bg-[#cfd6df]'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-150 ${
        checked ? 'translate-x-5' : ''
      }`}
    />
  </button>
);

export const ToggleRow = ({ title, desc, tag, ...toggle }) => (
  <div className="flex items-center justify-between gap-4 py-3.5">
    <div className="min-w-0">
      <div className="text-sm font-bold text-[#14233c] flex items-center gap-2 flex-wrap">
        {title}
        {tag}
      </div>
      <div className="text-[11px] text-[#6b7a90] mt-0.5">{desc}</div>
    </div>
    <Toggle label={title} {...toggle} />
  </div>
);
