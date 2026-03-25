import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { chartPalette } from '../../theme/tokens';

export default function DespieceMermaChart({ data = [] }) {
  const rows = useMemo(() => [...data].slice(-14), [data]);
  const categories = rows.map((row) => String(row.fecha || '').slice(0, 10));
  const entrada = rows.map((row) => Number(row.entrada_total || 0));
  const salida = rows.map((row) => Number(row.salida_util_total || 0));
  const merma = rows.map((row) => Number(row.merma_total || 0));

  const options = {
    chart: {
      toolbar: { show: false }
    },
    colors: [chartPalette.info, chartPalette.success, chartPalette.warning],
    stroke: {
      width: [2.5, 2.5, 2.5],
      curve: 'smooth'
    },
    xaxis: {
      categories,
      labels: { style: { colors: '#64748b' } }
    },
    yaxis: {
      labels: {
        formatter: (v) => `${Number(v || 0).toFixed(0)} LB`,
        style: { colors: '#64748b' }
      }
    },
    grid: {
      borderColor: '#e2e8f0'
    },
    tooltip: {
      y: {
        formatter: (v) => `${Number(v || 0).toFixed(2)} LB`
      }
    },
    legend: {
      position: 'top'
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Despiece: entrada, salida útil y merma (LB)</p>
      <Chart
        type="line"
        height={280}
        options={options}
        series={[
          { name: 'Entrada', data: entrada },
          { name: 'Salida útil', data: salida },
          { name: 'Merma', data: merma }
        ]}
      />
    </div>
  );
}

