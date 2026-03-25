import clsx from 'clsx';

export default function TopbarAction({ className, children, ...props }) {
  return (
    <button type="button" className={clsx('ui-topbar-action', className)} {...props}>
      {children}
    </button>
  );
}
