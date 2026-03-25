import { useEffect } from 'react';
import clsx from 'clsx';

export default function Drawer({ open, onClose, title, side = 'right', className, children }) {
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
    <div className="ui-drawer-backdrop" onClick={onClose}>
      <aside
        className={clsx(
          'ui-drawer-panel',
          side === 'left' ? 'ml-0 mr-auto' : 'ml-auto mr-0',
          className
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {title ? <div className="ui-drawer-header"><h3 className="ui-panel-title">{title}</h3></div> : null}
        <div className="ui-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
