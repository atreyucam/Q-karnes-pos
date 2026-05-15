import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Modal,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../ui';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit, getUnidad, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';
import {
  baseToVisible,
  buildRefundPayload,
  buildRefundStatsMap,
  centsToMoney,
  computePartialAllocation,
  computeRemainingRefundBreakdown,
  moneyToCents,
  quantityToBase
} from './ventaUtils';
import useFormErrors from '../../shared/hooks/useFormErrors';

function parseQtyByUnit(value, unidad) {
  if (getUnidad(unidad) === 'UND') {
    const n = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }

  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseMoneyInput(value) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  return centsToMoney(moneyToCents(text));
}

function formatQuickMoney(cents) {
  return centsToMoney(cents).toFixed(2);
}

export default function DevolucionModal({
  open,
  onClose,
  ventaDetalle,
  devoluciones,
  turnoActual,
  submitting = false,
  error = '',
  onSubmit
}) {
  const [motivo, setMotivo] = useState('Cliente no conforme');
  const [observacion, setObservacion] = useState('');
  const [qtyByDetail, setQtyByDetail] = useState({});
  const [breakdown, setBreakdown] = useState({
    contado: '',
    transferencia: '',
    credito: ''
  });
  const [localError, setLocalError] = useState('');
  const formErrors = useFormErrors();

  useEffect(() => {
    if (!open) return;
    setMotivo('Cliente no conforme');
    setObservacion('');
    setQtyByDetail({});
    setBreakdown({ contado: '', transferencia: '', credito: '' });
    setLocalError('');
    formErrors.resetErrors();
  }, [open, ventaDetalle?.venta?.id]);

  const refundStatsMap = useMemo(
    () => buildRefundStatsMap(devoluciones?.detalle || []),
    [devoluciones?.detalle]
  );

  const remainingBreakdown = useMemo(
    () => computeRemainingRefundBreakdown(ventaDetalle?.resumen_pago, devoluciones?.devoluciones || []),
    [devoluciones?.devoluciones, ventaDetalle?.resumen_pago]
  );

  const lines = useMemo(
    () => (ventaDetalle?.detalle || []).map((detail) => {
      const unidad = getUnidad(detail.unidad_medida || detail.unidad);
      const refunded = refundStatsMap.get(Number(detail.id)) || {
        cantidad: 0,
        cantidad_base: 0,
        subtotal_centavos: 0
      };
      const soldBase = Number(detail.cantidad_base || 0);
      const availableBase = Math.max(0, soldBase - Number(refunded.cantidad_base || 0));
      const availableVisible = baseToVisible(availableBase, unidad);

      return {
        ...detail,
        unidad,
        refunded,
        soldBase,
        availableBase,
        availableVisible
      };
    }),
    [refundStatsMap, ventaDetalle?.detalle]
  );

  const lineDrafts = useMemo(
    () => lines.map((line) => {
      const rawValue = qtyByDetail[line.id] || '';
      if (!rawValue) {
        return {
          ...line,
          rawValue,
          requestedQty: 0,
          requestedBase: 0,
          previewCentavos: 0,
          error: ''
        };
      }

      const requestedQty = parseQtyByUnit(rawValue, line.unidad);
      const requestedBase = quantityToBase(rawValue, line.unidad);

      let lineError = '';
      if (!Number.isFinite(requestedQty) || requestedQty <= 0 || requestedBase <= 0) {
        lineError = 'Cantidad invalida';
      } else if (requestedBase > line.availableBase) {
        lineError = 'No puedes devolver más de la cantidad disponible.';
      }

      const previewCentavos = lineError
        ? 0
        : computePartialAllocation(
          line.total_neto_centavos,
          line.refunded.subtotal_centavos,
          line.soldBase,
          line.refunded.cantidad_base,
          requestedBase
        );

      return {
        ...line,
        rawValue,
        requestedQty,
        requestedBase,
        previewCentavos,
        error: lineError
      };
    }),
    [lines, qtyByDetail]
  );

  const selectedItems = useMemo(
    () => lineDrafts.filter((line) => line.requestedBase > 0),
    [lineDrafts]
  );

  const totalRefundCentavos = useMemo(
    () => selectedItems.reduce((acc, line) => acc + Number(line.previewCentavos || 0), 0),
    [selectedItems]
  );

  const breakdownCentavos = useMemo(() => ({
    contado_centavos: breakdown.contado === '' ? undefined : moneyToCents(breakdown.contado),
    transferencia_centavos: breakdown.transferencia === '' ? undefined : moneyToCents(breakdown.transferencia),
    credito_centavos: breakdown.credito === '' ? undefined : moneyToCents(breakdown.credito)
  }), [breakdown]);

  const hasExplicitBreakdown = useMemo(
    () => Object.values(breakdown).some((value) => String(value || '').trim() !== ''),
    [breakdown]
  );

  const explicitBreakdownTotal = useMemo(
    () => [breakdownCentavos.contado_centavos, breakdownCentavos.transferencia_centavos, breakdownCentavos.credito_centavos]
      .filter((value) => value !== undefined)
      .reduce((acc, value) => acc + Number(value || 0), 0),
    [breakdownCentavos]
  );

  const breakdownMismatch = hasExplicitBreakdown && explicitBreakdownTotal !== totalRefundCentavos;
  const hasInvalidLines = lineDrafts.some((line) => line.error);
  const manualDifferenceCentavos = totalRefundCentavos - explicitBreakdownTotal;
  const hasMethodLimitError = (
    (breakdownCentavos.contado_centavos !== undefined && breakdownCentavos.contado_centavos > remainingBreakdown.contado_centavos)
    || (breakdownCentavos.transferencia_centavos !== undefined && breakdownCentavos.transferencia_centavos > remainingBreakdown.transferencia_centavos)
    || (breakdownCentavos.credito_centavos !== undefined && breakdownCentavos.credito_centavos > remainingBreakdown.credito_centavos)
  );
  const disableSubmit = (
    submitting
    || !motivo.trim()
    || !selectedItems.length
    || hasInvalidLines
    || totalRefundCentavos <= 0
    || hasMethodLimitError
    || breakdownMismatch
    || ((breakdownCentavos.contado_centavos || 0) > 0 && !turnoActual?.id)
  );
  const submitDisabledReason = useMemo(() => {
    if (submitting) return 'Guardando devolución...';
    if (!motivo.trim()) return 'Debe seleccionar o ingresar un motivo.';
    if (!selectedItems.length) return 'Ingrese una cantidad a devolver.';
    if (hasInvalidLines) return 'La cantidad supera lo disponible.';
    if (totalRefundCentavos <= 0) return 'No hay cantidades seleccionadas para devolver.';
    if (hasMethodLimitError) return 'Uno de los montos supera el disponible reversible.';
    if (breakdownMismatch) return 'El desglose manual no coincide con el total de devolución.';
    if ((breakdownCentavos.contado_centavos || 0) > 0 && !turnoActual?.id) return 'Se requiere caja abierta para devolver efectivo.';
    return '';
  }, [
    breakdownCentavos.contado_centavos,
    breakdownMismatch,
    hasInvalidLines,
    hasMethodLimitError,
    motivo,
    selectedItems.length,
    submitting,
    totalRefundCentavos,
    turnoActual?.id
  ]);

  const applySingleBreakdown = (field) => {
    if (totalRefundCentavos <= 0) return;

    const availableByField = {
      contado: remainingBreakdown.contado_centavos,
      transferencia: remainingBreakdown.transferencia_centavos,
      credito: remainingBreakdown.credito_centavos
    };

    if (totalRefundCentavos > Number(availableByField[field] || 0)) {
      setLocalError(`No hay saldo reversible suficiente en ${field} para cubrir esta devolucion.`);
      return;
    }

    setLocalError('');
    setBreakdown({
      contado: field === 'contado' ? formatQuickMoney(totalRefundCentavos) : '',
      transferencia: field === 'transferencia' ? formatQuickMoney(totalRefundCentavos) : '',
      credito: field === 'credito' ? formatQuickMoney(totalRefundCentavos) : ''
    });
  };

  const submit = async () => {
    setLocalError('');

    if (!motivo.trim()) {
      formErrors.setErrors({ motivo: 'Este campo es obligatorio.' });
      setLocalError('El motivo de la devolucion es obligatorio.');
      return;
    }
    formErrors.resetErrors();

    if (!selectedItems.length) {
      setLocalError('Ingresa al menos una cantidad para devolver.');
      return;
    }

    if (hasInvalidLines) {
      setLocalError('Corrige las cantidades de devolucion antes de continuar.');
      return;
    }

    if (totalRefundCentavos <= 0) {
      setLocalError('La devolucion debe generar un total mayor a cero.');
      return;
    }

    if (
      breakdownCentavos.contado_centavos !== undefined
      && breakdownCentavos.contado_centavos > remainingBreakdown.contado_centavos
    ) {
      setLocalError('El efectivo ingresado supera el saldo reversible disponible en caja.');
      return;
    }

    if (
      breakdownCentavos.transferencia_centavos !== undefined
      && breakdownCentavos.transferencia_centavos > remainingBreakdown.transferencia_centavos
    ) {
      setLocalError('La transferencia ingresada supera el saldo reversible disponible.');
      return;
    }

    if (
      breakdownCentavos.credito_centavos !== undefined
      && breakdownCentavos.credito_centavos > remainingBreakdown.credito_centavos
    ) {
      setLocalError('El credito ingresado supera el saldo reversible disponible.');
      return;
    }

    if (hasExplicitBreakdown && breakdownMismatch) {
      setLocalError('Efectivo + transferencia + credito debe coincidir con el total estimado de la devolucion.');
      return;
    }

    if ((breakdownCentavos.contado_centavos || 0) > 0 && !turnoActual?.id) {
      setLocalError('Se requiere caja abierta para devolver efectivo.');
      return;
    }

    const payload = buildRefundPayload({
      motivo,
      observacion,
      items: selectedItems.map((line) => ({
        venta_detalle_id: line.id,
        cantidad: line.requestedQty
      })),
      contado: parseMoneyInput(breakdown.contado),
      transferencia: parseMoneyInput(breakdown.transferencia),
      credito: parseMoneyInput(breakdown.credito)
    });

    await onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidthClass="sm:max-w-[min(1200px,calc(100vw-2rem))]"
      panelClassName="p-0 w-[calc(100vw-2rem)] sm:max-h-[calc(100vh-2rem)]"
    >
      <div className="max-h-[calc(100vh-2rem)] flex flex-1 flex-col overflow-hidden">
        <div className="ui-modal-header shrink-0 border-b border-[var(--color-border)] bg-[var(--color-background)] px-6 py-5">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              Devolucion venta #{ventaDetalle?.venta?.id || '-'}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              La devolucion usa el snapshot original de la venta. Puedes registrar un desglose manual o dejar que el backend lo distribuya automaticamente.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={onClose}>
            X
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {(localError || error) && (
              <Alert tone="error">
                {localError || error}
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Total venta</p>
                <p className="mt-2 text-lg font-bold text-[var(--color-text)]">{formatMoney(ventaDetalle?.venta?.total || 0)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Efectivo reversible</p>
                <p className="mt-2 text-lg font-bold text-[var(--color-text)]">{formatMoney(centsToMoney(remainingBreakdown.contado_centavos))}</p>
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Transferencia reversible</p>
                <p className="mt-2 text-lg font-bold text-[var(--color-text)]">{formatMoney(centsToMoney(remainingBreakdown.transferencia_centavos))}</p>
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Credito reversible</p>
                <p className="mt-2 text-lg font-bold text-[var(--color-text)]">{formatMoney(centsToMoney(remainingBreakdown.credito_centavos))}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
              <div className="space-y-3">
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--color-text)]">Lineas disponibles</p>
                      <p className="text-sm text-[var(--color-text-muted)]">Solo se permite devolver hasta la cantidad restante de cada linea.</p>
                    </div>
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-right sm:min-w-44">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Reembolso estimado</p>
                      <p className="mt-1 text-lg font-bold text-[var(--color-text)]">{formatMoney(centsToMoney(totalRefundCentavos))}</p>
                    </div>
                  </div>

                  <Tabla className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                    <TablaCabecera>
                      <tr>
                        <TablaCelda as="th" className="min-w-[260px]">Producto</TablaCelda>
                        <TablaCelda as="th" className="w-[90px]">Vendido</TablaCelda>
                        <TablaCelda as="th" className="w-[90px]">Devuelto</TablaCelda>
                        <TablaCelda as="th" className="w-[100px]">Disponible</TablaCelda>
                        <TablaCelda as="th" className="w-[120px] text-center">Cantidad</TablaCelda>
                        <TablaCelda as="th" className="w-[120px] text-right">Reembolso</TablaCelda>
                      </tr>
                    </TablaCabecera>
                    <TablaCuerpo>
                      {lines.map((line) => {
                        const draft = lineDrafts.find((item) => item.id === line.id);
                        const returnedVisible = baseToVisible(line.refunded.cantidad_base, line.unidad);
                        const isLineClosed = line.availableBase <= 0;

                        return (
                          <TablaFila key={line.id}>
                            <TablaCelda>
                              <div className="min-w-[240px]">
                                <p className="font-medium leading-relaxed text-[var(--color-text)]">{line.producto_nombre}</p>
                                <p className="text-xs text-[var(--color-text-muted)]">
                                  Unidad: {line.unidad} | Costo snapshot: {formatMoney(line.costo_unit_snapshot || 0)}
                                </p>
                              </div>
                            </TablaCelda>
                            <TablaCelda>{formatQtyByUnit(line.cantidad, line.unidad)}</TablaCelda>
                            <TablaCelda>{formatQtyByUnit(returnedVisible, line.unidad)}</TablaCelda>
                            <TablaCelda>{formatQtyByUnit(line.availableVisible, line.unidad)}</TablaCelda>
                            <TablaCelda className="text-center align-middle">
                              <Input
                                type="text"
                                inputMode={line.unidad === 'UND' ? 'numeric' : 'decimal'}
                                className="mx-auto h-10 w-24 text-center"
                                value={qtyByDetail[line.id] || ''}
                                disabled={isLineClosed}
                                placeholder={isLineClosed ? 'Agotado' : '0'}
                                onChange={(event) => {
                                  setQtyByDetail((current) => ({
                                    ...current,
                                    [line.id]: sanitizeQtyInput(event.target.value, line.unidad)
                                  }));
                                }}
                              />
                              {draft?.error ? (
                                <p className="mt-1 text-[11px] text-[var(--color-danger)]">{draft.error}</p>
                              ) : null}
                            </TablaCelda>
                            <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                              {formatMoney(centsToMoney(draft?.previewCentavos || 0))}
                            </TablaCelda>
                          </TablaFila>
                        );
                      })}
                    </TablaCuerpo>
                  </Tabla>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <p className="font-semibold text-[var(--color-text)]">Motivo y observación</p>

                  <div className="mt-3 space-y-3">
                    <Input
                      error={Boolean(formErrors.errors.motivo)}
                      value={motivo}
                      onChange={(event) => {
                        formErrors.clearFieldError('motivo');
                        setMotivo(event.target.value);
                      }}
                      placeholder="Motivo de la devolución"
                    />
                    {formErrors.errors.motivo ? <p className="text-sm text-[var(--color-danger)]">{formErrors.errors.motivo}</p> : null}
                    <Textarea
                      className="min-h-[96px]"
                      value={observacion}
                      onChange={(event) => setObservacion(event.target.value)}
                      placeholder="Observación operativa (opcional)"
                      rows={4}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--color-text)]">Desglose de devolución</p>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        Opcional. Si dejas los campos vacíos, el backend repartirá el reembolso según el saldo reversible de la venta.
                      </p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setBreakdown({ contado: '', transferencia: '', credito: '' })}>
                      Automático
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-sm font-medium text-[var(--color-text)]">Efectivo</label>
                        <span className="text-xs text-[var(--color-text-muted)]">Disponible: {formatMoney(centsToMoney(remainingBreakdown.contado_centavos))}</span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          disabled={remainingBreakdown.contado_centavos <= 0}
                          value={breakdown.contado}
                          onChange={(event) => setBreakdown((current) => ({
                            ...current,
                            contado: sanitizeDecimalInput(event.target.value, 2)
                          }))}
                          placeholder="0.00"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={totalRefundCentavos <= 0 || totalRefundCentavos > remainingBreakdown.contado_centavos}
                          onClick={() => applySingleBreakdown('contado')}
                        >
                          Todo
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-sm font-medium text-[var(--color-text)]">Transferencia</label>
                        <span className="text-xs text-[var(--color-text-muted)]">Disponible: {formatMoney(centsToMoney(remainingBreakdown.transferencia_centavos))}</span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          disabled={remainingBreakdown.transferencia_centavos <= 0}
                          value={breakdown.transferencia}
                          onChange={(event) => setBreakdown((current) => ({
                            ...current,
                            transferencia: sanitizeDecimalInput(event.target.value, 2)
                          }))}
                          placeholder="0.00"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={totalRefundCentavos <= 0 || totalRefundCentavos > remainingBreakdown.transferencia_centavos}
                          onClick={() => applySingleBreakdown('transferencia')}
                        >
                          Todo
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="text-sm font-medium text-[var(--color-text)]">Crédito</label>
                        <span className="text-xs text-[var(--color-text-muted)]">Disponible: {formatMoney(centsToMoney(remainingBreakdown.credito_centavos))}</span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          disabled={remainingBreakdown.credito_centavos <= 0}
                          value={breakdown.credito}
                          onChange={(event) => setBreakdown((current) => ({
                            ...current,
                            credito: sanitizeDecimalInput(event.target.value, 2)
                          }))}
                          placeholder="0.00"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={totalRefundCentavos <= 0 || totalRefundCentavos > remainingBreakdown.credito_centavos}
                          onClick={() => applySingleBreakdown('credito')}
                        >
                          Todo
                        </Button>
                      </div>
                    </div>
                  </div>
                  {!hasExplicitBreakdown ? (
                    <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                      El sistema distribuirá el reembolso según los saldos reversibles disponibles.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-[var(--color-border)] bg-white px-6 py-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-[var(--color-text-muted)]">
              Total devolución: <strong className="text-[var(--color-text)]">{formatMoney(centsToMoney(totalRefundCentavos))}</strong>
            </p>
            <p className="text-[var(--color-text-muted)]">
              Desglose manual: <strong className={breakdownMismatch ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}>
                {formatMoney(centsToMoney(explicitBreakdownTotal))}
              </strong>
            </p>
            {hasExplicitBreakdown ? (
              <p className={manualDifferenceCentavos === 0 ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-danger)]'}>
                {manualDifferenceCentavos === 0
                  ? 'Desglose completo'
                  : (manualDifferenceCentavos > 0
                    ? `Faltan ${formatMoney(centsToMoney(manualDifferenceCentavos))} por distribuir`
                    : `El desglose supera por ${formatMoney(centsToMoney(Math.abs(manualDifferenceCentavos)))}`)}
              </p>
            ) : null}
          </div>
          {disableSubmit && submitDisabledReason ? (
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">{submitDisabledReason}</p>
          ) : null}
          <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={disableSubmit}>
            {submitting ? 'Guardando...' : 'Registrar devolución'}
          </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
