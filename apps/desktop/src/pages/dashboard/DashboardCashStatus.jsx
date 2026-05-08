import { useNavigate } from 'react-router-dom';
import { Button, Panel, PanelHeader } from '../../shared/ui';
import { PiArrowUpRight, PiCashRegister } from 'react-icons/pi';
import { formatDashboardMoney } from './dashboardFormatters';

function resolveCashStatus(isOpen) {
  if (isOpen) {
    return {
      label: 'Abierta',
      tone: 'text-[#16A34A]',
      helper: 'Caja operativa',
      cardClass: 'border-[#86EFAC] bg-[#DCFCE7]'
    };
  }
  return {
    label: 'Cerrada',
    tone: 'text-[#DC2626]',
    helper: 'Requiere apertura',
    cardClass: 'border-[var(--color-border)] bg-white'
  };
}

function CashMetric({ label, value }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{value}</p>
    </div>
  );
}

export default function DashboardCashStatus({ kpis }) {
  const navigate = useNavigate();
  const status = resolveCashStatus(Boolean(kpis?.caja_abierta));
  const hasTransactions = Number(kpis?.transacciones_hoy || 0) > 0;

  return (
    <Panel className="p-5">
      <PanelHeader title="Caja hoy" description="Estado operativo y lectura rápida de caja." />

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <CashMetric label="Ventas totales" value={formatDashboardMoney(kpis?.ventas_hoy)} />
        <CashMetric label="Efectivo" value={hasTransactions ? 'No disponible' : '$0.00'} />
        <CashMetric label="Transferencias" value={hasTransactions ? 'No disponible' : '$0.00'} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <CashMetric label="Ticket promedio" value={formatDashboardMoney(kpis?.ticket_promedio)} />
        <div className={`rounded-xl border p-3 ${status.cardClass}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Estado de caja</p>
          <p className={`mt-1 text-lg font-bold ${status.tone}`}>{status.label}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{status.helper}</p>
        </div>
      </div>

      <Button
        type="button"
        variant="neutral"
        className="mt-4 flex w-full items-center justify-between"
        onClick={() => navigate('/caja')}
      >
        <span className="flex items-center gap-2">
          <PiCashRegister className="text-base" />
          {kpis?.caja_abierta ? 'Ver caja' : 'Abrir caja'}
        </span>
        <PiArrowUpRight className="text-base text-[var(--color-text-muted)]" />
      </Button>
    </Panel>
  );
}
