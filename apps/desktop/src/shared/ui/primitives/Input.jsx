import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export default function Input({ className, error = false, ...props }) {
  return (
    <input
      className={clsx(
        uiClassTokens.input.base,
        error ? uiClassTokens.input.error : uiClassTokens.input.normal,
        uiClassTokens.input.withoutIcon,
        className
      )}
      {...props}
    />
  );
}
