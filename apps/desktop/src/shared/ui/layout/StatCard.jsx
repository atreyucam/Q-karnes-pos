import clsx from 'clsx';
import Panel from './Panel';

export default function StatCard({ label, value, hint, className }) {
  return (
    <Panel className={clsx('ui-stat-card', className)}>
      <p className="ui-stat-label">{label}</p>
      <p className="ui-stat-value">{value}</p>
      {hint ? <p className="ui-stat-hint">{hint}</p> : null}
    </Panel>
  );
}
