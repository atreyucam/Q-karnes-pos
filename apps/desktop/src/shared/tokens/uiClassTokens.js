export const uiClassTokens = {
  page: {
    section: '-mx-4 -mb-4 min-h-screen bg-slate-50 px-4 pb-4 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6 lg:-mx-8 lg:-mb-8 lg:px-8 lg:pb-8',
    container: 'mx-auto max-w-[1400px] rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8',
    title: 'text-2xl font-bold text-slate-900',
    subtitle: 'text-slate-500',
    header: {
      layout: 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'
    }
  },
  card: {
    base: 'rounded-2xl border border-slate-200 bg-white',
    header: 'rounded-t-2xl border-b border-slate-100 bg-slate-50 px-4 py-4',
    headerTitle: 'text-lg font-bold text-slate-900',
    headerSubtitle: 'text-sm text-slate-500',
    body: 'p-4'
  },
  table: {
    wrapper: 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
    base: 'w-full text-left text-sm text-slate-600',
    headRow: 'bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200',
    headCell: 'px-6 py-3',
    body: 'divide-y divide-slate-100 bg-white',
    row: 'transition-colors hover:bg-slate-50/80',
    cell: 'px-6 py-4',
    empty: 'py-16 text-center'
  },
  button: {
    base: 'inline-flex cursor-pointer items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
    secondary: 'bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800',
    warning: 'bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800',
    neutral: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200',
    ghost: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-none',
    icon: 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 hover:text-slate-700 shadow-none',
    iconView: 'bg-white text-emerald-600 border border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700 shadow-none',
    iconEdit: 'bg-white text-amber-600 border border-amber-100 hover:bg-amber-50 hover:text-amber-700 shadow-none',
    iconSecondary: 'bg-white text-sky-600 border border-sky-100 hover:bg-sky-50 hover:text-sky-700 shadow-none',
    iconSuccess: 'bg-white text-emerald-600 border border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700 shadow-none',
    successOutline: 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 shadow-none',
    warningOutline: 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50 shadow-none',
    dangerOutline: 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 shadow-none',
    iconDanger: 'bg-white text-slate-500 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shadow-none',
    tableAction: '!px-3 !py-1.5 text-xs border-slate-200',
    iconAction: '!px-2.5 !py-2'
  },
  input: {
    label: 'block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide',
    base: 'w-full rounded-xl border bg-white py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all',
    normal: 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100',
    error: 'border-rose-300 focus:border-rose-500 focus:ring-rose-200',
    withIcon: 'pl-10 pr-3',
    withoutIcon: 'px-3'
  },
  select: {
    base: 'w-full rounded-xl border bg-white py-2.5 pl-3 pr-10 text-sm text-slate-900 focus:outline-none focus:ring-2 transition-all appearance-none',
    normal: 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-100',
    error: 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
  },
  modal: {
    overlay: 'fixed inset-0 z-[1000] bg-black/50 backdrop-blur-[1px] p-0 sm:p-4 flex sm:items-center sm:justify-center',
    panel: 'w-full h-[100dvh] sm:h-auto sm:max-h-[calc(100dvh-2rem)] rounded-none sm:rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(0,0,0,.18)] overflow-hidden flex flex-col',
    width: {
      default: 'sm:max-w-[min(880px,calc(100vw-1rem))]',
      medium: 'sm:max-w-[min(840px,calc(100vw-1rem))]',
      large: 'sm:max-w-[min(1040px,calc(100vw-1rem))]',
      xlarge: 'sm:max-w-[min(1120px,calc(100vw-1rem))]'
    },
    header: 'px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-200 bg-slate-50/50',
    headerTitle: 'text-lg sm:text-xl font-extrabold text-slate-900 leading-tight',
    headerDescription: 'text-sm text-slate-500 mt-0.5',
    close: 'inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors',
    body: 'min-h-0 flex-1 overflow-y-auto',
    footer: 'px-4 sm:px-6 lg:px-8 py-4 border-t border-slate-200 bg-white'
  }
};

export default uiClassTokens;
