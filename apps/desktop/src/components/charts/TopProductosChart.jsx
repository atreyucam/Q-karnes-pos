import Chart from 'react-apexcharts';
import { chartPalette } from '../../theme/tokens';

export default function TopProductosChart({ data = [] }) {
  const categories = data.map((item) => item.nombre || item.codigo || '-');
  const seriesData = data.map((item) => Number(item.cantidad_total || 0));

  const options = {
    chart: {
      toolbar: { show: false }
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        horizontal: true
      }
    },
    colors: [chartPalette.warning],
    xaxis: {
      categories,
      labels: { style: { colors: chartPalette.axis } }
    },
    grid: {
      borderColor: chartPalette.grid
    },
    tooltip: {
      theme: 'light'
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Top productos</p>
      <Chart type="bar" height={280} options={options} series={[{ name: 'Unidades', data: seriesData }]} />
    </div>
  );
}
