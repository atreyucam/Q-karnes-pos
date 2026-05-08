import clsx from 'clsx';
import { NavLink } from 'react-router-dom';
import { PiCaretDownBold, PiCaretRightBold } from 'react-icons/pi';

function buildHref(item) {
  return item.search ? `${item.to}?${item.search}` : item.to;
}

function isGroupChildActive(child, location) {
  if (location.pathname !== child.to) return false;
  if (!child.search) return true;
  return location.search.includes(child.search);
}

export default function SidebarSection({
  group,
  collapsed,
  open,
  forceActive = false,
  onToggle,
  onNavigateDefault,
  onChildNavigate,
  onCloseMobile,
  location,
  groupActive = false
}) {
  const Icon = group.icon;
  const active = forceActive || groupActive;

  return (
    <div className="space-y-1">
      <button
        type="button"
        title={group.label}
        onClick={collapsed ? onNavigateDefault : onToggle}
        className={clsx(
          'ui-sidebar-item',
          active ? 'ui-sidebar-item-active' : 'ui-sidebar-item-idle',
          collapsed && 'justify-center px-0'
        )}
      >
        {!collapsed && <span className={clsx('ui-sidebar-active-rail', active && 'ui-sidebar-active-rail-visible')} />}

        {!collapsed && (
          <>
            <span className="ui-sidebar-item-content min-w-0">
              {Icon ? (
                <div className="ui-sidebar-icon-wrap">
                  <Icon className="text-xl" />
                </div>
              ) : null}

              <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>
            </span>

            <span className={clsx('ui-sidebar-caret flex items-center justify-center transition-transform duration-150', active && 'ui-sidebar-caret-active')}>
              {open ? (
                <PiCaretDownBold className="text-base" />
              ) : (
                <PiCaretRightBold className="text-base" />
              )}
            </span>
          </>
        )}

        {collapsed && Icon ? (
          <div className="ui-sidebar-icon-wrap">
            <Icon className="text-xl" />
          </div>
        ) : null}
      </button>

      {!collapsed && (
        <div
          className={clsx(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
            open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <div className="ui-sidebar-subgroup mt-1 space-y-1">
              {group.items.map((child) => {
                const active = isGroupChildActive(child, location);

                return (
                  <NavLink
                    key={buildHref(child)}
                    to={buildHref(child)}
                    onClick={() => {
                      onChildNavigate?.();
                      onCloseMobile?.();
                    }}
                    className={clsx(
                      'ui-sidebar-subitem',
                      active
                        ? 'ui-sidebar-subitem-active'
                        : 'ui-sidebar-subitem-idle'
                    )}
                  >
                    <span className="ui-sidebar-subitem-dot" />
                    <span className="truncate">{child.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
