import Button from '../primitives/Button';
import Modal from './Modal';

export default function DeactivateEntityDialogs({
  confirmOpen,
  entityType = 'registro',
  entityName = '—',
  pendingAmountLabel = '—',
  onCloseConfirm,
  onConfirm,
  confirmLoading = false,
  blockedOpen,
  blockedMessage = 'El registro mantiene saldo pendiente.',
  onCloseBlocked
}) {
  const normalizedType = String(entityType || 'registro').trim().toLowerCase();
  const entityTypeUpper = normalizedType.toUpperCase();
  const confirmLabel = confirmLoading ? 'Desactivando...' : `Desactivar ${normalizedType}`;

  return (
    <>
      <Modal open={confirmOpen} onClose={onCloseConfirm} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-3.5">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Confirmar desactivación</h3>
            </div>
            <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={onCloseConfirm}>
              X
            </Button>
          </div>

          <p className="text-sm text-[var(--color-text-muted)]">
            {`El ${normalizedType} pasará a estado Inactivo y dejará de aparecer en operaciones activas del sistema.`}
          </p>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{entityTypeUpper}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{entityName || '—'}</p>
          </div>

          <p className="text-sm font-medium text-[var(--color-text)]">¿Deseas continuar?</p>

          <div className="flex flex-wrap justify-end gap-2 pt-0.5">
            <Button
              type="button"
              variant="neutral"
              className="border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              onClick={onCloseConfirm}
              disabled={confirmLoading}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              className="!border-[var(--color-danger)] !bg-[var(--color-danger)] !text-white hover:!bg-[color-mix(in_oklab,var(--color-danger)_85%,black_15%)] hover:!text-white focus:!text-white active:!text-white"
              onClick={onConfirm}
              disabled={confirmLoading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={blockedOpen} onClose={onCloseBlocked} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-3.5">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="text-base font-semibold text-[var(--color-text)]">No se puede desactivar</h3>
              <p className="ui-panel-description">{blockedMessage}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={onCloseBlocked}>
              X
            </Button>
          </div>

          <div className="rounded-xl border border-[color-mix(in_oklab,var(--color-danger)_20%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-soft)_55%,white_45%)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Saldo pendiente</p>
            <p className="mt-1 text-lg font-bold text-[var(--color-danger)]">{pendingAmountLabel}</p>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="neutral"
              className="border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              onClick={onCloseBlocked}
            >
              Entendido
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
