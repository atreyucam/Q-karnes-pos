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
    base: 'inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:shadow-none',
    primary: 'bg-[#EF4444] text-white border border-[#EF4444] shadow-sm hover:bg-[#DC2626] hover:border-[#DC2626] disabled:bg-[#FEE2E2] disabled:text-[#991B1B] disabled:border-[#FEE2E2]',
    secondary: 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE] hover:bg-[#E0E7FF] hover:border-[#A5B4FC] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    danger: 'bg-white text-[#EF4444] border border-[#FECACA] hover:bg-[#FEE2E2] hover:border-[#FCA5A5] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    warning: 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE] hover:bg-[#E0E7FF] hover:border-[#A5B4FC] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    neutral: 'bg-white text-[#374151] border border-[#E5E7EB] hover:bg-[#F3F4F6] hover:border-[#D1D5DB] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    ghost: 'bg-transparent text-[#374151] border border-transparent hover:bg-[#F3F4F6] disabled:text-[#9CA3AF]',
    icon: 'bg-white text-[#374151] border border-[#E5E7EB] hover:bg-[#F3F4F6] hover:border-[#D1D5DB] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    iconView: 'bg-white text-[#374151] border border-[#E5E7EB] hover:bg-[#F3F4F6] hover:border-[#D1D5DB] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    iconEdit: 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE] hover:bg-[#E0E7FF] hover:border-[#A5B4FC] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    iconSecondary: 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE] hover:bg-[#E0E7FF] hover:border-[#A5B4FC] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    iconSuccess: 'bg-[#EF4444] text-white border border-[#EF4444] shadow-sm hover:bg-[#DC2626] hover:border-[#DC2626] disabled:bg-[#FEE2E2] disabled:text-[#991B1B] disabled:border-[#FEE2E2]',
    successOutline: 'border border-success bg-surface text-success hover:bg-success-soft shadow-none',
    warningOutline: 'border border-warning bg-surface text-warning hover:bg-warning-soft shadow-none',
    dangerOutline: 'border border-danger bg-surface text-danger hover:bg-danger-soft shadow-none',
    iconDanger: 'bg-white text-[#EF4444] border border-[#FECACA] hover:bg-[#FEE2E2] hover:border-[#FCA5A5] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    tableActionBase: '',
    tableActionNeutral: 'bg-white text-[#374151] border border-[#E5E7EB] hover:bg-[#F3F4F6] hover:border-[#D1D5DB] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    tableActionWarning: 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE] hover:bg-[#E0E7FF] hover:border-[#A5B4FC] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    tableActionSuccess: 'bg-[#EF4444] text-white border border-[#EF4444] shadow-sm hover:bg-[#DC2626] hover:border-[#DC2626] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    tableActionDanger: 'bg-white text-[#EF4444] border border-[#FECACA] hover:bg-[#FEE2E2] hover:border-[#FCA5A5] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    tableActionSecondary: 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE] hover:bg-[#E0E7FF] hover:border-[#A5B4FC] disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF] disabled:border-[#E5E7EB]',
    iconAction: ''
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
    overlay: 'fixed inset-0 z-[1000] bg-black/50 backdrop-blur-[1px] p-0 sm:p-4 flex sm:items-center sm:justify-center',
    panel: 'flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-border bg-surface shadow-posLg sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl',
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
