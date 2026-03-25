import clsx from 'clsx';

export default function LoadingState({ label = 'Cargando...', className }) {
  return (
    <div className={clsx('ui-loading', className)} role="status" aria-live="polite">
      <span className="ui-loading-spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
