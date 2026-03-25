import clsx from 'clsx';

export default function MetricTile({
  icon: Icon,
  value,
  label,
  iconBg,
  className
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4',
        className
      )}
      style={iconBg ? { '--dashboard-card-icon-bg': iconBg } : undefined}
    >
      <span
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--color-text)]"
        style={{ background: 'var(--dashboard-card-icon-bg)' }}
      >
        {Icon ? <Icon className="text-[1.05rem]" /> : null}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-[1.55rem] font-bold leading-none text-[var(--color-text)]">{value}</p>
        <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
      </div>
    </div>
  );
}
