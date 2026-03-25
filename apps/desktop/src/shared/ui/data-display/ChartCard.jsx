import clsx from 'clsx';
import Panel from '../layout/Panel';

export default function ChartCard({ title, description, actions, className, children }) {
  return (
    <Panel className={clsx('p-4', className)}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h3 className="ui-panel-title">{title}</h3> : null}
            {description ? <p className="ui-panel-description">{description}</p> : null}
          </div>
          {actions ? <div className="ui-panel-actions">{actions}</div> : null}
        </header>
      )}
      {children}
    </Panel>
  );
}
