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
        <div className="ui-sidebar-icon-wrap">
          <Icon className="text-xl" />
        </div>
      ) : null}

      {!collapsed && (
        <div className="min-w-0 flex-1">
          <span className="truncate">{label}</span>
        </div>
      )}
    </NavLink>
  );
}
