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
  const isNuevaVentaRoute = location.pathname === '/ventas/nueva' || /^\/ventas\/\d+$/.test(location.pathname);

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
            'h-screen pt-[calc(var(--topbar-height)+0.45rem)]',
            isNuevaVentaRoute ? 'overflow-hidden pb-4' : 'overflow-y-auto pb-8'
          )}
        >
          <section
            className={clsx(
              uiClassTokens.page.section,
              'pt-4 sm:pt-5 lg:pt-6',
              isNuevaVentaRoute && '!min-h-0 h-[calc(100dvh-var(--topbar-height)-1.25rem)] overflow-hidden pb-4 sm:pb-4 lg:pb-4'
            )}
          >
            <div className={clsx(uiClassTokens.page.container, isNuevaVentaRoute && 'flex h-full min-h-0 flex-col overflow-hidden')}>
              {children}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
