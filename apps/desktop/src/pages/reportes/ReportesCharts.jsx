import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { EmptyState, Panel } from '../../shared/ui';
import { formatCentavos, formatNumber } from './reportesUtils';

const CHART_COLORS = ['#0f766e', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

function valueFormatterByType(value, type = 'money') {
  if (type === 'count') return formatNumber(value);
  if (type === 'percent') return `${Number(value || 0).toFixed(2)}%`;
  return formatCentavos(value);
}

export function ChartPanel({ title, subtitle, children, emptyTitle = 'Sin datos', emptyDescription = 'No hay información para graficar.' }) {
  return (
    <Panel className="p-0">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <h3 className="text-base font-semibold text-[var(--color-text)]">{title}</h3>
        {subtitle ? <p className="text-sm text-[var(--color-text-muted)]">{subtitle}</p> : null}
      </div>
      <div className="h-[320px] p-3">
        {children || <EmptyState title={emptyTitle} description={emptyDescription} />}
      </div>
    </Panel>
  );
}

export function SalesLineChart({
  data = [],
  xKey = 'label',
  yKey = 'value',
  label = 'Total',
  yType = 'money',
  emptyTitle = 'Sin serie de ventas'
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState title={emptyTitle} description="Ajusta filtros para visualizar la tendencia." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
          tickFormatter={(value) => valueFormatterByType(value, yType)}
        />
        <Tooltip formatter={(value) => valueFormatterByType(value, yType)} />
        <Line type="monotone" dataKey={yKey} stroke="#0f766e" strokeWidth={3} dot={false} name={label} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function VerticalBarChart({
  data = [],
  xKey = 'label',
  yKey = 'value',
  label = 'Total',
  yType = 'money',
  emptyTitle = 'Sin serie'
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState title={emptyTitle} description="Ajusta filtros para visualizar este bloque." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
          tickFormatter={(value) => valueFormatterByType(value, yType)}
        />
        <Tooltip formatter={(value) => valueFormatterByType(value, yType)} />
        <Bar dataKey={yKey} name={label} radius={[10, 10, 0, 0]} fill="#0f766e" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({
  data = [],
  xKey = 'value',
  yKey = 'label',
  label = 'Total',
  xType = 'money',
  emptyTitle = 'Sin distribución'
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState title={emptyTitle} description="No hay datos para mostrar en este rango." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 32, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          type="number"
          tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
          tickFormatter={(value) => valueFormatterByType(value, xType)}
        />
        <YAxis type="category" dataKey={yKey} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} width={140} />
        <Tooltip formatter={(value) => valueFormatterByType(value, xType)} />
        <Bar dataKey={xKey} name={label} radius={[0, 6, 6, 0]}>
          {data.map((row, index) => (
            <Cell key={`${row[yKey]}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaymentDonutChart({
  data = [],
  nameKey = 'label',
  valueKey = 'value',
  valueType = 'money',
  emptyTitle = 'Sin métodos de pago'
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return <EmptyState title={emptyTitle} description="No hubo pagos registrados para este periodo." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={58} outerRadius={95} paddingAngle={2}>
          {data.map((row, index) => (
            <Cell key={`${row[nameKey]}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => valueFormatterByType(value, valueType)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ComparisonBarChart({
  data = [],
  xKey = 'label',
  bars = [],
  yType = 'money',
  emptyTitle = 'Sin comparativa'
}) {
  if (!Array.isArray(data) || data.length === 0 || !Array.isArray(bars) || bars.length === 0) {
    return <EmptyState title={emptyTitle} description="No hay datos suficientes para comparar." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
          tickFormatter={(value) => valueFormatterByType(value, yType)}
        />
        <Tooltip formatter={(value) => valueFormatterByType(value, yType)} />
        <Legend />
        {bars.map((bar, index) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.label || bar.key}
            fill={bar.color || CHART_COLORS[index % CHART_COLORS.length]}
            radius={[8, 8, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MultiLineChart({
  data = [],
  xKey = 'label',
  lines = [],
  yType = 'count',
  emptyTitle = 'Sin datos comparativos'
}) {
  if (!Array.isArray(data) || data.length === 0 || !Array.isArray(lines) || lines.length === 0) {
    return <EmptyState title={emptyTitle} description="No hay serie suficiente para comparar." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }} />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
          tickFormatter={(value) => valueFormatterByType(value, yType)}
        />
        <Tooltip formatter={(value) => valueFormatterByType(value, yType)} />
        <Legend />
        {lines.map((line, index) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            stroke={line.color || CHART_COLORS[index % CHART_COLORS.length]}
            strokeWidth={2.5}
            dot={false}
            name={line.label || line.key}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
