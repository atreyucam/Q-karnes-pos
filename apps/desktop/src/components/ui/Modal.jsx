import { useEffect } from 'react';

export default function Modal({
  open,
  onClose,
  children,
  maxWidthClass = 'max-w-3xl',
  panelClassName = ''
}) {
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`w-full ${maxWidthClass} max-h-[85vh] overflow-auto rounded-2xl bg-white shadow-xl ${panelClassName}`.trim()}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
