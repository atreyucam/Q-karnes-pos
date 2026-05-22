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
    roles: ['ADMIN'],
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
    roles: ['ADMIN'],
    defaultTo: '/transformaciones',
    basePath: '/transformaciones',
    items: [
      { to: '/transformaciones/nueva', label: 'Nuevo despiece' },
      { to: '/transformaciones', label: 'Lotes de despiece' }
    ]
  },
  { type: 'link', to: '/productos', label: 'Productos', icon: PiTag, roles: ['ADMIN'] },
  { type: 'link', to: '/inventario', label: 'Inventario', icon: PiPackage, roles: ['ADMIN'] },
  { type: 'link', to: '/clientes', label: 'Clientes', icon: PiUsersThree, roles: ['ADMIN', 'CAJERO'] },
  { type: 'link', to: '/proveedores', label: 'Proveedores', icon: PiStorefront, roles: ['ADMIN'] },
  {
    type: 'group',
    key: 'reportes',
    label: 'Reportes',
    icon: PiChartBar,
    roles: ['ADMIN'],
    defaultTo: '/reportes/resumen',
    basePath: '/reportes',
    items: [
      { to: '/reportes/resumen', label: 'Resumen' },
      { to: '/reportes/ventas', label: 'Ventas' },
      { to: '/reportes/caja', label: 'Caja' },
      { to: '/reportes/inventario', label: 'Inventario' }
    ]
  },
  { type: 'link', to: '/admin/auditoria', label: 'Auditoria', icon: PiWarningCircle, roles: ['ADMIN'] },
  { type: 'link', to: '/admin/configuracion', label: 'Configuración', icon: PiGearSix, roles: ['ADMIN'] },
  { type: 'link', to: '/admin/sistema', label: 'Sistema', icon: PiHardDrives, roles: ['ADMIN'] }
];

function normalizePath(path) {
  return String(path || '').split('?')[0];
}

function searchMatches(expectedSearch, currentSearch) {
  if (!expectedSearch) return true;
  const expected = new URLSearchParams(String(expectedSearch));
  const current = new URLSearchParams(String(currentSearch || '').replace(/^\?/, ''));

  return Array.from(expected.entries()).every(([key, value]) => current.get(key) === value);
}

export function isNavigationItemActive(item, location) {
  return location.pathname === normalizePath(item.to) && searchMatches(item.search, location.search);
}

export function hasActiveGroupDescendant(group, location) {
  return group.items.some((item) => isNavigationItemActive(item, location));
}

export function isGroupActive(group, location) {
  return hasActiveGroupDescendant(group, location);
}
