import clsx from 'clsx';
import { NavLink } from 'react-router-dom';

export default function SidebarItem({
  to,
  label,
  Icon,
  isActive = false,
  collapsed = false,
  onClick,
  end = true
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      data-state={isActive ? 'active' : 'idle'}
      className={clsx(
        'ui-sidebar-item',
        isActive ? 'ui-sidebar-item-active' : 'ui-sidebar-item-idle',
        collapsed && 'justify-center px-0'
      )}
    >
      {!collapsed ? <span className={clsx('ui-sidebar-active-rail', isActive && 'ui-sidebar-active-rail-visible')} /> : null}

      {Icon ? (
        collapsed ? (
          <div className="ui-sidebar-icon-wrap">
            <Icon className="text-xl" />
          </div>
        ) : null
      ) : null}

      {!collapsed && (
        <span className="ui-sidebar-item-content min-w-0">
          {Icon ? (
            <div className="ui-sidebar-icon-wrap">
              <Icon className="text-xl" />
            </div>
          ) : null}
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </span>
      )}
    </NavLink>
  );
}
