import { MdChevronLeft, MdChevronRight } from 'react-icons/md';

export default function Paginador({
  paginaActual = 1,
  totalPaginas = 1,
  totalRegistros = 0,
  mostrarSiempre = false,
  onPageChange = () => {}
}) {
  if (!mostrarSiempre && totalPaginas <= 1) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-sm text-slate-500">Registros: {totalRegistros}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, paginaActual - 1))}
          disabled={paginaActual <= 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"
        >
          <MdChevronLeft className="text-xl" />
        </button>
        <span className="text-sm text-slate-600">
          Pagina {paginaActual} de {Math.max(totalPaginas, 1)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPaginas, paginaActual + 1))}
          disabled={paginaActual >= totalPaginas}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"
        >
          <MdChevronRight className="text-xl" />
        </button>
      </div>
    </div>
  );
}
