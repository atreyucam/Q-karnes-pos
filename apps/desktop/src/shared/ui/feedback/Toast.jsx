import clsx from 'clsx';
import { PiInfo, PiCheckCircle, PiWarningCircle, PiXCircle, PiX } from 'react-icons/pi';
import IconButton from '../primitives/IconButton';

const toneMap = {
  info: 'ui-toast-info',
  success: 'ui-toast-success',
  warning: 'ui-toast-warning',
  danger: 'ui-toast-danger'
};

const iconMap = {
  info: PiInfo,
  success: PiCheckCircle,
  warning: PiWarningCircle,
  danger: PiXCircle
};

export default function Toast({ tone = 'info', className, title, description, onClose, children }) {
  const Icon = iconMap[tone] || iconMap.info;
  const resolvedDescription = description ?? children;

  return (
    <div className={clsx('ui-toast', toneMap[tone] || toneMap.info, className)} role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="toast-title">{title}</p> : null}
        {resolvedDescription ? <p className="toast-description">{resolvedDescription}</p> : null}
      </div>
      {onClose ? (
        <IconButton variant="ghost" size="sm" className="toast-close" aria-label="Cerrar notificacion" onClick={onClose}>
          <PiX />
        </IconButton>
      ) : null}
    </div>
  );
}
