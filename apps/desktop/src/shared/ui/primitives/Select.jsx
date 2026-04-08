import clsx from 'clsx';
import { uiClassTokens } from '../../tokens/uiClassTokens';

const selectArrowStyle = {
  backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 20 20\' fill=\'none\' stroke=\'%236B7280\' stroke-width=\'1.8\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m5 7 5 5 5-5\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.9rem center',
  backgroundSize: '0.95rem'
};

export default function Select({ className, children, error = false, style, ...props }) {
  return (
    <select
      className={clsx(
        uiClassTokens.select.base,
        error ? uiClassTokens.select.error : uiClassTokens.select.normal,
        className
      )}
      style={{ ...selectArrowStyle, ...style }}
      {...props}
    >
      {children}
    </select>
  );
}
