import { EmptyState, Panel, PanelHeader, StatusChip } from '../../shared/ui';
import { PiCashRegister, PiPackage, PiShoppingCartSimple, PiUserPlus } from 'react-icons/pi';
import { formatRelativeTime } from './dashboardFormatters';

const toneClasses = {
  success: 'bg-[var(--color-cashier-soft)] text-[var(--color-cashier)]',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  error: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  info: 'bg-[var(--color-info-soft)] text-[var(--color-info)]'
};

function resolveIcon(modulo = '') {
  const scope = String(modulo || '').toUpperCase();
  if (scope === 'CAJA') return PiCashRegister;
  if (scope === 'VENTAS' || scope === 'COMPRAS') return PiShoppingCartSimple;
  if (scope === 'INVENTARIO') return PiPackage;
  if (scope === 'CLIENTES') return PiUserPlus;
  return PiCashRegister;
}

export default function DashboardActivityList({ items = [] }) {
  return (
    <Panel className="p-5">
      <PanelHeader
        title="Últimas actividades"
        description="Eventos recientes del sistema para seguimiento operativo."
        actions={<StatusChip tone="info">{items.length} eventos</StatusChip>}
      />

      {items.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="Sin actividad reciente"
          description="Los últimos movimientos operativos aparecerán aquí."
        />
      ) : (
        <div className="mt-5 space-y-4">
          {items.map((item, index) => {
            const Icon = resolveIcon(item.modulo);

            return (
              <div key={item.id || `${item.titulo}-${index}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-1 flex h-9 w-9 items-center justify-center rounded-2xl text-xs font-bold ${toneClasses[item.tone] || toneClasses.info}`}>
                    <Icon className="text-base" />
                  </span>
                  {index < items.length - 1 ? <span className="mt-2 h-full w-px bg-[var(--color-border)]" /> : null}
                </div>

                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{item.titulo}</p>
                    <StatusChip tone={item.tone}>{item.modulo}</StatusChip>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{item.descripcion}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <span>{item.usuario}</span>
                    <span className="h-1 w-1 rounded-full bg-[var(--color-border-strong)]" />
                    <span>{formatRelativeTime(item.fecha)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
