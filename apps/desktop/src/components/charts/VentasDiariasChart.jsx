import Chart from 'react-apexcharts';
import { chartPalette } from '../../theme/tokens';

export default function VentasDiariasChart({ data = [] }) {
  const categories = data.map((item) => String(item.fecha || '').slice(0, 10));
  const seriesData = data.map((item) => Number(item.total || 0));

  const options = {
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false }
    },
    colors: [chartPalette.success],
    stroke: {
      curve: 'smooth',
      width: 3
    },
    grid: {
      borderColor: chartPalette.grid
    },
    xaxis: {
      categories,
      labels: { style: { colors: chartPalette.axis } }
    },
    yaxis: {
      labels: {
        formatter: (v) => `$${Number(v).toFixed(0)}`,
        style: { colors: chartPalette.axis }
      }
    },
    tooltip: {
      theme: 'light',
      y: {
        formatter: (v) => `$${Number(v).toFixed(2)}`
      }
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Ventas por dia</p>
      <Chart type="line" height={280} options={options} series={[{ name: 'Ventas', data: seriesData }]} />
    </div>
  );
}
