// Shared modal + confirm dialog. Keyboard: Esc closes, Tab stays inside, focus returns to what opened it.
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Modal = ({ labelledBy, onClose, children, wide = false }) => {
  const box = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    box.current?.querySelector(FOCUSABLE)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && box.current) {
        const items = [...box.current.querySelectorAll(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && opener.focus) opener.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-[#13223b]/55" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={`bg-white rounded-2xl border border-[#e6ebf1] shadow-xl w-full ${wide ? 'sm:max-w-xl' : 'sm:max-w-md'} max-h-[90vh] overflow-y-auto`}>
        {children}
      </div>
    </div>
  );
};

export const ConfirmDialog = ({ title, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }) => (
  <Modal labelledBy="confirm-title" onClose={onCancel}>
    <div className="p-6">
      <h2 id="confirm-title" className="text-lg font-bold text-[#14233c]">{title}</h2>
      <div className="text-sm text-[#5b6b82] mt-2">{children}</div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onCancel} className="h-[42px] px-6 bg-white border border-[#e1e7ee] rounded-lg text-sm font-semibold text-[#14233c] hover:bg-gray-50">{cancelLabel}</button>
        <button onClick={onConfirm} className="h-[42px] px-6 bg-[#27a85a] text-white rounded-lg text-sm font-semibold hover:bg-[#1f9a52]">{confirmLabel}</button>
      </div>
    </div>
  </Modal>
);
