export const uiClassTokens = {
  page: {
    section: '-mx-4 -mb-4 min-h-screen bg-background px-4 pb-4 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6 lg:-mx-8 lg:-mb-8 lg:px-8 lg:pb-8',
    container: 'mx-auto max-w-[1400px] rounded-3xl border border-border bg-surface p-4 shadow-posSm sm:p-6 lg:p-8',
    title: 'text-2xl font-bold text-text',
    subtitle: 'text-text-muted',
    header: {
      layout: 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'
    }
  },
  card: {
    base: 'rounded-2xl border border-border bg-surface',
    header: 'rounded-t-2xl border-b border-border bg-background px-4 py-4',
    headerTitle: 'text-lg font-bold text-text',
    headerSubtitle: 'text-sm text-text-muted',
    body: 'p-4'
  },
  table: {
    wrapper: 'overflow-hidden rounded-2xl border border-border bg-surface shadow-posSm',
    base: 'w-full text-left text-sm text-text-muted',
    headRow: 'border-b border-border bg-background text-xs font-bold uppercase tracking-wider text-text-muted',
    headCell: 'px-6 py-3',
    body: 'divide-y divide-border bg-surface',
    row: 'transition-colors hover:bg-background',
    cell: 'px-6 py-4',
    empty: 'py-16 text-center'
  },
  button: {
    base: 'inline-flex cursor-pointer items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
    primary: 'bg-primary text-text-inverse hover:bg-primary-hover active:bg-primary-hover',
    secondary: 'border border-border bg-surface text-text hover:bg-background active:bg-surface-alt',
    danger: 'bg-danger text-text-inverse hover:bg-danger-hover active:bg-danger-hover',
    warning: 'bg-warning text-text-inverse hover:bg-warning-hover active:bg-warning-hover',
    neutral: 'border border-border bg-surface-alt text-text-muted hover:bg-background',
    ghost: 'border border-border bg-surface text-text-muted hover:bg-background shadow-none',
    icon: 'border border-border bg-surface text-text-muted hover:bg-background hover:text-text shadow-none',
    iconView: 'border border-info bg-info text-text-inverse hover:opacity-95 shadow-none',
    iconEdit: 'border border-warning bg-warning text-text-inverse hover:opacity-95 shadow-none',
    iconSecondary: 'border border-primary bg-primary text-text-inverse hover:bg-primary-hover shadow-none',
    iconSuccess: 'border border-success bg-success text-text-inverse hover:opacity-95 shadow-none',
    successOutline: 'border border-success bg-surface text-success hover:bg-success-soft shadow-none',
    warningOutline: 'border border-warning bg-surface text-warning hover:bg-warning-soft shadow-none',
    dangerOutline: 'border border-danger bg-surface text-danger hover:bg-danger-soft shadow-none',
    iconDanger: 'border border-danger bg-danger text-text-inverse hover:opacity-95 shadow-none',
    tableAction: '!px-3 !py-1.5 text-xs border-border',
    iconAction: '!px-2.5 !py-2'
  },
  input: {
    label: 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-text-muted',
    base: 'w-full rounded-xl border bg-surface py-2.5 text-sm text-text placeholder:text-text-subtle focus:outline-none focus:ring-2 transition-all',
    normal: 'border-border-strong focus:border-primary focus:ring-primary-soft',
    error: 'border-danger focus:border-danger focus:ring-danger-soft',
    withIcon: 'pl-10 pr-3',
    withoutIcon: 'px-3'
  },
  select: {
    base: 'w-full appearance-none rounded-xl border bg-surface py-2.5 pl-3 pr-10 text-sm text-text focus:outline-none focus:ring-2 transition-all',
    normal: 'border-border-strong focus:border-primary focus:ring-primary-soft',
    error: 'border-danger focus:border-danger focus:ring-danger-soft'
  },
  modal: {
    overlay: 'fixed inset-0 z-[1000] bg-black/50 backdrop-blur-[1px] p-0 sm:p-4 flex sm:items-center sm:justify-center',
    panel: 'flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-border bg-surface shadow-posLg sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl',
    width: {
      default: 'sm:max-w-[min(880px,calc(100vw-1rem))]',
      medium: 'sm:max-w-[min(840px,calc(100vw-1rem))]',
      large: 'sm:max-w-[min(1040px,calc(100vw-1rem))]',
      xlarge: 'sm:max-w-[min(1120px,calc(100vw-1rem))]'
    },
    header: 'border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8',
    headerTitle: 'text-lg font-extrabold leading-tight text-text sm:text-xl',
    headerDescription: 'mt-0.5 text-sm text-text-muted',
    close: 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-subtle transition-colors hover:bg-surface-alt hover:text-text',
    body: 'min-h-0 flex-1 overflow-y-auto',
    footer: 'border-t border-border bg-surface px-4 py-4 sm:px-6 lg:px-8'
  }
};

export default uiClassTokens;
