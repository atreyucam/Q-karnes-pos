module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          active: 'var(--color-primary-active)',
          soft: 'var(--color-primary-soft)',
          softText: 'var(--color-primary-soft-text)'
        },
        background: {
          DEFAULT: 'var(--color-background)',
          alt: 'var(--color-background-alt)'
        },
        surface: {
          DEFAULT: 'var(--color-surface)',
          alt: 'var(--color-surface-alt)',
          muted: 'var(--color-surface-muted)'
        },
        hover: 'var(--color-hover)',
        text: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          subtle: 'var(--color-text-subtle)',
          inverse: 'var(--color-text-inverse)'
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)'
        },
        success: {
          DEFAULT: 'var(--color-success)',
          hover: 'var(--color-success-hover)',
          soft: 'var(--color-success-soft)',
          text: 'var(--color-success-soft-text)'
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          hover: 'var(--color-warning-hover)',
          soft: 'var(--color-warning-soft)',
          text: 'var(--color-warning-soft-text)'
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          hover: 'var(--color-danger-hover)',
          soft: 'var(--color-danger-soft)',
          text: 'var(--color-danger-soft-text)'
        },
        info: {
          DEFAULT: 'var(--color-info)',
          hover: 'var(--color-info-hover)',
          soft: 'var(--color-info-soft)',
          text: 'var(--color-info-soft-text)'
        },
        brand: 'var(--color-brand)',
        cashier: 'var(--color-cashier)',
        focus: 'var(--color-focus)'
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)'
      },
      boxShadow: {
        posSm: 'var(--shadow-sm)',
        posMd: 'var(--shadow-md)',
        posLg: 'var(--shadow-lg)'
      },
      fontFamily: {
        sans: ['var(--font-sans)']
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem'
      }
    }
  }
};
