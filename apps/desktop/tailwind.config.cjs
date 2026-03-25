module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--color-brand)',
        cashier: 'var(--color-cashier)',
        danger: 'var(--color-danger)',
        warning: 'var(--color-warning)',
        info: 'var(--color-info)',
        success: 'var(--color-success)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        border: 'var(--color-border)',
        text: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
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
