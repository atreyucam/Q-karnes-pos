export const uiClassTokens = {
  page: {
    section: '-mx-4 -mb-4 min-h-screen bg-background px-4 pb-4 sm:-mx-4 sm:-mb-4 sm:px-4 sm:pb-4 lg:-mx-6 lg:-mb-6 lg:px-6 lg:pb-6',
    container: 'mx-auto max-w-[1400px] rounded-[16px] border border-border bg-surface p-4 shadow-posSm sm:p-5 lg:p-6',
    title: 'text-2xl font-bold text-text',
    subtitle: 'text-sm font-normal text-text-muted',
    header: {
      layout: 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'
    }
  },
  card: {
    base: 'rounded-[16px] border border-border bg-surface shadow-posSm',
    header: 'rounded-t-[16px] border-b border-border bg-surface-muted px-5 py-4',
    headerTitle: 'text-base font-semibold text-text',
    headerSubtitle: 'text-sm text-text-muted',
    body: 'p-5'
  },
  table: {
    wrapper: 'overflow-hidden rounded-[14px] border border-border bg-surface shadow-posSm',
    base: 'w-full border-separate border-spacing-0 text-left text-[13px] text-text',
    headRow: 'bg-background text-[12px] font-semibold uppercase tracking-[0.03em] text-text-muted',
    headCell: 'h-11 px-4 py-0',
    body: 'divide-y divide-border bg-surface',
    row: 'transition-colors even:bg-[#FCFCFD] hover:bg-surface-alt',
    cell: 'h-14 px-4 py-0 align-middle text-[13px] font-medium text-text-secondary',
    empty: 'py-16 text-center'
  },
  button: {
    base: 'relative inline-flex cursor-pointer items-center justify-center whitespace-nowrap transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:transform-none',
    primary: 'bg-[var(--color-primary)] text-[var(--color-text-inverse)] border border-[var(--color-primary)] shadow-sm hover:bg-[var(--color-primary-hover)] hover:border-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] active:border-[var(--color-primary-active)]',
    secondary: 'bg-[var(--color-surface-alt)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-hover)] hover:border-[var(--color-border-strong)] active:bg-[var(--color-surface-muted)] active:border-[var(--color-border-strong)]',
    neutral: 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] active:bg-[var(--color-surface-muted)] active:border-[var(--color-border-strong)]',
    ghost: 'bg-transparent text-[var(--color-text-muted)] border border-transparent shadow-none hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] active:bg-[var(--color-hover)]',
    danger: 'bg-[var(--color-danger)] text-[var(--color-text-inverse)] border border-[var(--color-danger)] shadow-sm hover:bg-[var(--color-danger-hover)] hover:border-[var(--color-danger-hover)] active:bg-[var(--color-danger-active)] active:border-[var(--color-danger-active)]',
    iconAction: 'shadow-none',
    tableActionBase: 'shadow-none',
    tableActionView: 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] active:bg-[var(--color-surface-muted)]',
    tableActionNeutral: 'bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] active:bg-[var(--color-surface-muted)]',
    tableActionEdit: 'bg-[var(--color-info-soft)] text-[var(--color-info-soft-text)] border border-[color:color-mix(in_oklab,var(--color-info)_24%,white_76%)] hover:bg-[color:color-mix(in_oklab,var(--color-info-soft)_86%,white_14%)] hover:border-[color:color-mix(in_oklab,var(--color-info)_36%,white_64%)] active:bg-[color:color-mix(in_oklab,var(--color-info-soft)_72%,white_28%)]',
    tableActionPrimary: 'bg-[var(--color-primary)] text-[var(--color-text-inverse)] border border-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] hover:border-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] active:border-[var(--color-primary-active)]',
    tableActionDanger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger-soft-text)] border border-[color:color-mix(in_oklab,var(--color-danger)_26%,white_74%)] hover:bg-[color:color-mix(in_oklab,var(--color-danger-soft)_82%,white_18%)] hover:border-[color:color-mix(in_oklab,var(--color-danger)_38%,white_62%)] active:bg-[color:color-mix(in_oklab,var(--color-danger-soft)_70%,white_30%)]'
  },
  input: {
    label: 'mb-1.5 block text-xs font-bold uppercase tracking-[0.04em] text-text-muted',
    base: 'h-10 w-full rounded-[10px] border bg-surface px-3 text-sm font-normal text-text placeholder:text-text-subtle disabled:bg-surface-muted disabled:text-text-subtle focus:outline-none transition-all',
    normal: 'border-border focus:border-[var(--color-focus)] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.16)]',
    error: 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.14)]',
    withIcon: 'pl-10 pr-3',
    withoutIcon: 'px-3'
  },
  select: {
    base: 'h-10 w-full appearance-none rounded-[10px] border bg-surface py-0 pl-3 pr-10 text-sm font-normal text-text disabled:bg-surface-muted disabled:text-text-subtle focus:outline-none transition-all',
    normal: 'border-border focus:border-[var(--color-focus)] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.16)]',
    error: 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.14)]'
  },
  modal: {
    overlay: 'fixed inset-0 z-[1000] bg-black/45 p-0 sm:p-4 flex sm:items-center sm:justify-center',
    panel: 'flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-border bg-surface shadow-posSm sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl',
    width: {
      default: 'sm:max-w-[min(880px,calc(100vw-1rem))]',
      medium: 'sm:max-w-[min(840px,calc(100vw-1rem))]',
      large: 'sm:max-w-[min(1040px,calc(100vw-1rem))]',
      xlarge: 'sm:max-w-[min(1120px,calc(100vw-1rem))]'
    },
    header: 'border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8',
    headerTitle: 'text-lg font-extrabold leading-tight text-text sm:text-xl',
    headerDescription: 'mt-0.5 text-sm text-text-muted',
    close: 'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-alt hover:text-text',
    body: 'min-h-0 flex-1 overflow-y-auto',
    footer: 'border-t border-border bg-surface px-4 py-4 sm:px-6 lg:px-8'
  }
};

export default uiClassTokens;
