import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { SidebarItem, SidebarSection } from '../../shared/ui';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { hasActiveGroupDescendant, isNavigationItemActive, navigationItems } from './posNavigation';

export default function PosSidebar({ user, collapsed, mobileOpen, onCloseMobile }) {
  const configuracion = useConfiguracionStore((s) => s.configuracion);
  const location = useLocation();
  const navigate = useNavigate();
  const role = user?.rol?.nombre;

  const visibleItems = useMemo(
    () => navigationItems.filter((item) => item.roles.includes(role)),
    [role]
  );

  const [openGroupKey, setOpenGroupKey] = useState(null);

  useEffect(() => {
    const activeGroup = visibleItems.find(
      (item) => item.type === 'group' && hasActiveGroupDescendant(item, location)
    );

    setOpenGroupKey((current) => {
      if (activeGroup?.key) return activeGroup.key;
      if (current && !visibleItems.some((item) => item.type === 'group' && item.key === current)) {
        return null;
      }
      return current;
    });
  }, [location.pathname, location.search, visibleItems]);

  const negocioNombre = configuracion?.negocio_nombre || 'QKarnes POS';

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onCloseMobile}
      />

      <aside
        className={clsx(
          'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-[var(--color-border)] bg-[color-mix(in_oklab,white_96%,var(--color-surface-alt)_4%)]',
          'transition-all duration-300 ease-out',
          'w-[var(--sidebar-width)]',
          'transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="h-[var(--topbar-height)] border-b border-[var(--color-border)] px-2">
          <Link
            to="/"
            onClick={() => {
              onCloseMobile?.();
            }}
            className={clsx('sidebar-brand !m-0 h-full', collapsed && 'sidebar-brand-collapsed')}
          >
            <div className="sidebar-brand-logo flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
              <img
                src="/logoFrigo.png"
                alt="Logo Frigo"
                className="h-full w-full object-contain"
              />
            </div>

            {!collapsed && (
              <div className="sidebar-brand-text min-w-0 overflow-hidden text-left">
                <p className="sidebar-brand-name truncate">{negocioNombre}</p>
                <p className="sidebar-brand-subtitle">POS</p>
              </div>
            )}
          </Link>
        </div>

        <nav className="sidebar-scroll flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {visibleItems.map((item) => {
            if (item.type === 'link') {
              return (
                <SidebarItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  Icon={item.icon}
                  isActive={isNavigationItemActive(item, location)}
                  collapsed={collapsed}
                  onClick={() => {
                    onCloseMobile?.();
                  }}
                />
              );
            }

            const hasActiveDescendant = hasActiveGroupDescendant(item, location);
            const isExpanded = openGroupKey === item.key;

            return (
              <SidebarSection
                key={item.key}
                group={item}
                collapsed={collapsed}
                isExpanded={isExpanded}
                hasActiveDescendant={hasActiveDescendant}
                onToggle={() => {
                  setOpenGroupKey((current) => (current === item.key ? null : item.key));
                }}
                onNavigateDefault={() => {
                  navigate(item.defaultTo);
                  onCloseMobile?.();
                }}
                onChildNavigate={() => {
                  onCloseMobile?.();
                }}
                onCloseMobile={onCloseMobile}
                location={location}
              />
            );
          })}
        </nav>

        <div className="sidebar-footer mt-auto border-t border-[var(--color-border)] px-4">
          {!collapsed ? (
            <p className="truncate px-2 text-center text-xs font-medium text-[var(--color-text-muted)]">{negocioNombre}</p>
          ) : (
            <div className="h-3" />
          )}
        </div>
      </aside>
    </>
  );
}
