import clsx from 'clsx';

export default function KpiCard({ label, value, hint, className }) {
  return (
    <div className={clsx('ui-card ui-stat-card', className)}>
      <p className="ui-stat-label">{label}</p>
      <p className="ui-stat-value">{value}</p>
      {hint ? <p className="ui-stat-hint">{hint}</p> : null}
    </div>
  );
}
