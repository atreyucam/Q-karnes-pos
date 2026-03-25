import clsx from 'clsx';
import Panel from '../layout/Panel';

export default function KpiCard({ label, value, hint, className }) {
  return (
    <Panel className={clsx('ui-kpi-card', className)}>
      <p className="ui-kpi-label">{label}</p>
      <p className="ui-kpi-value">{value}</p>
      {hint ? <p className="ui-kpi-hint">{hint}</p> : null}
    </Panel>
  );
}
