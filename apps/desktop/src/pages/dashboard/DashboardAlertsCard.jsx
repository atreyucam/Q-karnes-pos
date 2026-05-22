import { useNavigate } from 'react-router-dom';
import { EmptyState, Panel, PanelHeader, StatusChip } from '../../shared/ui';
import { PiArrowUpRight, PiBellRinging, PiWarningCircle } from 'react-icons/pi';
import { useAuthStore } from '../../stores/authStore';
import { formatDateTimeLabel } from './dashboardFormatters';

const toneStyles = {
  info: {
    icon: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    border: 'border-[color:color-mix(in_oklab,var(--color-info)_18%,var(--color-border)_82%)]'
  },
  warning: {
    icon: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    border: 'border-[color:color-mix(in_oklab,var(--color-warning)_20%,var(--color-border)_80%)]'
  },
  error: {
    icon: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    border: 'border-[color:color-mix(in_oklab,var(--color-danger)_18%,var(--color-border)_82%)]'
  }
};

function resolveOperationalAlertHref(alert, role) {
  const id = String(alert?.id || '').toLowerCase();
  const category = String(alert?.category || '').toLowerCase();
  const title = String(alert?.title || '').toLowerCase();

  if (role !== 'ADMIN' && (category.includes('deuda') || id.includes('cxc'))) {
    return '/clientes';
  }

  if (id.includes('cxc') || category.includes('deuda') || title.includes('deuda activa')) {
    return '/clientes?credito=con_deuda';
  }

  if (role !== 'ADMIN' && (id.includes('stock') || category.includes('stock') || category.includes('rotacion'))) {
    return '/dashboard';
  }

  if (id.includes('stock') || category.includes('stock') || title.includes('stock bajo')) {
    return '/inventario?alerta=bajo_minimo';
  }

  if (title.includes('sin stock')) {
    return '/inventario?alerta=sin_stock';
  }

  if (id.includes('caja') || category.includes('caja') || title.includes('caja')) {
    return '/caja';
  }

  return alert?.href || '/dashboard';
}

export default function DashboardAlertsCard({ alerts = [] }) {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.rol?.nombre);

  return (
    <Panel className="p-5">
      <PanelHeader
        title="Alertas operativas"
        description="Situaciones que requieren seguimiento desde ventas, inventario o cobranza."
        actions={<StatusChip tone={alerts.length > 0 ? 'warning' : 'success'}>{alerts.length} activas</StatusChip>}
      />

      {alerts.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="Sin alertas críticas"
          description="No hay incidencias relevantes en stock, caja o cuentas por cobrar."
        />
      ) : (
        <div className="mt-5 space-y-3">
          {alerts.map((alert) => {
            const styles = toneStyles[alert.tone] || toneStyles.warning;

            return (
              <button
                key={alert.id}
                type="button"
                onClick={() => navigate(resolveOperationalAlertHref(alert, role))}
                className={`group flex w-full items-start gap-3 rounded-[22px] border bg-white/90 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)] ${styles.border}`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles.icon}`}>
                  {alert.tone === 'warning' ? <PiWarningCircle className="text-[1.25rem]" /> : <PiBellRinging className="text-[1.2rem]" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-[var(--color-text)]">{alert.title}</span>
                    <PiArrowUpRight className="text-base text-[var(--color-text-muted)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-brand)]" />
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[var(--color-text-muted)]">{alert.description}</span>
                  {alert.meta ? <span className="mt-2 block text-xs font-medium text-[var(--color-text-muted)]">{String(alert.meta).includes(':') ? formatDateTimeLabel(alert.meta) : alert.meta}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
