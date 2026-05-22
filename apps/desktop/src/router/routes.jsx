import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import AppLayout from '../layout/AppLayout';
import { RequireAuth, RequireRole, RootRedirect } from './guards';
import LoginPage from '../pages/auth/LoginPage';

const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage'));
const CajaPage = lazy(() => import('../pages/caja/CajaPage'));
const NuevaVentaPage = lazy(() => import('../pages/ventas/NuevaVentaPage'));
const VentaDetallePage = lazy(() => import('../pages/ventas/VentaDetallePage'));
const VentasListPage = lazy(() => import('../pages/ventas/VentasListPage'));
const ClientesPage = lazy(() => import('../pages/clientes/ClientesPage'));
const ClienteDetallePage = lazy(() => import('../pages/clientes/ClienteDetallePage'));
const ProveedoresPage = lazy(() => import('../pages/proveedores/ProveedoresPage'));
const ProveedorDetallePage = lazy(() => import('../pages/proveedores/ProveedorDetallePage'));
const ProveedorFacturaDetallePage = lazy(() => import('../pages/proveedores/ProveedorFacturaDetallePage'));
const ProductosPage = lazy(() => import('../pages/productos/ProductosPage'));
const ComprasPage = lazy(() => import('../pages/compras/ComprasPage'));
const CompraNuevaPage = lazy(() => import('../pages/compras/CompraNuevaPage'));
const CompraDetallePage = lazy(() => import('../pages/compras/CompraDetallePage'));
const CompraCargarPage = lazy(() => import('../pages/compras/CompraCargarPage'));
const InventarioPage = lazy(() => import('../pages/inventario/InventarioPage'));
const ReportesPage = lazy(() => import('../pages/reportes/ReportesPage'));
const ConfiguracionPage = lazy(() => import('../pages/admin/ConfiguracionPage'));
const AuditoriaPage = lazy(() => import('../pages/admin/AuditoriaPage'));
const SistemaPage = lazy(() => import('../pages/admin/SistemaPage'));
const TransformacionesListPage = lazy(() => import('../pages/transformaciones/TransformacionesListPage'));
const TransformacionFormPage = lazy(() => import('../pages/transformaciones/TransformacionFormPage'));
const TransformacionDetallePage = lazy(() => import('../pages/transformaciones/TransformacionDetallePage'));
const DesignSystemPage = lazy(() => import('../pages/dev/DesignSystemPage'));

export const appRoutes = [
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginPage /> },
  ...(import.meta.env.DEV ? [{ path: '/dev/design-system', element: <DesignSystemPage /> }] : []),
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          {
            element: <RequireRole roles={['ADMIN', 'CAJERO']} />,
            children: [
              { path: '/caja', element: <CajaPage /> },
              { path: '/ventas/nueva', element: <NuevaVentaPage /> },
              { path: '/ventas/:id', element: <VentaDetallePage /> },
              { path: '/ventas', element: <VentasListPage /> },
              { path: '/clientes', element: <ClientesPage /> },
              { path: '/clientes/:id', element: <ClienteDetallePage /> }
            ]
          },
          {
            element: <RequireRole roles={['ADMIN']} />,
            children: [
              { path: '/proveedores', element: <ProveedoresPage /> },
              { path: '/proveedores/:id', element: <ProveedorDetallePage /> },
              { path: '/proveedores/:id/facturas/:facturaId', element: <ProveedorFacturaDetallePage /> },
              { path: '/productos', element: <ProductosPage /> },
              { path: '/compras', element: <ComprasPage /> },
              { path: '/compras/nueva', element: <CompraNuevaPage /> },
              { path: '/compras/ordenes/:id', element: <CompraDetallePage /> },
              { path: '/compras/ordenes/:id/cargar', element: <CompraCargarPage /> },
              { path: '/inventario', element: <InventarioPage /> },
              { path: '/transformaciones', element: <TransformacionesListPage /> },
              { path: '/transformaciones/nueva', element: <TransformacionFormPage /> },
              { path: '/transformaciones/:id/editar', element: <TransformacionFormPage /> },
              { path: '/transformaciones/:id', element: <TransformacionDetallePage /> },
              { path: '/reportes', element: <ReportesPage /> },
              { path: '/reportes/:section', element: <ReportesPage /> }
            ]
          },
          {
            element: <RequireRole roles={['ADMIN']} />,
            children: [
              { path: '/admin/configuracion', element: <ConfiguracionPage /> },
              { path: '/admin/auditoria', element: <AuditoriaPage /> },
              { path: '/admin/sistema', element: <SistemaPage /> }
            ]
          },
          { path: '*', element: <Navigate to="/dashboard" replace /> }
        ]
      }
    ]
  }
];
