import clsx from 'clsx';
import { NavLink } from 'react-router-dom';

export default function SidebarItem({
  to,
  label,
  Icon,
  collapsed = false,
  onClick,
  forceActive = false
}) {
  return (
    <NavLink
      to={to}
      title={label}
      onClick={onClick}
      className={() =>
        clsx(
          'ui-sidebar-item',
          forceActive ? 'ui-sidebar-item-active' : 'ui-sidebar-item-idle',
          collapsed && 'justify-center px-0'
        )
      }
    >
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
