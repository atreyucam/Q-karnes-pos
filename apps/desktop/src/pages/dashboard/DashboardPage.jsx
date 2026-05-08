import { useEffect } from 'react';
import {
  PiCalendarBlank,
  PiCashRegister,
  PiPackage,
  PiReceipt,
  PiWarningCircle,
  PiWallet
} from 'react-icons/pi';
import { Alert, LoadingState, PageHeader, StatusChip } from '../../shared/ui';
import { useDashboardStore } from '../../stores/dashboardStore';
import DashboardAlertsCard from './DashboardAlertsCard';
import DashboardCashStatus from './DashboardCashStatus';
import DashboardKpiCard from './DashboardKpiCard';
import DashboardLatestSalesTable from './DashboardLatestSalesTable';
import DashboardQuickActions from './DashboardQuickActions';
import {
  formatDashboardCount,
  formatDashboardDate,
  formatDashboardMoney,
  formatDelta,
  formatDeltaCount
} from './dashboardFormatters';

export default function DashboardPage() {
  const dashboardData = useDashboardStore((state) => state.dashboardData);
  const loading = useDashboardStore((state) => state.loading);
  const error = useDashboardStore((state) => state.error);
  const hasLoaded = useDashboardStore((state) => state.hasLoaded);
  const cargarDashboard = useDashboardStore((state) => state.cargarDashboard);

  useEffect(() => {
    cargarDashboard();
  }, [cargarDashboard]);

  const kpis = dashboardData.kpis;
  const kpiCards = [
    {
      key: 'ventas',
      title: 'Ventas hoy',
      value: formatDashboardMoney(kpis.ventas_hoy),
      trend: formatDelta(kpis.variacion_ventas_vs_ayer),
      trendTone: Number(kpis.variacion_ventas_vs_ayer || 0) >= 0 ? 'success' : 'danger',
      hint: 'Variación de ventas frente a ayer',
      Icon: PiCashRegister,
      tone: 'brand',
      featured: true
    },
    {
      key: 'transacciones',
      title: 'Transacciones',
      value: formatDashboardCount(kpis.transacciones_hoy),
      trend: formatDelta(kpis.variacion_transacciones_vs_ayer),
      trendTone: Number(kpis.variacion_transacciones_vs_ayer || 0) >= 0 ? 'success' : 'danger',
      hint: `Ticket promedio ${formatDashboardMoney(kpis.ticket_promedio)}`,
      Icon: PiReceipt,
      tone: 'info'
    },
    {
      key: 'stock',
      title: 'Stock bajo',
      value: formatDashboardCount(kpis.stock_bajo),
      trend: formatDeltaCount(kpis.variacion_stock_vs_ayer),
      trendTone: Number(kpis.variacion_stock_vs_ayer || 0) > 0 ? 'warning' : 'success',
      hint: 'Productos en mínimo o por debajo',
      Icon: PiPackage,
      tone: 'warning'
    },
    {
      key: 'deudas',
      title: 'Deudas clientes',
      value: formatDashboardMoney(kpis.deudas_clientes),
      trend: formatDelta(kpis.variacion_deudas),
      trendTone: Number(kpis.variacion_deudas || 0) <= 0 ? 'success' : 'danger',
      hint: `${formatDashboardCount(kpis.clientes_con_deuda)} cliente(s) con saldo`,
      Icon: PiWallet,
      tone: 'danger'
    }
  ];

  return (
    <div className="space-y-6 bg-[#F6F7F9] rounded-2xl">
      <div className="overflow-hidden rounded-2xl bg-[#F6F7F9] px-4 py-3 sm:px-5">
        <PageHeader
          title="Dashboard POS"
          description="Panel operativo del día"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-surface px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] shadow-[var(--shadow-sm)]">
                <PiCalendarBlank className="text-sm text-[var(--color-brand)]" />
                <span>{formatDashboardDate(dashboardData.business_date)}</span>
              </div>
              {loading && hasLoaded ? <StatusChip tone="info">Actualizando</StatusChip> : null}
            </div>
          )}
        />
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading && !hasLoaded ? (
        <LoadingState label="Construyendo resumen operacional..." />
      ) : (
        <>
          <section className="ui-kpi-summary-shell">
            <div className="ui-kpi-summary-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {kpiCards.map(({ key, ...card }) => (
                <DashboardKpiCard key={key} {...card} />
              ))}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <DashboardQuickActions />
            <DashboardCashStatus kpis={kpis} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <DashboardAlertsCard alerts={dashboardData.alertas_operativas} />
            <DashboardLatestSalesTable items={dashboardData.ultimas_ventas} />
          </div>
        </>
      )}

      {!loading && !error && dashboardData.alertas_operativas.length === 0 && kpis.stock_bajo === 0 && kpis.transacciones_hoy === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-alt)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
          <PiWarningCircle className="text-base text-[var(--color-warning)]" />
          <span>Sin operación registrada hoy. El layout se mantiene estable y mostrará datos en cuanto entren movimientos.</span>
        </div>
      ) : null}
    </div>
  );
}
