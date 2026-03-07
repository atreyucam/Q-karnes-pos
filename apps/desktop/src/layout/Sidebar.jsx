import { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  MdDashboard,
  MdPointOfSale,
  MdBarChart,
  MdKeyboardArrowDown,
  MdKeyboardArrowRight
} from 'react-icons/md';
import { FaCashRegister, FaBoxes, FaTruckLoading, FaUsers } from 'react-icons/fa';
import { BsPeopleFill } from 'react-icons/bs';

const menuItems = [
  { to: '/dashboard', label: 'Dashboard', icon: MdDashboard, roles: ['ADMIN', 'CAJERO'] },
  { to: '/caja', label: 'Caja', icon: FaCashRegister, roles: ['ADMIN', 'CAJERO'] },
  { to: '/ventas/nueva', label: 'Nueva venta', icon: MdPointOfSale, roles: ['ADMIN', 'CAJERO'] },
  { to: '/ventas', label: 'Historial ventas', icon: MdPointOfSale, roles: ['ADMIN', 'CAJERO'] },
  { to: '/clientes', label: 'Clientes', icon: BsPeopleFill, roles: ['ADMIN', 'CAJERO'] },
  { to: '/proveedores', label: 'Proveedores', icon: FaUsers, roles: ['ADMIN', 'CAJERO'] },
  { to: '/compras', label: 'Compras', icon: FaTruckLoading, roles: ['ADMIN', 'CAJERO'] },
  { to: '/inventario', label: 'Inventario', icon: FaBoxes, roles: ['ADMIN', 'CAJERO'] }
];

const reportesItems = [
  { key: 'ventas-diarias', label: 'Ventas diarias' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'top-productos', label: 'Top productos' },
  { key: 'caja', label: 'Caja' },
  { key: 'inventario-movimientos', label: 'Inventario movimientos' }
];

function ItemLink({ to, label, Icon, collapsed, onClick }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          isActive ? 'bg-[#b41428] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
        )
      }
    >
      <Icon className="shrink-0 text-lg" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ user, collapsed, mobileOpen, onCloseMobile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const role = user?.rol?.nombre;
  const [reportesOpen, setReportesOpen] = useState(true);

  const visibleItems = useMemo(() => menuItems.filter((item) => item.roles.includes(role)), [role]);
  const isReportes = location.pathname.startsWith('/reportes');

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-30 bg-slate-900/45 transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onCloseMobile}
      />

      <aside
        className={clsx(
          'fixed left-0 top-0 z-40 h-screen border-r border-slate-200 bg-white px-3 py-4',
          'transition-all duration-300 ease-in-out',
          collapsed ? 'w-20' : 'w-[260px]',
          'transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="mb-5 px-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#b41428]">Qkarnes POS</p>
          {!collapsed && <p className="text-xs text-slate-500">Desktop</p>}
        </div>

        <nav className="space-y-1.5 overflow-y-auto pb-20">
          {visibleItems.map((item) => (
            <ItemLink
              key={item.to}
              to={item.to}
              label={item.label}
              Icon={item.icon}
              collapsed={collapsed}
              onClick={onCloseMobile}
            />
          ))}

          <div className="pt-2">
            <button
              type="button"
              title={collapsed ? 'Reportes' : undefined}
              onClick={() => {
                if (collapsed) {
                  navigate('/reportes?tab=ventas-diarias');
                  onCloseMobile();
                  return;
                }
                setReportesOpen((prev) => !prev);
              }}
              className={clsx(
                'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isReportes ? 'bg-[#b41428] text-white' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              <MdBarChart className="text-lg shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Reportes</span>
                  {reportesOpen ? <MdKeyboardArrowDown className="text-lg" /> : <MdKeyboardArrowRight className="text-lg" />}
                </>
              )}
            </button>

            {!collapsed && reportesOpen && (
              <div className="mt-1 space-y-1 pl-3">
                {reportesItems.map((item) => (
                  <NavLink
                    key={item.key}
                    to={`/reportes?tab=${item.key}`}
                    onClick={onCloseMobile}
                    className={({ isActive }) => {
                      const active = isActive && location.search.includes(`tab=${item.key}`);
                      return clsx(
                        'block rounded-lg px-3 py-2 text-sm transition-colors',
                        active ? 'bg-[#b41428] text-white' : 'text-slate-500 hover:bg-slate-100'
                      );
                    }}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="absolute bottom-4 left-0 w-full px-4 text-[11px] text-slate-400">
          {!collapsed && (
            <>
              <p>Qkarnes POS 2026</p>
              <p>by AtreyuTech</p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
