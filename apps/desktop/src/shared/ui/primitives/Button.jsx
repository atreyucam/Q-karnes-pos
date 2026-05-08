import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

const variantMap = {
  primary: uiClassTokens.button.primary,
  secondary: uiClassTokens.button.secondary,
  neutral: uiClassTokens.button.neutral,
  ghost: uiClassTokens.button.ghost,
  outline: uiClassTokens.button.ghost,
  warning: uiClassTokens.button.secondary,
  amber: uiClassTokens.button.secondary,
  info: uiClassTokens.button.iconSecondary,
  icon: uiClassTokens.button.icon,
  iconView: uiClassTokens.button.iconView,
  iconEdit: uiClassTokens.button.iconEdit,
  iconSecondary: uiClassTokens.button.iconSecondary,
  iconSuccess: uiClassTokens.button.iconSuccess,
  danger: uiClassTokens.button.danger,
  cashier: uiClassTokens.button.primary,
  outlineSuccess: uiClassTokens.button.successOutline,
  outlineWarning: uiClassTokens.button.warningOutline,
  outlineDanger: uiClassTokens.button.dangerOutline,
  iconDanger: uiClassTokens.button.iconDanger
};

const sizeMap = {
  sm: 'h-8 px-3 rounded-lg text-[13px] font-semibold gap-1.5',
  md: 'h-9 px-4 rounded-[10px] text-sm font-bold gap-2',
  lg: 'h-10 px-5 rounded-xl text-sm font-bold gap-2',
  table: 'h-8 px-2.5 rounded-lg text-[13px] font-semibold gap-1.5',
  icon: 'h-8 w-8 rounded-lg p-0'
};

export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
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
      {icon ? <span className="text-base" aria-hidden="true">{icon}</span> : null}
      {children}
    </button>
  );
}
