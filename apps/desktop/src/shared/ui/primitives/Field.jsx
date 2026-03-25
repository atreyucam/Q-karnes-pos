import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export function FieldStack({ className, children }) {
  return <div className={clsx('ui-field-stack', className)}>{children}</div>;
}

export function FieldLabel({ className, children }) {
  return <label className={clsx(uiClassTokens.input.label, className)}>{children}</label>;
}

export function FieldHint({ className, children }) {
  return <p className={clsx('ui-hint', className)}>{children}</p>;
}

export default function Field({ label, hint, className, children }) {
  return (
    <FieldStack className={className}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {children}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </FieldStack>
  );
}
