import clsx from 'clsx';

const toneMap = {
  info: 'ui-toast-info',
  success: 'ui-toast-success',
  warning: 'ui-toast-warning',
  danger: 'ui-toast-danger'
};

export default function Toast({ tone = 'info', className, children }) {
  return <div className={clsx('ui-toast', toneMap[tone] || toneMap.info, className)}>{children}</div>;
}
