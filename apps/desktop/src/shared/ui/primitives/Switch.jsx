import { useId } from 'react';
import clsx from 'clsx';

export default function Switch({
  checked = false,
  onChange,
  label,
  description,
  error,
  className,
  disabled = false,
  busy = false,
  id,
  ...props
}) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const descriptionId = description ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <label className={clsx('ui-switch', (disabled || busy) && 'opacity-60', className)}>
      <input
        id={controlId}
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled || busy}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error) || undefined}
        aria-busy={busy || undefined}
        onChange={(event) => onChange?.(event.target.checked, event)}
        {...props}
      />
      <span
        className={clsx(
          'ui-switch-track',
          checked && 'ui-switch-track-on',
          error && 'ui-switch-track-error',
          busy && 'ui-switch-track-busy'
        )}
        aria-hidden="true"
      >
        <span className={clsx('ui-switch-thumb', checked && 'ui-switch-thumb-on')} />
      </span>
      {(label || description || error) ? (
        <span className="ui-switch-copy">
          {label ? <span className="ui-switch-label">{label}</span> : null}
          {description ? (
            <span id={descriptionId} className="ui-switch-description">
              {description}
            </span>
          ) : null}
          {error ? (
            <span id={errorId} className="ui-field-error-text">
              {error}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}
