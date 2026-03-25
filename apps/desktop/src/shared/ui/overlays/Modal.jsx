import { useEffect } from 'react';
import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export default function Modal({
  open,
  onClose,
  children,
  maxWidthClass = uiClassTokens.modal.width.default,
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
    <div className={uiClassTokens.modal.overlay} onClick={onClose}>
      <div
        className={clsx(uiClassTokens.modal.panel, maxWidthClass, panelClassName)}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
