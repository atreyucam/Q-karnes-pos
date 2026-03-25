import {
  PiCashRegister,
  PiChartBar,
  PiGearSix,
  PiHardDrives,
  PiHouseLine,
  PiKnife,
  PiPackage,
  PiShoppingCartSimple,
  PiStorefront,
  PiTag,
  PiTruck,
  PiUsersThree
} from 'react-icons/pi';

export const navigationItems = [
  { type: 'link', to: '/dashboard', label: 'Inicio', icon: PiHouseLine, roles: ['ADMIN', 'CAJERO'] },
  { type: 'link', to: '/caja', label: 'Caja', icon: PiCashRegister, roles: ['ADMIN', 'CAJERO'] },
  {
    type: 'group',
    key: 'ventas',
    label: 'Ventas',
    icon: PiShoppingCartSimple,
    roles: ['ADMIN', 'CAJERO'],
    defaultTo: '/ventas/nueva',
    basePath: '/ventas',
    items: [
      { to: '/ventas/nueva', label: 'Nueva venta' },
      { to: '/ventas', label: 'Historial y devoluciones' }
    ]
  },
  {
    type: 'group',
    key: 'compras',
    label: 'Compras',
    icon: PiTruck,
    roles: ['ADMIN', 'CAJERO'],
    defaultTo: '/compras',
    basePath: '/compras',
    items: [
      { to: '/compras', label: 'Órdenes' },
      { to: '/compras/nueva', label: 'Nueva orden' }
    ]
  },
  {
    type: 'group',
    key: 'despiece',
    label: 'Despiece',
    icon: PiKnife,
    roles: ['ADMIN', 'CAJERO'],
    defaultTo: '/transformaciones',
    basePath: '/transformaciones',
    items: [
      { to: '/transformaciones', label: 'Lotes de despiece' },
      { to: '/transformaciones/nueva', label: 'Nuevo despiece' }
    ]
  },
  { type: 'link', to: '/productos', label: 'Productos', icon: PiTag, roles: ['ADMIN', 'CAJERO'] },
  { type: 'link', to: '/inventario', label: 'Inventario', icon: PiPackage, roles: ['ADMIN', 'CAJERO'] },
  { type: 'link', to: '/clientes', label: 'Clientes', icon: PiUsersThree, roles: ['ADMIN', 'CAJERO'] },
  { type: 'link', to: '/proveedores', label: 'Proveedores', icon: PiStorefront, roles: ['ADMIN', 'CAJERO'] },
  {
    type: 'group',
    key: 'reportes',
    label: 'Reportes',
    icon: PiChartBar,
    roles: ['ADMIN', 'CAJERO'],
    defaultTo: '/reportes?tab=ventas',
    basePath: '/reportes',
    items: [
      { to: '/reportes', search: 'tab=ventas', label: 'Ventas' },
      { to: '/reportes', search: 'tab=ventasProducto', label: 'Ventas por producto' },
      { to: '/reportes', search: 'tab=inventario', label: 'Inventario' },
      { to: '/reportes', search: 'tab=caja', label: 'Caja' },
      { to: '/reportes', search: 'tab=cxc', label: 'Cuentas por cobrar' },
      { to: '/reportes', search: 'tab=cxp', label: 'Cuentas por pagar' },
      { to: '/reportes', search: 'tab=compras', label: 'Compras' }
    ]
  },
  { type: 'link', to: '/admin/configuracion', label: 'Configuración', icon: PiGearSix, roles: ['ADMIN'] },
  { type: 'link', to: '/admin/sistema', label: 'Sistema', icon: PiHardDrives, roles: ['ADMIN'] }
];

export function isGroupActive(group, location) {
  const basePath = group.basePath || group.defaultTo?.split('?')[0];
  if (!basePath) return false;
  return location.pathname === basePath || location.pathname.startsWith(`${basePath}/`);
}
