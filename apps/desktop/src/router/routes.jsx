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
import ComprasPage from '../pages/compras/ComprasPage';
import CompraNuevaPage from '../pages/compras/CompraNuevaPage';
import CompraDetallePage from '../pages/compras/CompraDetallePage';
import CompraCargarPage from '../pages/compras/CompraCargarPage';
import InventarioPage from '../pages/inventario/InventarioPage';
import ReportesPage from '../pages/reportes/ReportesPage';

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
              { path: '/compras', element: <ComprasPage /> },
              { path: '/compras/nueva', element: <CompraNuevaPage /> },
              { path: '/compras/ordenes/:id', element: <CompraDetallePage /> },
              { path: '/compras/ordenes/:id/cargar', element: <CompraCargarPage /> },
              { path: '/inventario', element: <InventarioPage /> }
            ]
          },
          { path: '/reportes', element: <ReportesPage /> },
          { path: '*', element: <Navigate to="/dashboard" replace /> }
        ]
      }
    ]
  }
];
