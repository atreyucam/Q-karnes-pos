import clsx from 'clsx';
import { FieldError, FieldHint, FieldLabel, FieldStack } from '../../shared/ui/primitives/Field';

export default function Field({ className, children }) {
  return <FieldStack className={clsx(className)}>{children}</FieldStack>;
}

export { FieldError, FieldHint, FieldLabel, FieldStack };
