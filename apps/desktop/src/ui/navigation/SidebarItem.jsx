import clsx from 'clsx';
import { NavLink } from 'react-router-dom';

export default function SidebarItem({
  to,
  label,
  Icon,
  collapsed = false,
  onClick
}) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-semibold tracking-[0.01em]',
          'transition-colors duration-200',
          isActive
            ? 'bg-[linear-gradient(135deg,var(--color-primary)_0%,var(--color-primary-strong)_100%)] text-white shadow-[0_14px_24px_-20px_rgba(180,20,40,0.9)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]'
        )
      }
    >
      <Icon className="shrink-0 text-[1.1rem]" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}
