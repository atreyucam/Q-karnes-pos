import clsx from 'clsx';
import { PiCaretLeft, PiCaretRight } from 'react-icons/pi';

function buildVisiblePages(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 3) return [1, 2, 3, 'ellipsis', total];
  if (current >= total - 2) return [1, 'ellipsis', total - 2, total - 1, total];
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total];
}

export default function Paginador({
  paginaActual = 1,
  totalPaginas = 1,
  totalRegistros = 0,
  mostrarSiempre = false,
  onPageChange = () => {}
}) {
  if (!mostrarSiempre && totalPaginas <= 1) return null;

  const pages = buildVisiblePages(paginaActual, Math.max(totalPaginas, 1));

  return (
    <div className="ui-paginator">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="ui-pagination-item"
          onClick={() => onPageChange(Math.max(1, paginaActual - 1))}
          disabled={paginaActual <= 1}
        >
          <PiCaretLeft className="text-base" />
        </button>

        {pages.map((page, index) =>
          page === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-1 text-sm font-semibold text-[var(--color-text-muted)]">
              ...
            </span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              className={clsx('ui-pagination-item', page === paginaActual && 'ui-pagination-item-active')}
            >
              {page}
            </button>
          )
        )}

        <button
          type="button"
          className="ui-pagination-item"
          onClick={() => onPageChange(Math.min(totalPaginas, paginaActual + 1))}
          disabled={paginaActual >= totalPaginas}
        >
          <PiCaretRight className="text-base" />
        </button>
      </div>

      <div className="ui-paginator-summary">
        {totalRegistros} registros
      </div>
    </div>
  );
}
