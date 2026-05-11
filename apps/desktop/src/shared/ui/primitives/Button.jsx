import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export const buttonVariantClasses = {
  primary: uiClassTokens.button.primary,
  secondary: uiClassTokens.button.secondary,
  neutral: uiClassTokens.button.neutral,
  ghost: uiClassTokens.button.ghost,
  danger: uiClassTokens.button.danger
};

export const buttonSizeClasses = {
  sm: 'h-8 px-3 rounded-lg text-[13px] font-semibold gap-1.5',
  md: 'h-9 px-4 rounded-[10px] text-sm font-bold gap-2',
  lg: 'h-10 px-5 rounded-xl text-sm font-bold gap-2',
  table: 'h-8 px-2.5 rounded-lg text-[13px] font-semibold gap-1.5',
  icon: 'h-8 w-8 rounded-lg p-0'
};

const legacyVariantMap = {
  outline: 'neutral',
  warning: 'secondary',
  amber: 'secondary',
  info: 'neutral',
  success: 'primary',
  icon: 'neutral',
  iconView: 'neutral',
  iconEdit: 'secondary',
  iconSecondary: 'secondary',
  iconSuccess: 'primary',
  cashier: 'primary',
  outlineSuccess: 'neutral',
  outlineWarning: 'neutral',
  outlineDanger: 'danger',
  iconDanger: 'danger'
};

export function resolveButtonVariant(variant = 'primary') {
  if (buttonVariantClasses[variant]) return variant;
  return legacyVariantMap[variant] || 'primary';
}

function ButtonSpinner() {
  return <span className="ui-button-spinner" aria-hidden="true" />;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  type = 'button',
  children,
  disabled = false,
  loading = false,
  unstyled = false,
  ...props
}) {
  const resolvedVariant = resolveButtonVariant(variant);
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={clsx(
        uiClassTokens.button.base,
        !unstyled && buttonVariantClasses[resolvedVariant],
        buttonSizeClasses[size] || buttonSizeClasses.md,
        className
      )}
      {...props}
    >
      <span className={clsx('inline-flex items-center justify-center gap-2', loading && 'opacity-0')}>
        {icon ? <span className="text-base" aria-hidden="true">{icon}</span> : null}
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center text-current">
          <ButtonSpinner />
        </span>
      ) : null}
    </button>
  );
}
