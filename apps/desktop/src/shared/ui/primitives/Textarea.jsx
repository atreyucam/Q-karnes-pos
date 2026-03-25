import clsx from 'clsx';

export default function Textarea({ className, ...props }) {
  return <textarea className={clsx('ui-field ui-textarea', className)} {...props} />;
}
