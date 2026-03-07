import clsx from 'clsx';

export function Tabla({ children, className }) {
  return (
    <div
      className={clsx(
        'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
        '[&_thead_th:last-child]:text-right',
        '[&_tbody_td:last-child]:text-right',
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

export function TablaCabecera({ children }) {
  return <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">{children}</thead>;
}

export function TablaCuerpo({ children }) {
  return <tbody className="divide-y divide-slate-100 text-slate-700">{children}</tbody>;
}

export function TablaFila({ children, className }) {
  return <tr className={clsx('hover:bg-slate-50/70 transition-colors', className)}>{children}</tr>;
}

export function TablaCelda({ children, className = '', as = 'td', ...props }) {
  const Tag = as;
  return <Tag className={clsx('px-4 py-3 text-left', className)} {...props}>{children}</Tag>;
}
