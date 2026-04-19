import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

export default function Textarea({ className, error = false, ...props }) {
  return (
    <textarea
      className={clsx(
        uiClassTokens.input.base,
        error ? uiClassTokens.input.error : uiClassTokens.input.normal,
        uiClassTokens.input.withoutIcon,
        'min-h-24 resize-y py-3',
        className
      )}
      {...props}
    />
  );
}
