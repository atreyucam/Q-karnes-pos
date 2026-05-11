import clsx from 'clsx';
import Button from '../primitives/Button';
import { uiClassTokens } from '../../tokens/uiClassTokens';

const alignMap = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end'
};

const variantMap = {
  view: uiClassTokens.button.tableActionView,
  edit: uiClassTokens.button.tableActionEdit,
  primary: uiClassTokens.button.tableActionPrimary,
  danger: uiClassTokens.button.tableActionDanger,
  neutral: uiClassTokens.button.tableActionNeutral
};

const legacyVariantMap = {
  secondary: 'edit',
  success: 'primary',
  warning: 'neutral'
};

function resolveVariant(variant = 'neutral') {
  return variantMap[variant] ? variant : (legacyVariantMap[variant] || 'neutral');
}

export function TableActions({ children, align = 'end', wrap = true, className }) {
  return (
    <div
      className={clsx(
        'flex w-full items-center gap-2',
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
  iconOnly = false,
  loading = false,
  disabled = false,
  className,
  ...props
}) {
  const resolvedVariant = resolveVariant(variant);

  return (
    <Button
      unstyled
      size={iconOnly ? 'icon' : 'table'}
      icon={icon}
      loading={loading}
      disabled={disabled}
      className={clsx(
        uiClassTokens.button.base,
        uiClassTokens.button.tableActionBase,
        variantMap[resolvedVariant],
        className
      )}
      {...props}
    >
      {iconOnly ? null : <span className="hidden lg:inline">{children}</span>}
    </Button>
  );
}

export default TableActions;
