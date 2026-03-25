import clsx from 'clsx';

export default function PageSection({ title, description, actions, className, children }) {
  return (
    <section className={clsx('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h2 className="ui-section-title">{title}</h2> : null}
            {description ? <p className="ui-section-description">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
