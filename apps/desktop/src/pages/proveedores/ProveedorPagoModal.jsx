import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea
} from '../../ui';
import { formatMoney } from '../../lib/formatMoney';
import useFormErrors from '../../shared/hooks/useFormErrors';

const PAYMENT_METHOD_LABELS = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia'
};

const emptyForm = {
  monto: '',
  metodo_pago: 'EFECTIVO',
  banco: '',
  referencia: '',
  observacion: ''
};

export default function ProveedorPagoModal({
  open,
  onClose,
  onSubmit,
  proveedor,
  factura,
  configuracion,
  turnoActual,
  loading = false
}) {
  const [form, setForm] = useState(emptyForm);
  const [localError, setLocalError] = useState('');
  const formErrors = useFormErrors();

  const pendiente = useMemo(() => Number(factura?.pendiente || 0), [factura?.pendiente]);
  const saldoPosterior = useMemo(() => {
    const monto = Number(form.monto || 0);
    return Math.max(0, pendiente - (Number.isFinite(monto) ? monto : 0));
  }, [form.monto, pendiente]);

  useEffect(() => {
    if (!open) return;
    setForm({
      monto: pendiente > 0 ? String(Number(pendiente).toFixed(2)) : '',
      metodo_pago: 'EFECTIVO',
      banco: '',
      referencia: '',
      observacion: ''
    });
    setLocalError('');
    formErrors.resetErrors();
  }, [open, factura?.id, pendiente]);

  const handleSubmit = async () => {
    if (!factura?.id) return;

    const nextErrors = {};
    const monto = Number(form.monto || 0);
    const metodoPago = String(form.metodo_pago || '').toUpperCase();

    if (!String(form.monto || '').trim()) nextErrors.monto = 'Este campo es obligatorio.';
    else if (!(monto > 0)) nextErrors.monto = 'Ingresa un valor válido.';
    else if (monto > pendiente) nextErrors.monto = 'El pago no puede superar el pendiente de la factura.';

    if (metodoPago === 'TRANSFERENCIA' && !String(form.banco || '').trim()) {
      nextErrors.banco = 'Selecciona el banco de la transferencia.';
    }

    if (
      metodoPago === 'EFECTIVO'
      && configuracion?.exigir_caja_abierta_para_pagos
      && !turnoActual?.id
    ) {
      nextErrors.metodo_pago = 'Para registrar pagos en efectivo debes abrir caja.';
    }

    setLocalError('');
    if (!formErrors.setErrors(nextErrors)) return;

    try {
      await onSubmit({
        factura_id: factura.id,
        monto,
        metodo_pago: metodoPago,
        banco: metodoPago === 'TRANSFERENCIA' ? String(form.banco || '').trim() || undefined : undefined,
        referencia: metodoPago === 'TRANSFERENCIA' ? String(form.referencia || '').trim() || undefined : undefined,
        observacion: String(form.observacion || '').trim() || undefined
      });
    } catch (error) {
      setLocalError(error?.message || 'No se pudo registrar el pago.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-3xl" panelClassName="p-5">
      <div className="ui-modal-header">
        <div className="ui-modal-header-copy">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Registrar pago</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Registra un pago parcial o total de la factura pendiente.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={onClose}>
          X
        </Button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Proveedor</p>
          <p className="text-lg font-semibold text-[var(--color-text)]">{proveedor?.nombre || '-'}</p>
          <p className="text-sm text-[var(--color-text-muted)]">Factura: {factura?.numero_factura || factura?.numero_documento || '-'}</p>
          <p className="text-sm font-semibold text-[var(--color-text)]">Pendiente: {formatMoney(pendiente)}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Documento</p>
          <div className="inline-flex rounded-full border border-[#F5D08A] bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#9A6700]">
            {`${factura?.numero_factura || factura?.numero_documento || `Factura #${factura?.id || ''}`} • Pendiente ${formatMoney(pendiente)}`}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            {configuracion?.exigir_caja_abierta_para_pagos
              ? 'El pago en efectivo requiere turno abierto. Transferencia no impacta caja física.'
              : 'Efectivo impacta caja si hay turno abierto. Transferencia no impacta caja física.'}
          </p>
        </div>
      </div>

      {localError ? <Alert tone="error" className="mt-3">{localError}</Alert> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Monto a pagar" required error={formErrors.errors.monto}>
          <Input
            className="h-11 text-base font-semibold"
            placeholder="0.00"
            value={form.monto}
            onChange={(e) => {
              formErrors.clearFieldError('monto');
              setForm((state) => ({ ...state, monto: e.target.value }));
            }}
          />
        </Field>

        <Field label="Saldo después del pago">
          {(() => {
            const pagada = saldoPosterior <= 0;
            return (
              <div
                className={`min-h-[52px] rounded-lg border px-3 py-2 ${pagada
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text)]'}`}
              >
                {pagada ? (
                  <div className="flex h-full min-h-[36px] flex-col justify-center">
                    <p className="text-sm font-semibold">Pagada completamente</p>
                    <p className="mt-0.5 text-sm font-bold">{formatMoney(0)}</p>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[36px] items-center">
                    <p className="text-base font-semibold">{formatMoney(saldoPosterior)}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </Field>

        <Field label="Método de pago" required error={formErrors.errors.metodo_pago}>
          <Select
            value={form.metodo_pago}
            onChange={(e) => {
              formErrors.clearFieldError('metodo_pago');
              setForm((state) => ({ ...state, metodo_pago: e.target.value }));
            }}
          >
            {['EFECTIVO', 'TRANSFERENCIA'].map((code) => (
              <option key={code} value={code}>{PAYMENT_METHOD_LABELS[code] || code}</option>
            ))}
          </Select>
        </Field>

        {String(form.metodo_pago).toUpperCase() === 'TRANSFERENCIA' ? (
          <>
            <Field label="Banco" required error={formErrors.errors.banco}>
              <Input
                value={form.banco}
                onChange={(e) => {
                  formErrors.clearFieldError('banco');
                  setForm((state) => ({ ...state, banco: e.target.value }));
                }}
                placeholder="Banco Pichincha"
              />
            </Field>
            <Field label="Referencia">
              <Input
                value={form.referencia}
                onChange={(e) => setForm((state) => ({ ...state, referencia: e.target.value }))}
                placeholder="847291"
              />
            </Field>
          </>
        ) : null}
      </div>

      <div className="mt-3">
        <Field label="Observación">
          <Textarea
            rows={3}
            className="min-h-[84px]"
            placeholder="Observación opcional"
            value={form.observacion}
            onChange={(e) => setForm((state) => ({ ...state, observacion: e.target.value }))}
          />
        </Field>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          className="border border-[var(--color-text)] bg-[var(--color-text)] text-white hover:border-black hover:bg-black"
          onClick={handleSubmit}
          disabled={loading || pendiente <= 0}
        >
          Registrar pago
        </Button>
      </div>
    </Modal>
  );
}
