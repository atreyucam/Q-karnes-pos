import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (token && !user) return null;
  return <Outlet />;
}

export function RequireRole({ roles }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const role = user?.rol?.nombre;

  if (token && !user) return null;
  if (!role) return <Navigate to="/dashboard" replace />;
  if (!roles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function RootRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const lastRoute = window.localStorage.getItem('qk_last_route');
  if (lastRoute && lastRoute !== '/' && lastRoute !== '/login') {
    return <Navigate to={lastRoute} replace />;
  }
  return <Navigate to="/dashboard" replace />;
}
