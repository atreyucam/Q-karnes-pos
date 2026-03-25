import { Navigate } from 'react-router-dom';
import AppLayout from '../layout/AppLayout';
import { RequireAuth, RequireRole, RootRedirect } from './guards';
import LoginPage from '../pages/auth/LoginPage';
import DashboardPage from '../pages/dashboard/DashboardPage';
import CajaPage from '../pages/caja/CajaPage';
import NuevaVentaPage from '../pages/ventas/NuevaVentaPage';
import VentasListPage from '../pages/ventas/VentasListPage';
import ClientesPage from '../pages/clientes/ClientesPage';
import ClienteDetallePage from '../pages/clientes/ClienteDetallePage';
import ProveedoresPage from '../pages/proveedores/ProveedoresPage';
import ProveedorDetallePage from '../pages/proveedores/ProveedorDetallePage';
import ProductosPage from '../pages/productos/ProductosPage';
import ComprasPage from '../pages/compras/ComprasPage';
import CompraNuevaPage from '../pages/compras/CompraNuevaPage';
import CompraDetallePage from '../pages/compras/CompraDetallePage';
import CompraCargarPage from '../pages/compras/CompraCargarPage';
import InventarioPage from '../pages/inventario/InventarioPage';
import ReportesPage from '../pages/reportes/ReportesPage';
import ConfiguracionPage from '../pages/admin/ConfiguracionPage';
import AuditoriaPage from '../pages/admin/AuditoriaPage';
import SistemaPage from '../pages/admin/SistemaPage';
import TransformacionesListPage from '../pages/transformaciones/TransformacionesListPage';
import TransformacionFormPage from '../pages/transformaciones/TransformacionFormPage';

export const appRoutes = [
  { path: '/', element: <RootRedirect /> },
  { path: '/login', element: <LoginPage /> },
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
              { path: '/ventas/:id', element: <NuevaVentaPage /> },
              { path: '/ventas', element: <VentasListPage /> },
              { path: '/clientes', element: <ClientesPage /> },
              { path: '/clientes/:id', element: <ClienteDetallePage /> }
            ]
          },
          {
            element: <RequireRole roles={['ADMIN', 'CAJERO']} />,
            children: [
              { path: '/proveedores', element: <ProveedoresPage /> },
              { path: '/proveedores/:id', element: <ProveedorDetallePage /> },
              { path: '/productos', element: <ProductosPage /> },
              { path: '/compras', element: <ComprasPage /> },
              { path: '/compras/nueva', element: <CompraNuevaPage /> },
              { path: '/compras/ordenes/:id', element: <CompraDetallePage /> },
              { path: '/compras/ordenes/:id/cargar', element: <CompraCargarPage /> },
              { path: '/inventario', element: <InventarioPage /> },
              { path: '/transformaciones', element: <TransformacionesListPage /> },
              { path: '/transformaciones/nueva', element: <TransformacionFormPage /> },
              { path: '/transformaciones/:id/editar', element: <TransformacionFormPage /> },
              { path: '/transformaciones/:id', element: <TransformacionFormPage /> }
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
          { path: '/reportes', element: <ReportesPage /> },
          { path: '*', element: <Navigate to="/dashboard" replace /> }
        ]
      }
    ]
  }
];
