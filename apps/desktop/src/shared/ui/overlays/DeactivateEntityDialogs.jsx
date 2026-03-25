import Button from '../primitives/Button';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';

export default function DeactivateEntityDialogs({
  confirmOpen,
  entityLabel = 'este registro',
  onCloseConfirm,
  onConfirm,
  confirmLoading = false,
  blockedOpen,
  blockedMessage,
  onCloseBlocked
}) {
  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        onClose={onCloseConfirm}
        onConfirm={onConfirm}
        title="Confirmar desactivacion"
        description={`Vas a desactivar ${entityLabel}. Si el registro sigue en uso, el sistema puede bloquear esta accion.`}
        confirmLabel={confirmLoading ? 'Desactivando...' : 'Si, desactivar'}
        cancelLabel="Cancelar"
        confirmVariant="danger"
      />

      <Modal open={blockedOpen} onClose={onCloseBlocked} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div>
            <h3 className="ui-panel-title">No se pudo desactivar</h3>
            <p className="ui-panel-description">
              {blockedMessage || 'El sistema bloqueo la desactivacion de este registro.'}
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onCloseBlocked}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
