import Button from '../primitives/Button';
import Modal from './Modal';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmar acción',
  description = 'Esta acción no se puede deshacer.',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'danger',
  confirmDisabled = false,
  confirmLoading = false,
  cancelDisabled = false,
  children
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-lg" panelClassName="p-5">
      <div className="space-y-4">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="ui-panel-title">{title}</h3>
            {description ? <p className="ui-panel-description">{description}</p> : null}
          </div>
        </div>
        {children ? <div className="space-y-3">{children}</div> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={cancelDisabled || confirmLoading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={confirmDisabled || confirmLoading || cancelDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
