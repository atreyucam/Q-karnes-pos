import clsx from 'clsx';
import Button from '../primitives/Button';
import { uiClassTokens } from '../../tokens/uiClassTokens';

const alignMap = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end'
};

const variantMap = {
  neutral: uiClassTokens.button.tableActionNeutral,
  warning: uiClassTokens.button.tableActionWarning,
  success: uiClassTokens.button.tableActionSuccess,
  primary: uiClassTokens.button.tableActionSuccess,
  danger: uiClassTokens.button.tableActionDanger,
  secondary: uiClassTokens.button.tableActionSecondary
};

export function TableActions({ children, align = 'end', wrap = true, className }) {
  return (
    <div
      className={clsx(
        'flex w-full items-center gap-1.5',
        alignMap[align] || alignMap.end,
        wrap ? 'flex-wrap' : 'flex-nowrap',
        className
      )}
    >
      {children}
    </div>
  );
}

export function TableActionButton({
  children,
  variant = 'neutral',
  icon,
  loading = false,
  disabled = false,
  className,
  ...props
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled || loading}
      className={clsx(
        uiClassTokens.button.tableActionBase,
        variantMap[variant] || variantMap.neutral,
        className
      )}
      {...props}
    >
      {icon ? <span className="text-sm" aria-hidden="true">{icon}</span> : null}
      <span>{loading ? 'Procesando...' : children}</span>
    </Button>
  );
}

export default TableActions;
