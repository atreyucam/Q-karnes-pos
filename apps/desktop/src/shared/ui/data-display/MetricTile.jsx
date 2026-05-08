import clsx from 'clsx';
import { kpiSoftToneMap } from '../../tokens/colorTokens';

const toneColorMap = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)'
};

export default function MetricTile({
  icon: Icon,
  value,
  label,
  iconBg,
  tone = 'primary',
  className
}) {
  const resolvedIconBg = iconBg || kpiSoftToneMap[tone] || kpiSoftToneMap.primary;
  const resolvedIconColor = toneColorMap[tone] || toneColorMap.primary;

  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4',
        className
      )}
      style={{ '--dashboard-card-icon-bg': resolvedIconBg }}
    >
      <span
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm ring-1"
        style={{
          background: 'var(--dashboard-card-icon-bg)',
          color: resolvedIconColor,
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${resolvedIconColor} 18%, white 82%)`
        }}
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
