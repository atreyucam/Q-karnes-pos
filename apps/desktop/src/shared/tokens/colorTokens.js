export const colors = {
  primary: {
    DEFAULT: '#EF4444',
    hover: '#DC2626',
    active: '#B91C1C',
    soft: '#FEE2E2',
    softText: '#991B1B',
    contrast: '#FFFFFF'
  },
  neutral: {
    white: '#FFFFFF',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceAlt: '#F9FAFB',
    hover: '#F3F4F6',
    border: '#E5E7EB',
    borderStrong: '#D1D5DB'
  },
  text: {
    DEFAULT: '#111827',
    secondary: '#374151',
    muted: '#6B7280',
    subtle: '#9CA3AF',
    inverse: '#FFFFFF'
  },
  success: {
    DEFAULT: '#10B981',
    hover: '#059669',
    soft: '#D1FAE5',
    softText: '#065F46'
  },
  warning: {
    DEFAULT: '#F59E0B',
    hover: '#D97706',
    soft: '#FEF3C7',
    softText: '#92400E'
  },
  danger: {
    DEFAULT: '#EF4444',
    hover: '#B91C1C',
    soft: '#FEE2E2',
    softText: '#991B1B'
  },
  info: {
    DEFAULT: '#3B82F6',
    hover: '#2563EB',
    soft: '#DBEAFE',
    softText: '#1E40AF'
  },
  chart: {
    primary: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
    axis: '#6B7280',
    grid: '#E5E7EB'
  }
};

export const cssColorVariables = {
  '--color-primary': colors.primary.DEFAULT,
  '--color-primary-hover': colors.primary.hover,
  '--color-primary-active': colors.primary.active,
  '--color-primary-soft': colors.primary.soft,
  '--color-primary-soft-text': colors.primary.softText,
  '--color-background': colors.neutral.background,
  '--color-background-alt': colors.neutral.surfaceAlt,
  '--color-surface': colors.neutral.surface,
  '--color-surface-alt': colors.neutral.surfaceAlt,
  '--color-surface-muted': colors.neutral.background,
  '--color-hover': colors.neutral.hover,
  '--color-border': colors.neutral.border,
  '--color-border-strong': colors.neutral.borderStrong,
  '--color-text': colors.text.DEFAULT,
  '--color-text-secondary': colors.text.secondary,
  '--color-text-muted': colors.text.muted,
  '--color-text-subtle': colors.text.subtle,
  '--color-text-inverse': colors.text.inverse,
  '--color-success': colors.success.DEFAULT,
  '--color-success-hover': colors.success.hover,
  '--color-success-soft': colors.success.soft,
  '--color-success-soft-text': colors.success.softText,
  '--color-warning': colors.warning.DEFAULT,
  '--color-warning-hover': colors.warning.hover,
  '--color-warning-soft': colors.warning.soft,
  '--color-warning-soft-text': colors.warning.softText,
  '--color-danger': colors.danger.DEFAULT,
  '--color-danger-hover': colors.danger.hover,
  '--color-danger-soft': colors.danger.soft,
  '--color-danger-soft-text': colors.danger.softText,
  '--color-info': colors.info.DEFAULT,
  '--color-info-hover': colors.info.hover,
  '--color-info-soft': colors.info.soft,
  '--color-info-soft-text': colors.info.softText,
  '--color-focus': '#93C5FD',
  '--color-chart-primary': colors.chart.primary,
  '--color-chart-success': colors.chart.success,
  '--color-chart-warning': colors.chart.warning,
  '--color-chart-danger': colors.chart.danger,
  '--color-chart-info': colors.chart.info,
  '--color-chart-axis': colors.chart.axis,
  '--color-chart-grid': colors.chart.grid,
  '--color-brand': colors.primary.DEFAULT,
  '--color-brand-hover': colors.primary.hover,
  '--color-brand-soft': colors.primary.soft,
  '--color-cashier': colors.success.DEFAULT,
  '--color-cashier-hover': colors.success.hover,
  '--color-cashier-soft': colors.success.soft
};

export const chartPalette = {
  primary: colors.chart.primary,
  success: colors.chart.success,
  warning: colors.chart.warning,
  danger: colors.chart.danger,
  info: colors.chart.info,
  axis: colors.chart.axis,
  grid: colors.chart.grid
};

export const kpiSoftToneMap = {
  primary: colors.primary.soft,
  success: colors.success.soft,
  warning: colors.warning.soft,
  danger: colors.danger.soft,
  info: colors.info.soft
};

export function applyColorTokens(target = typeof document !== 'undefined' ? document.documentElement : null) {
  if (!target) return;

  Object.entries(cssColorVariables).forEach(([name, value]) => {
    target.style.setProperty(name, value);
  });
}
