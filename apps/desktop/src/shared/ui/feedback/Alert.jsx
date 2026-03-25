import clsx from 'clsx';

const toneMap = {
  error: 'ui-alert-error',
  success: 'ui-alert-success',
  warning: 'ui-alert-warning',
  info: 'ui-alert-info'
};

export default function Alert({ tone = 'error', className, children }) {
  return <div className={clsx('ui-alert', toneMap[tone] || toneMap.error, className)}>{children}</div>;
}
