import Chart from 'react-apexcharts';
import { chartPalette } from '../../theme/tokens';

export default function VentasMetodoChart({ ventas = [] }) {
  const contado = ventas
    .filter((v) => !v.cliente_id)
    .reduce((acc, item) => acc + Number(item.total || 0), 0);

  const credito = ventas
    .filter((v) => Boolean(v.cliente_id))
    .reduce((acc, item) => acc + Number(item.total || 0), 0);

  const options = {
    chart: {
      toolbar: { show: false }
    },
    labels: ['Contado', 'Credito'],
    colors: [chartPalette.success, chartPalette.primary],
    legend: {
      position: 'bottom'
    },
    tooltip: {
      y: {
        formatter: (v) => `$${Number(v).toFixed(2)}`
      }
    },
    dataLabels: {
      formatter: (v) => `${v.toFixed(0)}%`
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Ventas contado vs credito</p>
      <Chart type="donut" height={280} options={options} series={[contado, credito]} />
    </div>
  );
}
