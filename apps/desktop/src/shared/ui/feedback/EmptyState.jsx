import clsx from 'clsx';

export default function EmptyState({
  title = 'Sin resultados',
  description = 'No hay datos para mostrar en este momento.',
  className,
  children
}) {
  return (
    <div className={clsx('ui-empty-state', className)} role="status" aria-live="polite">
      <p className="ui-empty-title">{title}</p>
      <p className="ui-empty-description">{description}</p>
      {children ? <div className="ui-empty-actions">{children}</div> : null}
    </div>
  );
}
