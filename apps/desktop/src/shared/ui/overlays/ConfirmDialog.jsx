import Button from '../primitives/Button';
import Modal from './Modal';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmar accion',
  description = 'Esta accion no se puede deshacer.',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'danger'
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-lg" panelClassName="p-5">
      <div className="space-y-4">
        <div>
          <h3 className="ui-panel-title">{title}</h3>
          <p className="ui-panel-description">{description}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
