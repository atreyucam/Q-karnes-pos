import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { SidebarItem, SidebarSection } from '../../shared/ui';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { isGroupActive, navigationItems } from './posNavigation';

function getActiveKey(items, location) {
  const activeGroup = items.find(
    (item) => item.type === 'group' && isGroupActive(item, location)
  );
  if (activeGroup) return activeGroup.key;

  const activeLink = items.find(
    (item) => item.type === 'link' && item.to === location.pathname
  );
  if (activeLink) return activeLink.to;

  return null;
}

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
  const [selectedKey, setSelectedKey] = useState(null);
  const hasSelectedGroupOverride = useMemo(
    () => visibleItems.some((item) => item.type === 'group' && item.key === selectedKey),
    [selectedKey, visibleItems]
  );

  useEffect(() => {
    const activeGroup = visibleItems.find(
      (item) => item.type === 'group' && isGroupActive(item, location)
    );

    setOpenGroupKey(activeGroup?.key ?? null);
    setSelectedKey(getActiveKey(visibleItems, location));
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
          'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-[var(--color-border)] bg-white',
          'transition-all duration-200 ease-in-out',
          'w-[var(--sidebar-width)]',
          'transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-[var(--topbar-height)] items-center border-b border-[var(--color-border)] px-4">
          <button
            type="button"
            onClick={() => {
              setSelectedKey('/dashboard');
              navigate('/dashboard');
              onCloseMobile?.();
            }}
            className={clsx(
              'flex w-full items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-[var(--color-surface-muted)]',
              collapsed && 'justify-center'
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)] shadow-sm ring-1 ring-[var(--color-border)]">
              <span className="text-[0.95rem] font-black">QK</span>
            </div>

            {!collapsed && (
              <div className="min-w-0 overflow-hidden text-left">
                <p className="truncate text-[1.15rem] font-extrabold text-[var(--color-text)]">
                  {negocioNombre}
                </p>
              </div>
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-4 py-5">
          {visibleItems.map((item) => {
            if (item.type === 'link') {
              return (
                <SidebarItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  Icon={item.icon}
                  collapsed={collapsed}
                  onClick={() => {
                    setSelectedKey(item.to);
                    onCloseMobile?.();
                  }}
                  forceActive={selectedKey === item.to}
                />
              );
            }

            return (
              <SidebarSection
                key={item.key}
                group={item}
                collapsed={collapsed}
                open={openGroupKey === item.key}
                forceActive={selectedKey === item.key}
                onToggle={() => {
                  setSelectedKey(item.key);
                  setOpenGroupKey((current) => (current === item.key ? null : item.key));
                }}
                onNavigateDefault={() => {
                  setSelectedKey(item.key);
                  navigate(item.defaultTo);
                  onCloseMobile?.();
                }}
                onChildNavigate={() => {
                  setSelectedKey(item.key);
                  onCloseMobile?.();
                }}
                onCloseMobile={onCloseMobile}
                location={location}
                groupActive={hasSelectedGroupOverride ? selectedKey === item.key : isGroupActive(item, location)}
              />
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[var(--color-border)] p-4">
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
