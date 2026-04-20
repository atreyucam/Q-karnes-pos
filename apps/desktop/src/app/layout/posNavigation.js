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
  PiWarningCircle,
  PiUsersThree
} from 'react-icons/pi';

export const navigationItems = [
  { type: 'link', to: '/dashboard', label: 'Inicio', icon: PiHouseLine, roles: ['ADMIN', 'CAJERO'] },
  { type: 'link', to: '/caja', label: 'Caja', icon: PiCashRegister, roles: ['ADMIN', 'CAJERO'] },
  { type: 'link', to: '/ventas/nueva', label: 'Nueva venta', icon: PiShoppingCartSimple, roles: ['ADMIN', 'CAJERO'] },
  { type: 'link', to: '/ventas', label: 'Ventas', icon: PiShoppingCartSimple, roles: ['ADMIN', 'CAJERO'] },
  {
    type: 'group',
    key: 'compras',
    label: 'Compras',
    icon: PiTruck,
    roles: ['ADMIN', 'CAJERO'],
    defaultTo: '/compras/nueva',
    basePath: '/compras',
    items: [
      { to: '/compras/nueva', label: 'Nueva orden' },
      { to: '/compras', label: 'Órdenes' }
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
    defaultTo: '/reportes?tab=ventas-dia',
    basePath: '/reportes',
    items: [
      { to: '/reportes', search: 'tab=ventas-dia', label: 'Ventas del dia' },
      { to: '/reportes', search: 'tab=ventas-periodo', label: 'Ventas por periodo' },
      { to: '/reportes', search: 'tab=ventas-producto', label: 'Ventas por producto' },
      { to: '/reportes', search: 'tab=inventario-actual', label: 'Inventario valorizado' },
      { to: '/reportes', search: 'tab=kardex', label: 'Kardex' },
      { to: '/reportes', search: 'tab=transformaciones', label: 'Transformaciones' },
      { to: '/reportes', search: 'tab=caja-diaria', label: 'Caja diaria' }
    ]
  },
  { type: 'link', to: '/admin/auditoria', label: 'Auditoria', icon: PiWarningCircle, roles: ['ADMIN'] },
  { type: 'link', to: '/admin/configuracion', label: 'Configuración', icon: PiGearSix, roles: ['ADMIN'] },
  { type: 'link', to: '/admin/sistema', label: 'Sistema', icon: PiHardDrives, roles: ['ADMIN'] }
];

export function isGroupActive(group, location) {
  const basePath = group.basePath || group.defaultTo?.split('?')[0];
  if (!basePath) return false;
  return location.pathname === basePath || location.pathname.startsWith(`${basePath}/`);
}
