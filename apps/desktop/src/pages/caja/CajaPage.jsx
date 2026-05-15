import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PiArrowsLeftRightBold,
  PiCashRegister,
  PiChartBarBold,
  PiCreditCardBold,
  PiEye,
  PiLockKeyOpenBold,
  PiReceipt,
  PiWallet
} from 'react-icons/pi';
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Panel,
  PanelHeader,
  PanelSection,
  StatusBadge,
  Switch,
  Table,
  TableActionButton,
  TableActions,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Textarea
} from '../../shared/ui';
import { useCajaStore } from '../../stores/cajaStore';
import { useAuthStore } from '../../stores/authStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { sanitizeDecimalInput } from '../../lib/formatQty';
import useFormErrors from '../../shared/hooks/useFormErrors';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';

const MAX_CASH_OPERATION_AMOUNT = 5000;

const timeFormatter = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function formatTimeQuito(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return timeFormatter.format(date);
}

function formatMovementType(tipo) {
  const map = {
    VENTA_CONTADO: 'Venta contado',
    VENTA_TRANSFERENCIA: 'Venta transferencia',
    VENTA_CREDITO: 'Venta crédito',
    INGRESO_MANUAL: 'Ingreso manual',
    EGRESO_MANUAL: 'Egreso manual',
    ABONO_CLIENTE: 'Abono cliente',
    PAGO_PROVEEDOR: 'Pago proveedor',
    COMPRA_CONTADO: 'Compra contado',
    DEVOLUCION_EFECTIVO: 'Devolución efectivo',
    ANULACION_VENTA_EFECTIVO: 'Anulación efectivo',
    REVERSO_ABONO_CLIENTE: 'Reverso abono',
    REVERSO_PAGO_PROVEEDOR: 'Reverso pago'
  };
  return map[tipo] || tipo || '-';
}

function formatPaymentMethod(metodo) {
  const map = {
    EFECTIVO: 'Efectivo',
    TRANSFERENCIA: 'Transferencia',
    CREDITO_CLIENTE: 'Crédito'
  };
  return map[metodo] || metodo || '-';
}

function resolveMovementSense(movimiento) {
  const tipo = String(movimiento?.tipo || '').toUpperCase();
  if (tipo === 'VENTA_TRANSFERENCIA' || tipo === 'VENTA_CREDITO') {
    return { tone: 'default', label: 'Informativo' };
  }

  if (String(movimiento?.sentido || '').toUpperCase() === 'EGRESO') {
    return { tone: 'danger', label: 'Egreso' };
  }

  return { tone: 'success', label: 'Ingreso' };
}

function extractVentaIdFromText(...candidates) {
  for (const candidate of candidates) {
    const text = String(candidate || '');
    const ventaTag = text.match(/VENTA:(\d{1,10})/i);
    if (ventaTag) return Number(ventaTag[1]);

    const ventaRef = text.match(/venta\s*#?\s*(\d{1,10})/i);
    if (ventaRef) return Number(ventaRef[1]);
  }

  return null;
}

function resolveMovementReference(movimiento) {
  const tipo = String(movimiento?.tipo || '').toUpperCase();
  const originId = Number(movimiento?.origen_id || 0);
  const fallbackId = Number(movimiento?.id || 0);
  const ventaId = extractVentaIdFromText(
    movimiento?.documento_origen,
    movimiento?.concepto,
    movimiento?.referencia,
    movimiento?.observacion
  );

  if (['VENTA_CONTADO', 'VENTA_TRANSFERENCIA', 'VENTA_CREDITO', 'ANULACION_VENTA_EFECTIVO', 'DEVOLUCION_EFECTIVO'].includes(tipo)) {
    const id = originId > 0 ? originId : ventaId;
    return id ? `Venta #${id}` : 'Venta';
  }

  if (tipo === 'INGRESO_MANUAL') {
    return fallbackId > 0 ? `Ingreso #${fallbackId}` : 'Ingreso';
  }

  if (tipo === 'EGRESO_MANUAL') {
    return fallbackId > 0 ? `Egreso #${fallbackId}` : 'Egreso';
  }

  if (tipo === 'ABONO_CLIENTE' || tipo === 'REVERSO_ABONO_CLIENTE') {
    const id = originId > 0 ? originId : fallbackId;
    return id ? `Abono #${id}` : 'Abono';
  }

  if (tipo === 'PAGO_PROVEEDOR' || tipo === 'REVERSO_PAGO_PROVEEDOR') {
    const id = originId > 0 ? originId : fallbackId;
    return id ? `Pago #${id}` : 'Pago';
  }

  if (tipo === 'COMPRA_CONTADO') {
    const id = originId > 0 ? originId : fallbackId;
    return id ? `Compra #${id}` : 'Compra';
  }

  return fallbackId > 0 ? `Movimiento #${fallbackId}` : '-';
}

function getCloseStatusMeta(difference) {
  if (difference === 0) {
    return {
      tone: 'success',
      label: 'Cuadrado',
      message: 'El conteo coincide con el efectivo esperado del turno.',
      badgeLabel: 'Cierre cuadrado'
    };
  }

  if (difference < 0) {
    return {
      tone: 'danger',
      label: 'Faltante',
      message: 'Se detectó una diferencia negativa en caja. Revisa conteo, egresos pendientes y registra observación.',
      badgeLabel: 'Cierre con faltante'
    };
  }

  return {
    tone: 'warning',
    label: 'Sobrante',
    message: 'Se detectó efectivo adicional. Confirma el conteo y deja trazabilidad del motivo antes de cerrar.',
    badgeLabel: 'Cierre con sobrante'
  };
}

function getPendingCloseStatusMeta() {
  return {
    tone: 'default',
    label: 'Pendiente',
    message: 'Ingresa el efectivo contado para validar el estado del cierre.',
    badgeLabel: 'Cierre pendiente'
  };
}

function sanitizeCashAmountInput(value) {
  return sanitizeDecimalInput(value, 2);
}

function ResultRow({ label, value, tone = 'default' }) {
  const toneClass = tone === 'danger'
    ? 'text-[var(--color-danger)]'
    : tone === 'warning'
      ? 'text-[var(--color-warning-text)]'
      : tone === 'success'
        ? 'text-[var(--color-success-text)]'
        : 'text-[var(--color-text)]';

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className={`text-sm font-semibold ${toneClass}`}>{value}</span>
    </div>
  );
}

function StatTile({ icon, label, value, hint, accentClass }) {
  return (
    <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${accentClass}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</p>
          <p className="mt-2 text-[1.6rem] font-bold leading-none text-[var(--color-text)]">{value}</p>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function ManualMovementModal({
  open,
  onClose,
  type,
  form,
  errors,
  numericWarning,
  loading,
  onChange,
  onSubmit
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-md" panelClassName="p-5">
      <div className="space-y-4">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="ui-panel-title">
              {type === 'EGRESO' ? 'Registrar egreso manual' : 'Registrar ingreso manual'}
            </h3>
            <p className="ui-panel-description">Ingresa concepto y monto para afectar el turno actual.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={onClose}>
            X
          </Button>
        </div>

        <div className="space-y-3">
          <div>
            <Input
              error={Boolean(errors.concepto)}
              placeholder="Concepto"
              value={form.concepto}
              onChange={(event) => onChange('concepto', event.target.value)}
            />
            {errors.concepto ? <p className="mt-2 text-sm text-[var(--color-danger)]">{errors.concepto}</p> : null}
          </div>

          <div>
            <Input
              inputMode="decimal"
              min="0"
              max={MAX_CASH_OPERATION_AMOUNT}
              error={Boolean(errors.monto)}
              placeholder="Monto"
              value={form.monto}
              onChange={(event) => onChange('monto', sanitizeCashAmountInput(event.target.value))}
            />
            {errors.monto ? <p className="mt-2 text-sm text-[var(--color-danger)]">{errors.monto}</p> : null}
            {!errors.monto && numericWarning ? <p className="mt-2 text-sm text-[var(--color-danger)]">{numericWarning}</p> : null}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" variant={type === 'EGRESO' ? 'danger' : 'primary'} onClick={onSubmit} disabled={loading}>
            Guardar movimiento
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CashClosingModal({
  open,
  onClose,
  onPrint,
  onConfirm,
  turnoActual,
  user,
  summary,
  form,
  auth,
  errors,
  errorMessage,
  loading,
  onFormChange,
  onAuthChange
}) {
  const [step, setStep] = useState(1);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const efectivoEsperado = Number(summary?.efectivo_esperado || 0);
  const closeSummary = summary?.resumen_cierre || {
    apertura: Number(summary?.resumen_caja?.saldo_inicial || turnoActual?.fondo_inicial || 0),
    efectivo_esperado: efectivoEsperado,
    transferencias: Number(summary?.resumen_ventas?.transferencia || 0),
    credito: Number(summary?.resumen_ventas?.credito || 0),
    total_vendido: Number(summary?.resumen_ventas?.total_ventas || 0),
    total_cobrado: round2(
      Number(summary?.resumen_ventas?.efectivo || 0)
      + Number(summary?.resumen_ventas?.transferencia || 0)
      + Number(summary?.cobranzas_clientes || 0)
    ),
    ingresos: Number(summary?.resumen_caja?.ingresos_efectivo || 0),
    egresos: Number(summary?.resumen_caja?.egresos_efectivo || 0),
    ventas_efectivo: Number(summary?.resumen_ventas?.efectivo || 0),
    cobros_credito_efectivo: Number(summary?.cobranzas_clientes || 0),
    ingresos_manuales: Number(summary?.ingresos_manuales || 0),
    egresos_manuales: Number(summary?.egresos_manuales || 0)
  };
  const contado = Number(form.efectivo_contado || 0);
  const diferencia = round2(contado - efectivoEsperado);
  const hasCountedCash = String(form.efectivo_contado || '').trim() !== '';
  const hasDifference = hasCountedCash && Math.abs(diferencia) > 0.009;
  const statusMeta = hasCountedCash ? getCloseStatusMeta(hasDifference ? diferencia : 0) : getPendingCloseStatusMeta();
  const turnoLabel = turnoActual?.id ? `Turno #${turnoActual.id}` : 'Sin turno';

  useEffect(() => {
    if (!open) {
      setStep(1);
      setAuthModalOpen(false);
    }
  }, [open]);

  const handleContinue = async () => {
    try {
      const canContinue = await onConfirm({ mode: 'step1' });
      if (canContinue) setStep(2);
    } catch (_) {
      // parent keeps error state
    }
  };

  const handleConfirm = async () => {
    if (hasDifference) {
      setAuthModalOpen(true);
      return;
    }

    try {
      await onConfirm({ mode: 'final' });
    } catch (_) {
      // parent keeps error state
    }
  };

  const handleAuthorize = async () => {
    try {
      const success = await onConfirm({
        mode: 'authorize',
        authorization: {
          usuario: auth.usuario,
          password: auth.password
        }
      });

      if (success) setAuthModalOpen(false);
    } catch (_) {
      // parent keeps error state
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} maxWidthClass="max-w-xl" panelClassName="max-h-[90vh] p-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="ui-panel-title">{step === 1 ? 'Cerrar caja' : 'Confirmar cierre'}</h3>
                  <StatusBadge tone={step === 1 ? 'default' : statusMeta.tone}>
                    {step === 1 ? 'Paso 1 de 2' : 'Paso 2 de 2'}
                  </StatusBadge>
                </div>
                <p className="ui-panel-description">
                  {turnoLabel} · {turnoActual?.usuario_nombre || user?.nombre || 'Usuario no identificado'}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain shrink-0" onClick={onClose}>
                X
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="space-y-4 pb-1">
              {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}

              {step === 1 ? (
                <>
                  <div className="rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                    <p className="text-sm font-semibold text-[var(--color-text)]">Resumen del turno</p>
                    <div className="mt-3 space-y-3">
                      <ResultRow label="Apertura de caja" value={formatMoney(closeSummary.apertura)} />
                      <ResultRow label="Ventas efectivo" value={formatMoney(closeSummary.ventas_efectivo)} />
                      <ResultRow label="Cobros crédito efectivo" value={formatMoney(closeSummary.cobros_credito_efectivo)} />
                      <ResultRow label="Ingresos manuales" value={formatMoney(closeSummary.ingresos_manuales)} />
                      <ResultRow label="Egresos manuales" value={formatMoney(closeSummary.egresos_manuales)} />
                      <ResultRow label="Ingresos efectivo" value={formatMoney(closeSummary.ingresos)} />
                      <ResultRow label="Egresos efectivo" value={formatMoney(closeSummary.egresos)} />
                      <ResultRow label="Transferencias" value={formatMoney(closeSummary.transferencias)} />
                      <ResultRow label="Crédito" value={formatMoney(closeSummary.credito)} />
                      <ResultRow label="Total vendido" value={formatMoney(closeSummary.total_vendido)} />
                      <ResultRow label="Total cobrado" value={formatMoney(closeSummary.total_cobrado)} />
                      <ResultRow label="Efectivo esperado" value={formatMoney(efectivoEsperado)} tone="success" />
                    </div>
                  </div>

                  <div className={`rounded-[1.1rem] border p-4 ${
                    hasDifference
                      ? statusMeta.tone === 'danger'
                        ? 'border-[var(--color-danger)]/35 bg-[var(--color-danger-soft)]'
                        : 'border-[var(--color-warning)]/35 bg-[var(--color-warning-soft)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--color-text)]">Conteo físico</p>
                      <StatusBadge tone={statusMeta.tone}>
                        {statusMeta.badgeLabel}
                      </StatusBadge>
                    </div>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Efectivo contado</label>
                        <Input
                          inputMode="decimal"
                          min="0"
                          max={MAX_CASH_OPERATION_AMOUNT}
                          error={Boolean(errors.efectivo_contado)}
                          placeholder="$0.00"
                          value={form.efectivo_contado}
                          onChange={(event) => onFormChange('efectivo_contado', sanitizeCashAmountInput(event.target.value))}
                        />
                        {errors.efectivo_contado ? <p className="mt-2 text-sm text-[var(--color-danger)]">{errors.efectivo_contado}</p> : null}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Observación {hasDifference ? '(obligatoria)' : '(opcional)'}</label>
                        <Textarea
                          rows={3}
                          placeholder={hasDifference ? 'Describe el motivo de la diferencia detectada.' : 'Notas del cierre.'}
                          value={form.observacion}
                          onChange={(event) => onFormChange('observacion', event.target.value)}
                        />
                        {errors.observacion ? <p className="mt-2 text-sm text-[var(--color-danger)]">{errors.observacion}</p> : null}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className={`rounded-[1.1rem] border p-4 ${
                  statusMeta.tone === 'danger'
                    ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]'
                    : statusMeta.tone === 'warning'
                      ? 'border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)]'
                      : 'border-[var(--color-success)]/20 bg-[var(--color-success-soft)]'
                }`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={statusMeta.tone}>{statusMeta.badgeLabel}</StatusBadge>
                  </div>
                  <div className="mt-4 space-y-3">
                    <ResultRow label="Esperado" value={formatMoney(efectivoEsperado)} />
                    <ResultRow label="Contado" value={formatMoney(contado)} />
                    <ResultRow label="Diferencia" value={formatMoney(diferencia)} tone={statusMeta.tone} />
                  </div>
                  <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                    {hasDifference ? 'Se detectó una diferencia en caja.' : 'Sin diferencias detectadas.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 sm:px-6">
            {step === 1 ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button type="button" variant="secondary" onClick={onPrint} disabled={loading}>
                  Imprimir corte X
                </Button>
                <Button type="button" onClick={handleContinue} disabled={loading}>
                  Continuar
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button type="button" variant={hasDifference ? 'danger' : 'primary'} onClick={handleConfirm} disabled={loading}>
                  {hasDifference ? 'Confirmar cierre con diferencia' : 'Confirmar cierre'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={authModalOpen} onClose={() => setAuthModalOpen(false)} maxWidthClass="max-w-md" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">Autorización administrativa</h3>
              <p className="ui-panel-description">Se requiere autorización para cerrar caja con diferencia.</p>
            </div>
          </div>

          {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}

          <div className="space-y-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Usuario admin</label>
              <Input
                error={Boolean(errors.usuario)}
                placeholder="Usuario admin"
                value={auth.usuario}
                onChange={(event) => onAuthChange('usuario', event.target.value)}
              />
              {errors.usuario ? <p className="mt-2 text-sm text-[var(--color-danger)]">{errors.usuario}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Clave admin</label>
              <Input
                type="password"
                error={Boolean(errors.password)}
                placeholder="Clave admin"
                value={auth.password}
                onChange={(event) => onAuthChange('password', event.target.value)}
              />
              {errors.password ? <p className="mt-2 text-sm text-[var(--color-danger)]">{errors.password}</p> : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAuthModalOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" onClick={handleAuthorize} disabled={loading}>
              Autorizar cierre
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default function CajaPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const {
    turnoActual,
    resumen,
    movimientos,
    loading,
    error,
    fetchTurnoActual,
    abrirTurno,
    corteX,
    movimientoManual,
    corteZ,
    cargarMovimientosTurno
  } = useCajaStore();

  const [fondo, setFondo] = useState('100.00');
  const [manualModal, setManualModal] = useState(null);
  const [manualForm, setManualForm] = useState({ concepto: '', monto: '' });
  const [manualNumericWarning, setManualNumericWarning] = useState('');
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeForm, setCloseForm] = useState({ efectivo_contado: '', observacion: '' });
  const [closeAuth, setCloseAuth] = useState({ usuario: '', password: '' });
  const [movimientoDetalle, setMovimientoDetalle] = useState(null);
  const [movementFilter, setMovementFilter] = useState('TODOS');
  const [showOnlyBalanceImpact, setShowOnlyBalanceImpact] = useState(false);
  const [movimientosPage, setMovimientosPage] = useState(1);
  const aperturaErrors = useFormErrors();
  const manualFormErrors = useFormErrors();
  const cierreFormErrors = useFormErrors();
  const pageSize = GLOBAL_PAGE_SIZE;

  const resolveVentaId = (movimiento) => {
    const tipo = String(movimiento?.tipo || '').toUpperCase();
    const modulo = String(movimiento?.modulo_origen || '').toUpperCase();
    const directId = Number(movimiento?.origen_id || 0);
    const isVentaMovement = modulo.includes('VENTAS')
      || ['VENTA_CONTADO', 'VENTA_TRANSFERENCIA', 'VENTA_CREDITO', 'DEVOLUCION_EFECTIVO', 'ANULACION_VENTA_EFECTIVO'].includes(tipo);

    if (!isVentaMovement) return null;
    if (directId > 0 && tipo !== 'DEVOLUCION_EFECTIVO') return directId;

    return extractVentaIdFromText(
      movimiento?.documento_origen,
      movimiento?.concepto,
      movimiento?.referencia,
      movimiento?.observacion
    );
  };

  const resolveCompraOrdenId = (movimiento) => {
    const tipo = String(movimiento?.tipo || '').toUpperCase();
    const modulo = String(movimiento?.modulo_origen || '').toUpperCase();
    const isCompraMovement = ['COMPRA_CONTADO', 'PAGO_PROVEEDOR', 'REVERSO_PAGO_PROVEEDOR'].includes(tipo)
      || modulo.includes('COMPRA')
      || modulo.includes('PROVEEDOR');

    if (!isCompraMovement) return null;

    const directId = Number(
      movimiento?.orden_compra_id
      || movimiento?.compra_id
      || movimiento?.documento_id
      || movimiento?.origen_id
      || 0
    );
    if (Number.isFinite(directId) && directId > 0) return directId;

    const textCandidates = [
      movimiento?.documento_origen,
      movimiento?.referencia,
      movimiento?.concepto,
      movimiento?.observacion
    ];

    for (const candidate of textCandidates) {
      const match = String(candidate || '').match(/#?\s*(\d{1,10})/);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    }

    return null;
  };

  const onViewMovimiento = (movimiento) => {
    const ventaId = resolveVentaId(movimiento);
    if (ventaId) {
      navigate(`/ventas/${ventaId}`);
      return;
    }

    const compraOrdenId = resolveCompraOrdenId(movimiento);
    if (compraOrdenId) {
      navigate(`/compras/ordenes/${compraOrdenId}?readonly=1`);
      return;
    }

    setMovimientoDetalle(movimiento);
  };

  const refreshTurnoData = async (filterValue = movementFilter) => {
    try {
      const turno = await fetchTurnoActual({ silent: true });
      if (!turno?.id) return;
      await Promise.all([
        corteX(),
        cargarMovimientosTurno(turno.id, { limit: 500, offset: 0, filter: filterValue })
      ]);
    } catch (_) {
      // store handles error state
    }
  };

  useEffect(() => {
    void refreshTurnoData(movementFilter);
  }, [movementFilter]);

  useEffect(() => {
    setMovimientosPage(1);
  }, [movementFilter, showOnlyBalanceImpact, movimientos.length]);

  useEffect(() => {
    if (!turnoActual?.id) return undefined;

    const interval = setInterval(() => {
      void refreshTurnoData(movementFilter);
    }, 4000);

    return () => clearInterval(interval);
  }, [turnoActual?.id, movementFilter]);

  const resumenCaja = resumen?.resumen_caja || {
    saldo_inicial: Number(turnoActual?.fondo_inicial || 0),
    ingresos_efectivo: 0,
    egresos_efectivo: 0,
    saldo_actual: 0
  };
  const resumenVentas = resumen?.resumen_ventas || {
    efectivo: 0,
    transferencia: 0,
    credito: 0,
    total_ventas: 0
  };

  const ingresos = useMemo(() => round2(Number(resumenCaja.ingresos_efectivo || 0)), [resumenCaja]);
  const egresos = useMemo(() => round2(Number(resumenCaja.egresos_efectivo || 0)), [resumenCaja]);
  const efectivoEsperado = Number(resumen?.efectivo_esperado || resumenCaja.saldo_actual || 0);
  const closeCountedCash = Number(closeForm.efectivo_contado || 0);
  const closeDifference = round2(closeCountedCash - efectivoEsperado);
  const closeHasDifference = closeForm.efectivo_contado !== '' && Math.abs(closeDifference) > 0.009;
  const cajaAbiertaPor = turnoActual?.usuario_nombre || (turnoActual?.usuario_id ? `Usuario #${turnoActual.usuario_id}` : 'Usuario no identificado');
  const cajaAbiertaEn = turnoActual?.fecha_apertura ? formatDateQuito(turnoActual.fecha_apertura) : null;
  const turnoResumen = turnoActual?.id ? `Turno #${turnoActual.id}` : 'Sin turno';

  const movimientosFiltrados = useMemo(
    () => (showOnlyBalanceImpact ? movimientos.filter((movimiento) => movimiento?.afecta_saldo) : movimientos),
    [movimientos, showOnlyBalanceImpact]
  );
  const totalMovimientosPages = Math.max(1, Math.ceil(movimientosFiltrados.length / pageSize));
  const movimientosPaginados = useMemo(() => {
    const start = (movimientosPage - 1) * pageSize;
    return movimientosFiltrados.slice(start, start + pageSize);
  }, [movimientosFiltrados, movimientosPage]);

  useEffect(() => {
    if (!closeHasDifference && (closeAuth.usuario || closeAuth.password)) {
      setCloseAuth({ usuario: '', password: '' });
    }
  }, [closeHasDifference, closeAuth.usuario, closeAuth.password]);

  const onAbrir = async () => {
    const fondoInicial = Number(fondo || 0);
    const nextErrors = {};
    if (!String(fondo || '').trim()) nextErrors.fondo = 'Este campo es obligatorio.';
    else if (!Number.isFinite(fondoInicial) || fondoInicial < 0) nextErrors.fondo = 'Ingresa un valor válido.';
    if (!aperturaErrors.setErrors(nextErrors)) return;

    await abrirTurno({ fondo_inicial: fondoInicial, observacion: 'Apertura manual desktop' });
    await refreshTurnoData();
  };

  const openManualModal = (tipo) => {
    setManualModal(tipo);
    setManualForm({ concepto: '', monto: '' });
    setManualNumericWarning('');
    manualFormErrors.resetErrors();
  };

  const onManual = async () => {
    if (!manualModal) return;
    const monto = Number(manualForm.monto || 0);
    const nextErrors = {};

    if (!manualForm.concepto.trim()) nextErrors.concepto = 'Este campo es obligatorio.';
    if (!String(manualForm.monto || '').trim()) nextErrors.monto = 'Este campo es obligatorio.';
    else if (!(monto > 0)) nextErrors.monto = 'El monto debe ser mayor a 0.';
    else if (monto > MAX_CASH_OPERATION_AMOUNT) nextErrors.monto = `El monto no puede superar ${MAX_CASH_OPERATION_AMOUNT}.`;
    if (!manualFormErrors.setErrors(nextErrors)) return;

    await movimientoManual({
      tipo: manualModal,
      concepto: manualForm.concepto.trim(),
      monto
    });

    setManualModal(null);
    setManualForm({ concepto: '', monto: '' });
    setManualNumericWarning('');
    manualFormErrors.resetErrors();
    await refreshTurnoData();
  };

  const handleOpenCloseModal = async () => {
    cierreFormErrors.resetErrors();
    setCloseForm({ efectivo_contado: '', observacion: '' });
    setCloseAuth({ usuario: '', password: '' });
    await refreshTurnoData();
    setCloseModalOpen(true);
  };

  const validateCloseCountStep = () => {
    const nextErrors = {};

    if (!String(closeForm.efectivo_contado || '').trim()) nextErrors.efectivo_contado = 'Este campo es obligatorio.';
    else if (!Number.isFinite(closeCountedCash) || closeCountedCash < 0) nextErrors.efectivo_contado = 'El efectivo contado no puede ser negativo.';
    else if (closeCountedCash > MAX_CASH_OPERATION_AMOUNT) nextErrors.efectivo_contado = `El efectivo contado no puede superar ${MAX_CASH_OPERATION_AMOUNT}.`;

    if (closeHasDifference) {
      if (!closeForm.observacion.trim()) nextErrors.observacion = 'La observación es obligatoria cuando existe diferencia.';
    }

    return cierreFormErrors.setErrors(nextErrors);
  };

  const validateCloseAuthorization = () => {
    const nextErrors = {};
    if (!closeAuth.usuario.trim()) nextErrors.usuario = 'Este campo es obligatorio.';
    if (!closeAuth.password.trim()) nextErrors.password = 'Este campo es obligatorio.';
    return cierreFormErrors.setErrors(nextErrors);
  };

  const onCloseShift = async ({ mode, authorization } = {}) => {
    if (mode === 'step1') {
      return validateCloseCountStep();
    }

    if (mode === 'authorize' && !validateCloseAuthorization()) {
      return false;
    }

    if (!validateCloseCountStep()) return false;

    await corteZ({
      efectivo_contado: closeCountedCash,
      observacion: closeForm.observacion.trim() || undefined,
      autorizacion: closeHasDifference
        ? { usuario: authorization?.usuario?.trim() || closeAuth.usuario.trim(), password: authorization?.password || closeAuth.password }
        : undefined
    });

    setCloseModalOpen(false);
    setCloseForm({ efectivo_contado: '', observacion: '' });
    setCloseAuth({ usuario: '', password: '' });
    cierreFormErrors.resetErrors();
    await refreshTurnoData();
    return true;
  };

  const quickActions = turnoActual ? (
    <>
      <Button onClick={() => openManualModal('INGRESO')}>+ Ingreso manual</Button>
      <Button variant="secondary" onClick={() => openManualModal('EGRESO')}>+ Egreso manual</Button>
      <Button variant="danger" onClick={handleOpenCloseModal}>
        <PiLockKeyOpenBold className="h-4 w-4" />
        Cerrar caja
      </Button>
    </>
  ) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operación POS"
        title="Caja"
        description="Estado del turno, acciones rápidas, resumen financiero y movimientos auditables del día."
        actions={quickActions}
      />

      {turnoActual ? (
        <Panel className="overflow-hidden border-[var(--color-success)]/20 bg-[linear-gradient(135deg,rgba(10,112,72,0.08),rgba(255,255,255,0.95))]">
          <PanelSection className="px-5 py-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="success">Caja abierta</StatusBadge>
                <span className="text-sm font-semibold text-[var(--color-text)]">{turnoResumen}</span>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">
                {cajaAbiertaPor}
                {cajaAbiertaEn ? ` · ${cajaAbiertaEn}` : ''}
              </p>
            </div>
          </PanelSection>
        </Panel>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      {!turnoActual ? (
        <Panel className="p-6">
          <div className="mx-auto max-w-md space-y-5 py-4">
            <EmptyState
              title="Caja no iniciada"
              description="Todavía no hay un turno abierto. Define el fondo inicial para comenzar la operación de caja."
            />
            <div className="space-y-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Fondo inicial</label>
                <Input
                  error={Boolean(aperturaErrors.errors.fondo)}
                  value={fondo}
                  onChange={(event) => {
                    aperturaErrors.clearFieldError('fondo');
                    setFondo(event.target.value);
                  }}
                />
                {aperturaErrors.errors.fondo ? <p className="mt-2 text-sm text-[var(--color-danger)]">{aperturaErrors.errors.fondo}</p> : null}
              </div>
              <Button className="w-full" onClick={onAbrir} disabled={loading}>
                Abrir turno
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <Panel className="p-4">
            <PanelHeader title="Estado de caja" description="Entradas, salidas y efectivo esperado." />
            <PanelSection className="px-0 pb-0 pt-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatTile
                  icon={<PiWallet className="h-5 w-5 text-[var(--color-brand)]" />}
                  label="Saldo inicial"
                  value={formatMoney(turnoActual.fondo_inicial)}
                  hint="Base de efectivo al abrir el turno."
                  accentClass="bg-[var(--color-brand-soft)]"
                />
                <StatTile
                  icon={<PiCashRegister className="h-5 w-5 text-[var(--color-success-text)]" />}
                  label="Ingresos efectivo"
                  value={formatMoney(ingresos)}
                  hint="Ventas contado, cobranzas e ingresos manuales."
                  accentClass="bg-[var(--color-success-soft)]"
                />
                <StatTile
                  icon={<PiReceipt className="h-5 w-5 text-[var(--color-warning-text)]" />}
                  label="Egresos efectivo"
                  value={formatMoney(egresos)}
                  hint="Compras, pagos y egresos registrados."
                  accentClass="bg-[var(--color-warning-soft)]"
                />
                <StatTile
                  icon={<PiCashRegister className="h-5 w-5 text-[var(--color-danger)]" />}
                  label="Efectivo esperado"
                  value={formatMoney(efectivoEsperado)}
                  hint="Disponible esperado al cierre del turno."
                  accentClass="bg-[var(--color-danger-soft)]"
                />
              </div>
            </PanelSection>
          </Panel>

          <Panel className="p-4">
            <PanelHeader title="Ventas del turno" description="Ventas por método de pago." />
            <PanelSection className="px-0 pb-0 pt-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatTile
                  icon={<PiWallet className="h-5 w-5 text-[var(--color-brand)]" />}
                  label="Efectivo"
                  value={formatMoney(resumenVentas.efectivo)}
                  hint="Ventas cobradas en caja."
                  accentClass="bg-[var(--color-brand-soft)]"
                />
                <StatTile
                  icon={<PiArrowsLeftRightBold className="h-5 w-5 text-[var(--color-info-text)]" />}
                  label="Transferencia"
                  value={formatMoney(resumenVentas.transferencia)}
                  hint="Ventas registradas por transferencia."
                  accentClass="bg-[var(--color-info-soft)]"
                />
                <StatTile
                  icon={<PiCreditCardBold className="h-5 w-5 text-[var(--color-warning-text)]" />}
                  label="Crédito"
                  value={formatMoney(resumenVentas.credito)}
                  hint="Ventas enviadas a crédito."
                  accentClass="bg-[var(--color-warning-soft)]"
                />
                <StatTile
                  icon={<PiChartBarBold className="h-5 w-5 text-[var(--color-danger)]" />}
                  label="Total ventas"
                  value={formatMoney(resumenVentas.total_ventas)}
                  hint="Suma comercial del turno."
                  accentClass="bg-[var(--color-danger-soft)]"
                />
              </div>
            </PanelSection>
          </Panel>

          <Panel className="p-4">
            <PanelHeader
              title="Movimientos del turno"
              description="Bloque principal de operación y auditoría del turno activo."
            />

            <PanelSection className="space-y-4 px-0 pb-0 pt-4">
              <div className="flex flex-col gap-3 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {['TODOS', 'VENTAS', 'INGRESOS', 'EGRESOS'].map((item) => (
                    <Button
                      key={item}
                      type="button"
                      size="sm"
                      variant={movementFilter === item ? 'primary' : 'secondary'}
                      onClick={() => setMovementFilter(item)}
                    >
                      {item === 'TODOS' ? 'Todos' : item === 'VENTAS' ? 'Ventas' : item === 'INGRESOS' ? 'Ingresos' : 'Egresos'}
                    </Button>
                  ))}
                </div>

                <Switch
                  checked={showOnlyBalanceImpact}
                  onChange={setShowOnlyBalanceImpact}
                  label="Mostrar solo movimientos que afectan saldo"
                  description="Oculta ventas informativas por transferencia y crédito."
                />
              </div>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell as="th">Hora</TableCell>
                    <TableCell as="th">Movimiento</TableCell>
                    <TableCell as="th">Método</TableCell>
                    <TableCell as="th">Referencia</TableCell>
                    <TableCell as="th" className="text-right">Monto</TableCell>
                    <TableCell as="th">Usuario</TableCell>
                    <TableCell as="th">Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody emptyMessage="Sin movimientos registrados en este turno." emptyColSpan={7}>
                  {movimientosPaginados.map((movimiento) => {
                    const sense = resolveMovementSense(movimiento);
                    const signedAmount = `${sense.label === 'Egreso' ? '-' : '+'}${formatMoney(movimiento.monto)}`;

                    return (
                      <TableRow key={movimiento.id} className={!movimiento.afecta_saldo ? 'bg-[var(--color-surface-muted)]' : undefined}>
                        <TableCell>{formatTimeQuito(movimiento.fecha)}</TableCell>
                        <TableCell>{formatMovementType(movimiento.tipo)}</TableCell>
                        <TableCell>{formatPaymentMethod(movimiento.metodo_pago)}</TableCell>
                        <TableCell>{resolveMovementReference(movimiento)}</TableCell>
                        <TableCell className="text-right font-semibold text-[var(--color-text)]">{signedAmount}</TableCell>
                        <TableCell>{movimiento.usuario_nombre || (movimiento.usuario_id ? `Usuario #${movimiento.usuario_id}` : '-')}</TableCell>
                        <TableCell>
                          <TableActions>
                            <TableActionButton
                              variant="neutral"
                              icon={<PiEye />}
                              aria-label="Ver detalle"
                              title="Ver detalle"
                              onClick={() => onViewMovimiento(movimiento)}
                            >
                              Ver
                            </TableActionButton>
                          </TableActions>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {movimientosFiltrados.length > pageSize ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Mostrando {(movimientosPage - 1) * pageSize + 1}-{Math.min(movimientosPage * pageSize, movimientosFiltrados.length)} de {movimientosFiltrados.length} movimientos
                  </p>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" disabled={movimientosPage <= 1} onClick={() => setMovimientosPage((page) => Math.max(1, page - 1))}>
                      Anterior
                    </Button>
                    <span className="min-w-[5.5rem] text-center text-sm font-medium text-[var(--color-text)]">
                      {movimientosPage} / {totalMovimientosPages}
                    </span>
                    <Button type="button" size="sm" variant="secondary" disabled={movimientosPage >= totalMovimientosPages} onClick={() => setMovimientosPage((page) => Math.min(totalMovimientosPages, page + 1))}>
                      Siguiente
                    </Button>
                  </div>
                </div>
              ) : null}
            </PanelSection>
          </Panel>
        </>
      )}

      <ManualMovementModal
        open={Boolean(manualModal)}
        onClose={() => {
          setManualModal(null);
          setManualNumericWarning('');
        }}
        type={manualModal}
        form={manualForm}
        errors={manualFormErrors.errors}
        numericWarning={manualNumericWarning}
        loading={loading}
        onChange={(field, value) => {
          manualFormErrors.clearFieldError(field);
          if (field === 'monto') {
            setManualNumericWarning(/[a-zA-Z]/.test(String(value || '')) ? 'Solo valores numéricos.' : '');
            setManualForm((state) => ({ ...state, [field]: sanitizeCashAmountInput(value) }));
            return;
          }
          setManualForm((state) => ({ ...state, [field]: value }));
        }}
        onSubmit={onManual}
      />

      <CashClosingModal
        open={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        onPrint={() => void corteX()}
        onConfirm={onCloseShift}
        turnoActual={turnoActual}
        user={currentUser}
        summary={resumen}
        form={closeForm}
        auth={closeAuth}
        errors={cierreFormErrors.errors}
        errorMessage={error}
        loading={loading}
        onFormChange={(field, value) => {
          cierreFormErrors.clearFieldError(field);
          setCloseForm((state) => ({ ...state, [field]: value }));
        }}
        onAuthChange={(field, value) => {
          cierreFormErrors.clearFieldError(field);
          setCloseAuth((state) => ({ ...state, [field]: value }));
        }}
      />

      <Modal open={Boolean(movimientoDetalle)} onClose={() => setMovimientoDetalle(null)} maxWidthClass="max-w-md" panelClassName="p-4">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">Detalle movimiento</h3>
            </div>
            <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setMovimientoDetalle(null)}>
              X
            </Button>
          </div>

          <div className="space-y-2 text-sm text-[var(--color-text)]">
            <p><span className="font-semibold">Fecha:</span> {formatDateQuito(movimientoDetalle?.fecha)}</p>
            <p><span className="font-semibold">Tipo:</span> {movimientoDetalle?.tipo}</p>
            <p><span className="font-semibold">Método:</span> {formatPaymentMethod(movimientoDetalle?.metodo_pago)}</p>
            <p><span className="font-semibold">Sentido:</span> {movimientoDetalle?.sentido || '-'}</p>
            <p><span className="font-semibold">Concepto:</span> {movimientoDetalle?.concepto}</p>
            <p><span className="font-semibold">Módulo origen:</span> {movimientoDetalle?.modulo_origen || '-'}</p>
            <p><span className="font-semibold">Documento origen:</span> {movimientoDetalle?.documento_origen || '-'}</p>
            <p><span className="font-semibold">Actor:</span> {movimientoDetalle?.usuario_nombre || movimientoDetalle?.usuario_id || '-'}</p>
            <p><span className="font-semibold">Observación:</span> {movimientoDetalle?.observacion || '-'}</p>
            <p><span className="font-semibold">Monto:</span> {formatMoney(movimientoDetalle?.monto)}</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
