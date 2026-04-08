export const colors = {
  primary: {
    DEFAULT: '#D32F2F',
    hover: '#B71C1C',
    soft: '#FDECEC',
    contrast: '#FFFFFF'
  },
  neutral: {
    white: '#FFFFFF',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceAlt: '#FAFAFA',
    border: '#E5E7EB',
    borderStrong: '#D1D5DB'
  },
  text: {
    DEFAULT: '#1F2937',
    muted: '#6B7280',
    subtle: '#9CA3AF',
    inverse: '#FFFFFF'
  },
  success: {
    DEFAULT: '#10B981',
    hover: '#0F9F72',
    soft: '#ECFDF5'
  },
  warning: {
    DEFAULT: '#F59E0B',
    hover: '#D97706',
    soft: '#FFFBEB'
  },
  danger: {
    DEFAULT: '#DC2626',
    hover: '#B91C1C',
    soft: '#FEF2F2'
  },
  info: {
    DEFAULT: '#2563EB',
    hover: '#1D4ED8',
    soft: '#EFF6FF'
  },
  chart: {
    primary: '#D32F2F',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#DC2626',
    info: '#2563EB',
    axis: '#6B7280',
    grid: '#E5E7EB'
  }
};

export const cssColorVariables = {
  '--color-primary': colors.primary.DEFAULT,
  '--color-primary-hover': colors.primary.hover,
  '--color-primary-soft': colors.primary.soft,
  '--color-background': colors.neutral.background,
  '--color-background-alt': colors.neutral.surfaceAlt,
  '--color-surface': colors.neutral.surface,
  '--color-surface-alt': colors.neutral.surfaceAlt,
  '--color-surface-muted': colors.neutral.background,
  '--color-border': colors.neutral.border,
  '--color-border-strong': colors.neutral.borderStrong,
  '--color-text': colors.text.DEFAULT,
  '--color-text-muted': colors.text.muted,
  '--color-text-subtle': colors.text.subtle,
  '--color-text-inverse': colors.text.inverse,
  '--color-success': colors.success.DEFAULT,
  '--color-success-hover': colors.success.hover,
  '--color-success-soft': colors.success.soft,
  '--color-warning': colors.warning.DEFAULT,
  '--color-warning-hover': colors.warning.hover,
  '--color-warning-soft': colors.warning.soft,
  '--color-danger': colors.danger.DEFAULT,
  '--color-danger-hover': colors.danger.hover,
  '--color-danger-soft': colors.danger.soft,
  '--color-info': colors.info.DEFAULT,
  '--color-info-hover': colors.info.hover,
  '--color-info-soft': colors.info.soft,
  '--color-focus': colors.primary.DEFAULT,
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
