import clsx from 'clsx';

export default function ModuleRail({ className, children }) {
  return <div className={clsx('ui-module-rail', className)}>{children}</div>;
}
