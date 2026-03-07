import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireRole({ roles }) {
  const user = useAuthStore((s) => s.user);
  const role = user?.rol?.nombre;

  if (!role) return <Navigate to="/dashboard" replace />;
  if (!roles.includes(role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function RootRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}
