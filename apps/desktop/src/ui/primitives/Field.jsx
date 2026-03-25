import clsx from 'clsx';
import { FieldHint, FieldLabel, FieldStack } from '../../components/ui/Field';

export default function Field({ className, children }) {
  return <FieldStack className={clsx(className)}>{children}</FieldStack>;
}

export { FieldHint, FieldLabel, FieldStack };
