import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { chartPalette } from '../../theme/tokens';

function aggregateByTipo(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.tipo || 'OTRO').toUpperCase();
    const current = Number(grouped.get(key) || 0);
    grouped.set(key, Number((current + Math.abs(Number(row.cantidad || 0))).toFixed(3)));
  }
  return Array.from(grouped.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

export default function InventarioMovimientosChart({ data = [] }) {
  const aggregated = useMemo(() => aggregateByTipo(data), [data]);
  const categories = aggregated.map(([tipo]) => tipo);
  const values = aggregated.map(([, total]) => total);

  const options = {
    chart: {
      toolbar: { show: false }
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4
      }
    },
    colors: [chartPalette.warning],
    xaxis: {
      categories,
      labels: { style: { colors: '#64748b' } }
    },
    yaxis: {
      labels: { style: { colors: '#64748b' } }
    },
    grid: {
      borderColor: '#e2e8f0'
    },
    tooltip: {
      y: {
        formatter: (v) => Number(v || 0).toFixed(2)
      }
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Inventario: movimientos por tipo</p>
      <Chart type="bar" height={260} options={options} series={[{ name: 'Cantidad', data: values }]} />
    </div>
  );
}

