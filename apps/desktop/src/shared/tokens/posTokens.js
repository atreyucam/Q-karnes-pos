import { chartPalette, colors } from './colorTokens';

export const posTokens = {
  typography: {
    fontSans: '"Inter", "Segoe UI", "Trebuchet MS", sans-serif',
    screenTitle: '24px',
    sectionTitle: '20px',
    panelTitle: '18px',
    body: '15px',
    bodyStrong: '15px',
    small: '12px',
    total: '32px',
    grandTotal: '36px'
  },
  colors: {
    brand: colors.primary.DEFAULT,
    brandHover: colors.primary.hover,
    brandSoft: colors.primary.soft,
    cashier: colors.success.DEFAULT,
    cashierHover: colors.success.hover,
    cashierSoft: colors.success.soft,
    danger: colors.danger.DEFAULT,
    dangerSoft: colors.danger.soft,
    warning: colors.warning.DEFAULT,
    warningSoft: colors.warning.soft,
    info: colors.info.DEFAULT,
    infoSoft: colors.info.soft,
    success: colors.success.DEFAULT,
    successSoft: colors.success.soft,
    background: colors.neutral.background,
    backgroundAlt: colors.neutral.surfaceAlt,
    surface: colors.neutral.surface,
    surfaceAlt: colors.neutral.surfaceAlt,
    surfaceMuted: colors.neutral.background,
    border: colors.neutral.border,
    borderStrong: colors.neutral.borderStrong,
    text: colors.text.DEFAULT,
    textMuted: colors.text.muted,
    textSubtle: colors.text.subtle,
    focus: colors.primary.DEFAULT
  },
  radii: {
    sm: '10px',
    md: '14px',
    lg: '18px',
    xl: '24px'
  },
  shadows: {
    sm: '0 10px 30px -22px rgba(31, 41, 55, 0.28)',
    md: '0 18px 48px -28px rgba(31, 41, 55, 0.32)',
    lg: '0 28px 72px -36px rgba(31, 41, 55, 0.34)'
  },
  motion: {
    fast: '160ms',
    normal: '240ms'
  },
  sizes: {
    sidebarExpanded: '272px',
    sidebarCollapsed: '88px',
    topbarHeight: '68px'
  }
};
