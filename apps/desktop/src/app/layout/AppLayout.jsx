import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import PosShell from './PosShell';

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const cargarTodo = useConfiguracionStore((s) => s.cargarTodo);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const current = `${location.pathname}${location.search || ''}`;
    if (location.pathname === '/' || location.pathname === '/login') return;
    window.localStorage.setItem('qk_last_route', current);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!user?.id) return;
    cargarTodo().catch(() => {});
  }, [user?.id, cargarTodo]);

  const handleMenuToggle = () => {
    if (window.innerWidth < 1024) {
      setMobileOpen((prev) => !prev);
      return;
    }
    setCollapsed((prev) => !prev);
  };

  return (
    <PosShell
      user={user}
      collapsed={collapsed}
      mobileOpen={mobileOpen}
      onToggleMenu={handleMenuToggle}
      onCloseMobile={() => setMobileOpen(false)}
    >
      <Outlet />
    </PosShell>
  );
}
