import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

const variantMap = {
  primary: uiClassTokens.button.primary,
  secondary: uiClassTokens.button.secondary,
  neutral: uiClassTokens.button.neutral,
  ghost: uiClassTokens.button.ghost,
  outline: uiClassTokens.button.ghost,
  warning: uiClassTokens.button.warning,
  amber: uiClassTokens.button.warning,
  info: uiClassTokens.button.secondary,
  icon: uiClassTokens.button.icon,
  iconView: uiClassTokens.button.iconView,
  iconEdit: uiClassTokens.button.iconEdit,
  iconSecondary: uiClassTokens.button.iconSecondary,
  iconSuccess: uiClassTokens.button.iconSuccess,
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  cashier: uiClassTokens.button.primary,
  outlineSuccess: uiClassTokens.button.successOutline,
  outlineWarning: uiClassTokens.button.warningOutline,
  outlineDanger: uiClassTokens.button.dangerOutline,
  iconDanger: uiClassTokens.button.iconDanger
};

const sizeMap = {
  sm: 'px-3 py-2 text-xs',
  md: '',
  lg: 'px-5 py-3 text-sm'
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={clsx(uiClassTokens.button.base, variantMap[variant] || variantMap.primary, sizeMap[size] || sizeMap.md, className)}
      {...props}
    >
      {children}
    </button>
  );
}
