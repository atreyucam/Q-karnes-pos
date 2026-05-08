import { Children, cloneElement, isValidElement, useId } from 'react';
import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

function mergeIds(...values) {
  return values.filter(Boolean).join(' ') || undefined;
}

function enhanceControl(child, { controlId, describedBy, hasError }) {
  if (!isValidElement(child)) return child;

  const nextProps = {
    id: child.props.id || controlId,
    'aria-describedby': mergeIds(child.props['aria-describedby'], describedBy),
    'aria-invalid': hasError || child.props['aria-invalid'] || undefined
  };

  const resolvedError = child.props.error ?? (hasError ? true : undefined);
  if (typeof child.type !== 'string' && resolvedError !== undefined) {
    nextProps.error = resolvedError;
  }

  return cloneElement(child, nextProps);
}

export function FieldStack({ className, children }) {
  return <div className={clsx('ui-field-stack', className)}>{children}</div>;
}

export function FieldLabel({ className, children, htmlFor, required = false }) {
  return (
    <label htmlFor={htmlFor} className={clsx(uiClassTokens.input.label, className)}>
      {children}
      {required ? <span className="ui-field-required">*</span> : null}
    </label>
  );
}

export function FieldHint({ id, className, children }) {
  if (!children) return null;
  return (
    <p id={id} className={clsx('ui-hint', className)}>
      {children}
    </p>
  );
}

export function FieldError({ id, className, children }) {
  if (!children) return null;
  return (
    <p id={id} className={clsx('ui-field-error-text', className)} role="alert">
      {children}
    </p>
  );
}

export default function Field({
  label,
  hint,
  error,
  className,
  children,
  htmlFor,
  required = false
}) {
  const fieldId = useId();
  const controlId = htmlFor || `${fieldId}-control`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = mergeIds(hintId, errorId);

  return (
    <FieldStack className={className}>
      {label ? (
        <FieldLabel htmlFor={controlId} required={required}>
          {label}
        </FieldLabel>
      ) : null}
      {Children.map(children, (child) => enhanceControl(child, { controlId, describedBy, hasError: Boolean(error) }))}
      <FieldHint id={hintId}>{hint}</FieldHint>
      <FieldError id={errorId}>{error}</FieldError>
    </FieldStack>
  );
}
