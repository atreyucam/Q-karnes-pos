import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export default function Select({ className, children, error = false, ...props }) {
  return (
    <select
      className={clsx(
        uiClassTokens.select.base,
        error ? uiClassTokens.select.error : uiClassTokens.select.normal,
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
