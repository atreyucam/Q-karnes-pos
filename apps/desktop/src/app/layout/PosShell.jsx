import clsx from 'clsx';
import { useLocation } from 'react-router-dom';
import PosSidebar from './PosSidebar';
import PosTopbar from './PosTopbar';
import { uiClassTokens } from '../../shared/tokens/uiClassTokens';

export default function PosShell({
  user,
  collapsed,
  mobileOpen,
  onToggleMenu,
  onCloseMobile,
  children
}) {
  const location = useLocation();
  const isNuevaVentaRoute = location.pathname === '/ventas/nueva';

  return (
    <div
      className="app-shell"
      style={{
        '--sidebar-width': collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width-expanded)',
        '--topbar-height': 'var(--topbar-height-base)'
      }}
    >
      <PosSidebar
        user={user}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={onCloseMobile}
      />

      <div className="app-shell-content lg:pl-[var(--sidebar-width)]">
        <PosTopbar user={user} onToggleMenu={onToggleMenu} />
        <main
          className={clsx(
            'h-[calc(100dvh-var(--topbar-height))] overflow-x-hidden pt-1.5 sm:pt-2',
            isNuevaVentaRoute ? 'overflow-hidden pb-1.5' : 'overflow-y-auto pb-8'
          )}
        >
          <section
            className={clsx(
              uiClassTokens.page.section,
              'pt-1.5 sm:pt-2 lg:pt-2.5',
              isNuevaVentaRoute && '!min-h-0 h-[calc(100dvh-var(--topbar-height)-0.7rem)] overflow-hidden !px-2 !pt-1.5 !pb-1.5 sm:!px-2.5 sm:!pt-2 sm:!pb-2 lg:!px-3 lg:!pt-2.5 lg:!pb-2.5'
            )}
          >
            <div
              className={clsx(
                uiClassTokens.page.container,
                isNuevaVentaRoute && 'flex h-full min-h-0 flex-col overflow-hidden !p-1.5 sm:!p-2 lg:!p-2.5'
              )}
            >
              {children}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
