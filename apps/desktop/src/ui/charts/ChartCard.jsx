import clsx from 'clsx';

export default function ChartCard({ title, description, actions, className, children }) {
  return (
    <section className={clsx('ui-card p-4', className)}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title ? <h3 className="ui-card-title">{title}</h3> : null}
            {description ? <p className="ui-card-description">{description}</p> : null}
          </div>
          {actions ? <div className="ui-card-actions">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}
