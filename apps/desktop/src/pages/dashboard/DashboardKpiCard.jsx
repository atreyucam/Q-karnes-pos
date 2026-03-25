import clsx from 'clsx';

const toneStyles = {
  brand: {
    accent: 'var(--color-brand)',
    iconBg: 'color-mix(in oklab, #9ed7f7 72%, white 28%)'
  },
  info: {
    accent: 'var(--color-info)',
    iconBg: 'color-mix(in oklab, #a7f3d0 78%, white 22%)'
  },
  warning: {
    accent: 'var(--color-warning)',
    iconBg: 'color-mix(in oklab, #fde68a 72%, white 28%)'
  },
  danger: {
    accent: 'var(--color-danger)',
    iconBg: 'color-mix(in oklab, #e9d5ff 78%, white 22%)'
  }
};

const trendStyles = {
  success: 'dashboard-overview-trend-success',
  danger: 'dashboard-overview-trend-danger',
  warning: 'dashboard-overview-trend-warning',
  info: 'dashboard-overview-trend-info'
};

function splitTrendText(trend) {
  const text = String(trend || '').trim();
  const numericMatch = text.match(/^([+-]?\d[\d.,]*%?)(.*)$/);
  if (!numericMatch) return { emphasis: text, context: '' };
  return {
    emphasis: numericMatch[1],
    context: numericMatch[2].trim()
  };
}

export default function DashboardKpiCard({ title, value, hint, trend, trendTone = 'info', Icon, tone = 'brand', featured = false }) {
  const styles = toneStyles[tone] || toneStyles.brand;
  const trendCopy = splitTrendText(trend);

  return (
    <div
      className={clsx('ui-kpi-summary-item', featured && 'ui-kpi-summary-item-featured')}
      style={{
        '--dashboard-card-accent': styles.accent,
        '--dashboard-card-icon-bg': styles.iconBg
      }}
    >
      <div className="flex h-full flex-col gap-4">
        <span className="ui-kpi-summary-icon">
          <Icon className="text-[1.2rem]" />
        </span>

        <div className="space-y-2">
          <p className="ui-kpi-summary-label">{title}</p>
          <p className="ui-kpi-summary-value">{value}</p>
        </div>

        <div className="space-y-1">
          {trend ? (
            <p className="ui-kpi-summary-meta">
              <span className={clsx('dashboard-overview-trend', trendStyles[trendTone] || trendStyles.info)}>{trendCopy.emphasis}</span>
              {trendCopy.context ? ` ${trendCopy.context}` : ''}
            </p>
          ) : null}
          {hint ? <p className="ui-kpi-summary-hint">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}
