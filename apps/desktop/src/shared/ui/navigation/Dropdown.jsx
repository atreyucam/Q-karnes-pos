import clsx from 'clsx';

export default function Dropdown({ open, className, children }) {
  if (!open) return null;

  return (
    <div className={clsx('ui-dropdown', className)}>
      {children}
    </div>
  );
}
