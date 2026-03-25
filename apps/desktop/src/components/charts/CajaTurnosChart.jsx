import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { chartPalette } from '../../theme/tokens';

export default function CajaTurnosChart({ data = [] }) {
  const rows = useMemo(() => [...data].slice(0, 10).reverse(), [data]);
  const categories = rows.map((row) => `Turno #${row.id}`);
  const fondo = rows.map((row) => Number(row.fondo_inicial || 0));

  const options = {
    chart: {
      toolbar: { show: false }
    },
    colors: [chartPalette.primary],
    xaxis: {
      categories,
      labels: { style: { colors: '#64748b' } }
    },
    yaxis: {
      labels: {
        formatter: (v) => `$${Number(v || 0).toFixed(0)}`,
        style: { colors: '#64748b' }
      }
    },
    grid: {
      borderColor: '#e2e8f0'
    },
    tooltip: {
      y: {
        formatter: (v) => `$${Number(v || 0).toFixed(2)}`
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: '42%'
      }
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Caja: fondo inicial por turno</p>
      <Chart type="bar" height={260} options={options} series={[{ name: 'Fondo inicial', data: fondo }]} />
    </div>
  );
}

