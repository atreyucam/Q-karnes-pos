import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  const sidebarWidth = collapsed ? 80 : 260;

  const handleMenuToggle = () => {
    if (window.innerWidth < 1024) {
      setMobileOpen((prev) => !prev);
      return;
    }
    setCollapsed((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-slate-50" style={{ '--sidebar-width': `${sidebarWidth}px` }}>
      <Sidebar
        user={user}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="lg:pl-[var(--sidebar-width)] transition-all duration-300 ease-in-out">
        <Topbar user={user} onToggleMenu={handleMenuToggle} />

        <main className="h-screen overflow-y-auto pt-20 px-4 pb-8 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
