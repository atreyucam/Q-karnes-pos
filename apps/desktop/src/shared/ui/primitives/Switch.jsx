import clsx from 'clsx';

export default function Switch({ checked = false, onChange, label, className, disabled = false, ...props }) {
  return (
    <label className={clsx('ui-switch', disabled && 'opacity-60', className)}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked, event)}
        {...props}
      />
      <span className={clsx('ui-switch-track', checked && 'ui-switch-track-on')}>
        <span className={clsx('ui-switch-thumb', checked && 'ui-switch-thumb-on')} />
      </span>
      {label ? <span className="ui-switch-label">{label}</span> : null}
    </label>
  );
}
