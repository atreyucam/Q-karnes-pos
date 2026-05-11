import clsx from 'clsx';
import Button from './Button';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export default function IconButton({
  variant = 'neutral',
  size = 'md',
  className,
  ariaLabel,
  children,
  ...props
}) {
  const sizeClass = size === 'lg'
    ? 'h-10 w-10 rounded-xl'
    : size === 'sm'
      ? 'h-8 w-8 rounded-lg'
      : 'h-9 w-9 rounded-[10px]';

  return (
    <Button
      variant={variant}
      size="icon"
      className={clsx(uiClassTokens.button.iconAction, sizeClass, className)}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </Button>
  );
}
