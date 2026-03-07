import Chart from 'react-apexcharts';

export default function VentasDiariasChart({ data = [] }) {
  const categories = data.map((item) => String(item.fecha || '').slice(0, 10));
  const seriesData = data.map((item) => Number(item.total || 0));

  const options = {
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false }
    },
    colors: ['#16a34a'],
    stroke: {
      curve: 'smooth',
      width: 3
    },
    grid: {
      borderColor: '#e2e8f0'
    },
    xaxis: {
      categories,
      labels: { style: { colors: '#64748b' } }
    },
    yaxis: {
      labels: {
        formatter: (v) => `$${Number(v).toFixed(0)}`,
        style: { colors: '#64748b' }
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-sm font-semibold text-slate-700">Ventas por dia</p>
      <Chart type="line" height={280} options={options} series={[{ name: 'Ventas', data: seriesData }]} />
    </div>
  );
}
