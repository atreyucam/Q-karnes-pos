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
    <div className="ui-paginator mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition hover:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => onPageChange(Math.max(1, paginaActual - 1))}
          disabled={paginaActual <= 1}
          aria-label="Pagina anterior"
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
              className={clsx(
                'flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition',
                page === paginaActual
                  ? 'border-[var(--color-text)] bg-[var(--color-text)] text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]'
              )}
            >
              {page}
            </button>
          )
        )}

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition hover:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
          onClick={() => onPageChange(Math.min(totalPaginas, paginaActual + 1))}
          disabled={paginaActual >= totalPaginas}
          aria-label="Pagina siguiente"
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
