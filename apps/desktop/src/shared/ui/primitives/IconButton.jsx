import clsx from 'clsx';
import Button from './Button';

export default function IconButton({ className, size = 'md', variant = 'icon', 'aria-label': ariaLabel, children, ...props }) {
  const resolvedSize = size === 'lg' ? 'lg' : 'icon';
  return (
    <Button
      variant={variant}
      size={resolvedSize}
      className={clsx(
        'ui-icon-btn shadow-none',
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
