import clsx from 'clsx';

export default function Checkbox({ label, className, inputClassName, ...props }) {
  return (
    <label className={clsx('ui-checkbox', className)}>
      <input type="checkbox" className={clsx('ui-checkbox-input', inputClassName)} {...props} />
      {label ? <span className="ui-checkbox-label">{label}</span> : null}
    </label>
  );
}
