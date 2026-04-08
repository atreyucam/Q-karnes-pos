import { useNavigate } from 'react-router-dom';
import { Panel, PanelHeader } from '../../shared/ui';
import {
  PiArrowUpRight,
  PiCashRegister,
  PiPackage,
  PiShoppingCartSimple,
  PiTruck
} from 'react-icons/pi';

const quickActions = [
  {
    id: 'venta',
    title: 'Nueva venta',
    description: 'Ir al flujo de facturación y cobro.',
    to: '/ventas/nueva',
    Icon: PiShoppingCartSimple
  },
  {
    id: 'caja',
    title: 'Abrir caja',
    description: 'Revisar turno activo y movimientos de caja.',
    to: '/caja',
    Icon: PiCashRegister
  },
  {
    id: 'compra',
    title: 'Registrar compra',
    description: 'Crear una nueva orden o recepción.',
    to: '/compras/nueva',
    Icon: PiTruck
  },
  {
    id: 'inventario',
    title: 'Ver inventario',
    description: 'Consultar stock, alertas y ajustes.',
    to: '/inventario',
    Icon: PiPackage
  }
];

export default function DashboardQuickActions() {
  const navigate = useNavigate();

  return (
    <Panel className="p-5">
      <PanelHeader
        title="Accesos rápidos"
        description="Atajos a los flujos operativos que más se usan en caja."
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {quickActions.map(({ id, title, description, to, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => navigate(to)}
            className="group rounded-[22px] border border-[var(--color-border)] bg-[linear-gradient(180deg,var(--color-surface)_0%,var(--color-surface-alt)_100%)] p-4 text-left shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-md)]"
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
