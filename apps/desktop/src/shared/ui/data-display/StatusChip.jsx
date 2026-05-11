import clsx from 'clsx';
import { formatStatusLabel, getStatusClasses, getTipoClasses, resolveStatusTone } from './statusTone';

export default function StatusChip({ status, tone, className, children, ...props }) {
  const resolvedClass = tone ? `ui-chip-${tone}` : getStatusClasses(status);
  const label = children || formatStatusLabel(status);
  return <span className={clsx('ui-chip', resolvedClass, className)} {...props}>{label}</span>;
}

export function StatusBadge(props) {
  return <StatusChip {...props} />;
}

export function TipoBadge({ tipo, className, children, ...props }) {
  const resolvedClass = getTipoClasses(tipo);
  return <span className={clsx('ui-chip', resolvedClass, className)} {...props}>{children || formatStatusLabel(tipo)}</span>;
}

export { formatStatusLabel, getStatusClasses, getTipoClasses, resolveStatusTone };
