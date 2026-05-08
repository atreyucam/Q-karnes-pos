import { chartPalette, colors } from './colorTokens';

export const posTokens = {
  typography: {
    fontSans: '"Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", sans-serif',
    screenTitle: '24px',
    sectionTitle: '20px',
    panelTitle: '16px',
    body: '14px',
    bodyStrong: '14px',
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
    hover: colors.neutral.hover,
    border: colors.neutral.border,
    borderStrong: colors.neutral.borderStrong,
    text: colors.text.DEFAULT,
    textSecondary: colors.text.secondary,
    textMuted: colors.text.muted,
    textSubtle: colors.text.subtle,
    focus: '#93C5FD'
  },
  radii: {
    sm: '8px',
    md: '10px',
    lg: '12px',
    xl: '16px'
  },
  shadows: {
    sm: '0 1px 2px rgba(17, 24, 39, 0.04)',
    md: '0 8px 24px rgba(17, 24, 39, 0.10)',
    lg: '0 24px 48px rgba(17, 24, 39, 0.16)'
  },
  motion: {
    fast: '160ms',
    normal: '240ms'
  },
  sizes: {
    sidebarExpanded: '240px',
    sidebarCollapsed: '72px',
    topbarHeight: '64px'
  }
};
