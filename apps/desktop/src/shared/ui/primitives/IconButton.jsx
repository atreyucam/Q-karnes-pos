import clsx from 'clsx';
import Button from './Button';

export default function IconButton({ className, size = 'md', variant = 'icon', 'aria-label': ariaLabel, children, ...props }) {
  return (
    <Button
      variant={variant}
      size={size}
      className={clsx(
        'ui-icon-btn !p-0 shadow-none',
        size === 'sm' && 'h-8 w-8',
        size === 'md' && 'h-9 w-9',
        size === 'lg' && 'h-10 w-10',
        className
      )}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </Button>
  );
}
