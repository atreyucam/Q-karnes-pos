import { EmptyState, Panel, PanelHeader, StatusChip } from '../../shared/ui';
import { formatDashboardMoney } from './dashboardFormatters';

const CHART_WIDTH = 860;
const CHART_HEIGHT = 260;
const PADDING_X = 28;
const PADDING_Y = 20;

function getPeakHour(data = []) {
  return data.reduce(
    (best, item) => (Number(item.total || 0) > Number(best.total || 0) ? item : best),
    { hora: '07:00', total: 0, transacciones: 0 }
  );
}

function buildLine(data = []) {
  const maxValue = Math.max(...data.map((item) => Number(item.total || 0)), 0);
  const drawableWidth = CHART_WIDTH - PADDING_X * 2;
  const drawableHeight = CHART_HEIGHT - PADDING_Y * 2;
  const step = data.length > 1 ? drawableWidth / (data.length - 1) : drawableWidth;

  const points = data.map((item, index) => {
    const total = Number(item.total || 0);
    const x = PADDING_X + step * index;
    const y = PADDING_Y + drawableHeight - (maxValue > 0 ? (total / maxValue) * drawableHeight : 0);
    return { ...item, total, x, y };
  });

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const area = `${line} L ${points.at(-1)?.x || PADDING_X} ${CHART_HEIGHT - PADDING_Y} L ${points[0]?.x || PADDING_X} ${CHART_HEIGHT - PADDING_Y} Z`;
  const guides = [0.25, 0.5, 0.75].map((ratio) => PADDING_Y + drawableHeight * ratio);

  return { points, line, area, maxValue, guides };
}

export default function DashboardSalesChart({ data = [] }) {
  const totalVentas = data.reduce((acc, item) => acc + Number(item.total || 0), 0);
  const totalTransacciones = data.reduce((acc, item) => acc + Number(item.transacciones || 0), 0);
  const peakHour = getPeakHour(data);
  const { points, line, area, maxValue, guides } = buildLine(data);

  return (
    <Panel className="overflow-hidden p-5">
      <PanelHeader
        title="Ventas del día"
        description="Curva horaria de ventas entre 07:00 y 22:00."
        actions={<StatusChip tone="info">{totalTransacciones} transacciones</StatusChip>}
      />

      {maxValue <= 0 ? (
        <EmptyState
          className="mt-5"
          title="Sin ventas entre 07:00 y 22:00"
          description="La línea aparecerá en cuanto existan ventas registradas dentro del horario operativo."
        />
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Total del día</p>
              <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-[var(--color-text)]">
                {formatDashboardMoney(totalVentas)}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Hora pico</p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text)]">{peakHour.hora}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{formatDashboardMoney(peakHour.total)}</p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto pb-2">
            <div className="min-w-[860px] rounded-[24px] border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(247,242,234,0.78)_100%)] p-4">
              <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-[280px] w-full">
                <defs>
                  <linearGradient id="dashboard-line-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.88" />
                    <stop offset="100%" stopColor="var(--color-warning)" stopOpacity="0.84" />
                  </linearGradient>
                  <linearGradient id="dashboard-area-gradient" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.03" />
                  </linearGradient>
                </defs>

                {guides.map((guide) => (
                  <line
                    key={guide}
                    x1={PADDING_X}
                    x2={CHART_WIDTH - PADDING_X}
                    y1={guide}
                    y2={guide}
                    stroke="rgba(184, 178, 170, 0.6)"
                    strokeDasharray="5 8"
                  />
                ))}

                <path d={area} fill="url(#dashboard-area-gradient)" />
                <path
                  d={line}
                  fill="none"
                  stroke="url(#dashboard-line-gradient)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {points.map((point, index) => {
                  const showLabel = index % 2 === 0 || index === points.length - 1;
                  return (
                    <g key={point.hora}>
                      <circle cx={point.x} cy={point.y} r="5.5" fill="white" stroke="var(--color-brand)" strokeWidth="3" />
                      <circle cx={point.x} cy={point.y} r="2.2" fill="var(--color-warning)" />
                      {showLabel ? (
                        <text
                          x={point.x}
                          y={CHART_HEIGHT - 4}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="600"
                          fill="var(--color-text-muted)"
                        >
                          {point.hora}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
