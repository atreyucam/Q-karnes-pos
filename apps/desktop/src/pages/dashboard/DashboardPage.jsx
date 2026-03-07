import { useEffect } from 'react';
import { MdAttachMoney, MdInventory2, MdPeople, MdShoppingCart } from 'react-icons/md';
import { useReportesStore } from '../../stores/reportesStore';
import VentasDiariasChart from '../../components/charts/VentasDiariasChart';
import VentasMetodoChart from '../../components/charts/VentasMetodoChart';
import TopProductosChart from '../../components/charts/TopProductosChart';

function KpiCard({ title, value, Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <Icon className="text-xl text-[#b41428]" />
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const cargarTodo = useReportesStore((s) => s.cargarTodo);
  const dashboard = useReportesStore((s) => s.dashboard);
  const ventasDiarias = useReportesStore((s) => s.ventasDiarias);
  const ventas = useReportesStore((s) => s.ventas);
  const topProductos = useReportesStore((s) => s.topProductos);
  const loading = useReportesStore((s) => s.loading);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Dashboard</h2>
        <p className="text-sm text-slate-500">Resumen operacional del POS</p>
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando...</p>}

      {!loading && dashboard && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Ventas Total" value={`$${Number(dashboard.ventas_total || 0).toFixed(2)}`} Icon={MdAttachMoney} />
          <KpiCard title="Compras Total" value={`$${Number(dashboard.compras_total || 0).toFixed(2)}`} Icon={MdShoppingCart} />
          <KpiCard title="Clientes con saldo" value={dashboard.clientes_con_saldo || 0} Icon={MdPeople} />
          <KpiCard title="Bajo minimo" value={dashboard.productos_bajo_minimo || 0} Icon={MdInventory2} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <VentasDiariasChart data={ventasDiarias} />
        <VentasMetodoChart ventas={ventas} />
      </div>

      <TopProductosChart data={topProductos} />
    </div>
  );
}
