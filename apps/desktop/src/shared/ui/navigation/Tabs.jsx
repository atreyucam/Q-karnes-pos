import clsx from 'clsx';

export default function Tabs({
  items = [],
  value,
  onChange,
  ariaLabel = 'Pestanas',
  className,
  listClassName
}) {
  return (
    <div className={clsx('ui-tabs', className)}>
      <div className={clsx('ui-tab-list', listClassName)} role="tablist" aria-label={ariaLabel}>
        {items.map((item) => {
          const isActive = item.key === value;

          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={item.panelId}
              id={item.tabId}
              disabled={item.disabled}
              className={clsx('ui-tab', isActive && 'ui-tab-active')}
              onClick={() => onChange?.(item.key, item)}
            >
              <span>{item.label}</span>
              {item.badge ? <span className="ui-tab-badge">{item.badge}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
