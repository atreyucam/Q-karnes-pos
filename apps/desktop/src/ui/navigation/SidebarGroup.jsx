import clsx from 'clsx';
import { NavLink } from 'react-router-dom';
import { PiCaretDown, PiCaretRight } from 'react-icons/pi';

function buildHref(item) {
  return item.search ? `${item.to}?${item.search}` : item.to;
}

function isGroupChildActive(child, location) {
  if (location.pathname !== child.to) return false;
  if (!child.search) return true;
  return location.search.includes(child.search);
}

export default function SidebarGroup({
  group,
  collapsed,
  open,
  onToggle,
  onNavigateDefault,
  onCloseMobile,
  location,
  groupActive
}) {
  const Icon = group.icon;

  return (
    <div>
      <button
        type="button"
        title={collapsed ? group.label : undefined}
        onClick={collapsed ? onNavigateDefault : onToggle}
        className={clsx(
          'w-full relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-semibold tracking-[0.01em]',
          'transition-colors duration-200',
          groupActive
            ? 'bg-[linear-gradient(135deg,var(--color-primary)_0%,var(--color-primary-strong)_100%)] text-white shadow-[0_14px_24px_-20px_rgba(180,20,40,0.9)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]'
        )}
      >
        <Icon className="text-[1.1rem] shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{group.label}</span>
            {open ? <PiCaretDown className="text-lg" /> : <PiCaretRight className="text-lg" />}
          </>
        )}
      </button>

      {!collapsed && (
        <div
          className={clsx(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <div className="mt-1 space-y-1 pl-3">
              {group.items.map((child) => (
                <NavLink
                  key={buildHref(child)}
                  to={buildHref(child)}
                  onClick={onCloseMobile}
                  className={() =>
                    clsx(
                      'block rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors duration-200',
                      isGroupChildActive(child, location)
                        ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_rgba(180,20,40,0.14)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]'
                    )
                  }
                >
                  {child.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
