import clsx from 'clsx';

export default function LoadingState({
  label,
  title,
  description,
  className
}) {
  const resolvedTitle = label || title || 'Cargando...';

  return (
    <div className={clsx('ui-loading', description && 'ui-loading-block', className)} role="status" aria-live="polite">
      <span className="ui-loading-spinner" aria-hidden />
      <span className="ui-loading-copy">
        <span className="ui-loading-title">{resolvedTitle}</span>
        {description ? <span className="ui-loading-description">{description}</span> : null}
      </span>
    </div>
  );
}
