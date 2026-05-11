import { useNavigate } from 'react-router-dom';
import { Panel, PanelHeader } from '../../shared/ui';
import {
  PiArrowUpRight,
  PiCashRegister,
  PiChartBar,
  PiPackage,
  PiShoppingCartSimple,
  PiTruck
} from 'react-icons/pi';

const primaryAction = {
  id: 'venta',
  title: 'Nueva venta',
  description: 'Iniciar facturación y cobro',
  to: '/ventas/nueva',
  Icon: PiShoppingCartSimple
};

const secondaryActions = [
  {
    id: 'caja',
    title: 'Abrir/Ver caja',
    description: 'Revisar turno y movimientos',
    to: '/caja',
    Icon: PiCashRegister
  },
  {
    id: 'ventas',
    title: 'Ver ventas',
    description: 'Consultar historial comercial',
    to: '/ventas',
    Icon: PiChartBar
  },
  {
    id: 'compra',
    title: 'Registrar compra',
    description: 'Ir al módulo de compras',
    to: '/compras',
    Icon: PiTruck
  },
  {
    id: 'inventario',
    title: 'Inventario rápido',
    description: 'Consultar stock y alertas',
    to: '/inventario',
    Icon: PiPackage
  }
];

export default function DashboardQuickActions() {
  const navigate = useNavigate();

  return (
    <Panel className="p-5">
      <PanelHeader
        title="Zona principal de acción"
        description="Flujos operativos prioritarios para caja."
      />

      <button
        type="button"
        onClick={() => navigate(primaryAction.to)}
        className="mt-5 w-full rounded-[22px] border border-[var(--color-primary)] bg-[var(--color-primary)] p-5 text-left text-white shadow-[var(--shadow-md)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-primary-hover)] hover:bg-[var(--color-primary-hover)] hover:shadow-lg"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
            <primaryAction.Icon className="text-[1.35rem]" />
          </span>
          <PiArrowUpRight className="text-xl text-white/90" />
        </div>
        <p className="mt-4 text-xl font-bold">{primaryAction.title}</p>
        <p className="mt-1 text-sm text-white/85">{primaryAction.description}</p>
      </button>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {secondaryActions.map(({ id, title, description, to, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => navigate(to)}
            className="group rounded-[18px] border border-[var(--color-border)] bg-white p-4 text-left shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-md)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-brand)] shadow-sm">
                <Icon className="text-[1.3rem]" />
              </span>
              <PiArrowUpRight className="text-lg text-[var(--color-text-muted)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-brand)]" />
            </div>
            <p className="mt-4 text-base font-semibold text-[var(--color-text)]">{title}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
          </button>
        ))}
      </div>
    </Panel>
  );
}
