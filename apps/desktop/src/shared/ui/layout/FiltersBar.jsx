import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export default function FiltersBar({
  title = 'Filtros',
  description,
  search,
  actions,
  children,
  className,
  secondaryMinWidth = 180
}) {
  return (
    <section className={clsx(uiClassTokens.card.base, 'space-y-4 p-5', className)}>
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">{title}</p>
        {description ? <p className="text-sm text-text-muted">{description}</p> : null}
      </div>

      {search ? <div>{search}</div> : null}

      {(children || actions) ? (
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          {children ? (
            <div
              className="grid flex-1 gap-3"
              style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${secondaryMinWidth}px, 1fr))` }}
            >
              {children}
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {actions ? (
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-none xl:justify-end">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
