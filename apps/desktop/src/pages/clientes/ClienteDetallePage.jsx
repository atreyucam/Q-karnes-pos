import { useEffect, useMemo, useState } from 'react';
import { PiCurrencyDollar, PiEye, PiPencilSimple } from 'react-icons/pi';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  BackButton,
  Button,
  Card,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Paginador,
  Select,
  StatusBadge,
  Switch,
  TableActions,
  TableActionButton,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea,
  Toast
} from '../../ui';
import { useClientesStore } from '../../stores/clientesStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';
import useFormErrors from '../../shared/hooks/useFormErrors';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';

const PAGE_SIZE = GLOBAL_PAGE_SIZE;
const emptyClienteForm = {
  id: null,
  nombre: '',
  cedula: '',
  telefono: '',
  direccion: '',
  observacion: '',
  activo: true
};

function sanitizeCedulaInput(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 10);
}

export default function ClienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clienteDetalle, facturas, resumen, error, loading, detalle, cargarFacturas, creditoResumen, abonar, actualizar } = useClientesStore();
  const configuracion = useConfiguracionStore((state) => state.configuracion);

  const clienteId = Number(id);
  const [pagina, setPagina] = useState(1);
  const [modalAbono, setModalAbono] = useState(null);
  const [abonoForm, setAbonoForm] = useState({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
  const [abonoError, setAbonoError] = useState('');
  const [clienteModal, setClienteModal] = useState({ open: false, mode: 'edit' });
  const [clienteForm, setClienteForm] = useState(emptyClienteForm);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [blockedDeactivateOpen, setBlockedDeactivateOpen] = useState(false);
  const [statusToast, setStatusToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const clienteFormErrors = useFormErrors();
  const abonoFormErrors = useFormErrors();

  const loadData = async () => {
    await Promise.all([detalle(clienteId), cargarFacturas(clienteId), creditoResumen(clienteId)]);
  };

  useEffect(() => {
    if (!Number.isFinite(clienteId) || clienteId <= 0) return;
    loadData();
  }, [clienteId]);

  useEffect(() => {
    setPagina(1);
  }, [facturas.length]);

  useEffect(() => {
    if (!statusToast) return undefined;
    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 2400);
    const clearTimer = window.setTimeout(() => setStatusToast(''), 2580);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusToast]);

  const facturasDecoradas = useMemo(() => {
    const rows = facturas.map((row) => ({
      ...row,
      credito_pendiente: Math.max(0, Number(row.saldo || 0))
    }));

    return rows.sort((a, b) => {
      const pA = Number(a.credito_pendiente || 0) > 0 ? 0 : 1;
      const pB = Number(b.credito_pendiente || 0) > 0 ? 0 : 1;
      if (pA !== pB) return pA - pB;
      const fechaA = String(a.fecha_vencimiento || '');
      const fechaB = String(b.fecha_vencimiento || '');
      if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);
      return Number(b.id) - Number(a.id);
    });
  }, [facturas]);

  const facturasPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return facturasDecoradas.slice(start, start + PAGE_SIZE);
  }, [facturasDecoradas, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(facturasDecoradas.length / PAGE_SIZE));

  const abrirModalAbono = (factura) => {
    setModalAbono(factura);
    setAbonoForm({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
    setAbonoError('');
    abonoFormErrors.resetErrors();
  };

  const registrarAbono = async () => {
    if (!modalAbono) return;

    const saldoFactura = Math.min(Number(modalAbono.credito_pendiente || 0), Number(resumen?.saldo || 0));
    const monto = Number(abonoForm.monto || 0);
    const nextErrors = {};

    if (!(monto > 0)) {
      nextErrors.monto = String(abonoForm.monto || '').trim() ? 'Ingresa un valor válido.' : 'Este campo es obligatorio.';
      abonoFormErrors.setErrors(nextErrors);
      setAbonoError('El monto debe ser mayor a 0.');
      return;
    }

    if (monto > saldoFactura) {
      abonoFormErrors.resetErrors();
      setAbonoError('El monto no puede exceder el saldo pendiente');
      return;
    }

    abonoFormErrors.resetErrors();

    await abonar(clienteId, {
      monto,
      venta_id: modalAbono.id,
      metodo_pago: abonoForm.metodo_pago,
      observacion: abonoForm.observacion || undefined
    });

    setModalAbono(null);
    setAbonoForm({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
    setAbonoError('');
    await loadData();
  };

  const openEditModal = () => {
    if (!clienteDetalle) return;
    setClienteModal({ open: true, mode: 'edit' });
    clienteFormErrors.resetErrors();
    setClienteForm({
      id: clienteDetalle.id,
      nombre: clienteDetalle.nombre || '',
      cedula: clienteDetalle.cedula || '',
      telefono: clienteDetalle.telefono || '',
      direccion: clienteDetalle.direccion || '',
      observacion: clienteDetalle.observacion || '',
      activo: Boolean(clienteDetalle.activo)
    });
  };

  const closeClienteModal = () => {
    setClienteModal({ open: false, mode: 'edit' });
    setClienteForm(emptyClienteForm);
    clienteFormErrors.resetErrors();
  };

  const onSaveCliente = async () => {
    const nextErrors = {};
    if (!clienteForm.nombre.trim()) nextErrors.nombre = 'Este campo es obligatorio.';
    if (!clienteForm.cedula.trim()) nextErrors.cedula = 'Este campo es obligatorio.';
    else if (!/^\d{10}$/.test(clienteForm.cedula)) nextErrors.cedula = 'La cédula debe tener 10 dígitos numéricos.';
    if (!clienteFormErrors.setErrors(nextErrors)) return;

    const saldoPendiente = Number(resumen?.saldo || 0);
    const estabaActivo = Boolean(clienteDetalle?.activo);
    const quiereDesactivar = estabaActivo && !clienteForm.activo;

    if (quiereDesactivar && saldoPendiente > 0) {
      setBlockedDeactivateOpen(true);
      return;
    }

    const payload = {
      nombre: clienteForm.nombre.trim(),
      cedula: clienteForm.cedula.trim(),
      telefono: clienteForm.telefono.trim() || null,
      direccion: clienteForm.direccion.trim() || null,
      observacion: clienteForm.observacion.trim() || null,
      activo: clienteForm.activo
    };

    await actualizar(clienteId, payload);
    closeClienteModal();
    await loadData();
    setStatusToast('Cliente actualizado.');
  };

  const onToggleCliente = async () => {
    if (!clienteDetalle) return;

    if (clienteDetalle.activo) {
      if (Number(resumen?.saldo || 0) > 0) {
        setBlockedDeactivateOpen(true);
        return;
      }
      setConfirmDeactivateOpen(true);
      return;
    }

    try {
      await actualizar(clienteId, { activo: true });
      await loadData();
      setStatusToast('Cliente ha sido activado.');
    } catch (_) {
      // store error already exposed in page alert
    }
  };

  const onConfirmDeactivate = async () => {
    setDeactivateLoading(true);
    try {
      await actualizar(clienteId, { activo: false });
      setConfirmDeactivateOpen(false);
      await loadData();
      setStatusToast('Cliente ha sido desactivado.');
    } catch (_) {
      setConfirmDeactivateOpen(false);
    } finally {
      setDeactivateLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {statusToast ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast tone="success" className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}>{statusToast}</Toast>
        </div>
      ) : null}

      <BackButton to="/clientes">Volver</BackButton>

      <PageHeader
        title="Detalle del cliente"
        description="Facturas y gestión de abonos de crédito."
        actions={(
          <div className="flex flex-wrap gap-2">
            {clienteDetalle && (
              <>
                <Button variant="secondary" onClick={openEditModal}>
                  <PiPencilSimple className="text-base" />
                  Editar
                </Button>
                <Button
                  variant={clienteDetalle.activo ? 'danger' : 'primary'}
                  onClick={onToggleCliente}
                >
                  {clienteDetalle.activo ? 'Desactivar cliente' : 'Activar cliente'}
                </Button>
              </>
            )}
          </div>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {clienteDetalle && (
        <Card className="p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_280px]">
            <div className="space-y-3 p-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cliente</span>
                <span className="font-semibold text-[var(--color-text)]">{clienteDetalle.nombre}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cédula</span>
                <span className="font-semibold text-[var(--color-text)]">{clienteDetalle.cedula || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Dirección</span>
                <span className="font-semibold text-[var(--color-text)]">{clienteDetalle.direccion || '-'}</span>
              </div>
            </div>

            <div className="space-y-3 p-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Teléfono</span>
                <span className="font-semibold text-[var(--color-text)]">{clienteDetalle.telefono || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</span>
                <StatusBadge status={clienteDetalle.activo ? 'ACTIVO' : 'INACTIVO'} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observación</span>
                <span className="text-[var(--color-text)]">{clienteDetalle.observacion || '-'}</span>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Saldo crédito</p>
              <p className={`mt-3 text-3xl font-extrabold ${Number(resumen?.saldo || 0) > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                {formatMoney(resumen?.saldo)}
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Balance actual del crédito pendiente del cliente.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <p className="font-semibold text-[var(--color-text)]">Facturas del cliente</p>
          <span className="ui-chip ui-chip-info">{facturasDecoradas.length} registros</span>
        </div>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Venta / factura</TablaCelda>
              <TablaCelda as="th">Fecha</TablaCelda>
              <TablaCelda as="th">Método</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th" className="text-right">Total</TablaCelda>
              <TablaCelda as="th" className="text-right">Crédito pendiente</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {facturasPaginadas.map((f) => {
              const pendiente = Number(f.credito_pendiente || 0);
              const sinPendiente = pendiente <= 0;

              return (
                <TablaFila key={f.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">{f.referencia || `#${f.id}`}</TablaCelda>
                  <TablaCelda>{formatDateQuito(f.fecha)}</TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={f.metodo} />
                  </TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={f.estado} />
                  </TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(f.total)}</TablaCelda>
                  <TablaCelda className={`text-right font-semibold ${pendiente > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                    {formatMoney(pendiente)}
                  </TablaCelda>
                  <TablaCelda>
                    <TableActions>
                      <TableActionButton
                        variant="neutral"
                        icon={<PiEye />}
                        aria-label="Ver factura"
                        title="Ver factura"
                        onClick={() => navigate(`/ventas/${f.id}`)}
                      >
                        Ver
                      </TableActionButton>
                      <TableActionButton
                        variant="primary"
                        icon={<PiCurrencyDollar />}
                        aria-label="Registrar abono"
                        title={sinPendiente ? 'Sin saldo pendiente' : 'Registrar abono'}
                        disabled={sinPendiente}
                        onClick={() => abrirModalAbono(f)}
                      >
                        Abonar
                      </TableActionButton>
                    </TableActions>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>

        <div className="px-5 pb-5">
          <Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={facturasDecoradas.length} mostrarSiempre onPageChange={setPagina} />
        </div>
      </Card>

      {loading && <LoadingState label="Cargando cliente..." />}

      <Modal open={clienteModal.open} onClose={closeClienteModal} maxWidthClass="max-w-4xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Editar cliente</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Actualiza datos comerciales y estado del cliente.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={closeClienteModal}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Nombre" required error={clienteFormErrors.errors.nombre}>
              <Input
                value={clienteForm.nombre}
                onChange={(e) => {
                  clienteFormErrors.clearFieldError('nombre');
                  setClienteForm((state) => ({ ...state, nombre: e.target.value }));
                }}
                placeholder="Ej: Restaurante El Buen Sabor"
              />
            </Field>

            <Field label="Cédula" required error={clienteFormErrors.errors.cedula}>
              <Input
                inputMode="numeric"
                value={clienteForm.cedula}
                onChange={(e) => {
                  clienteFormErrors.clearFieldError('cedula');
                  setClienteForm((state) => ({ ...state, cedula: sanitizeCedulaInput(e.target.value) }));
                }}
                placeholder="0123456789"
              />
            </Field>

            <Field label="Teléfono">
              <Input
                value={clienteForm.telefono}
                onChange={(e) => setClienteForm((state) => ({ ...state, telefono: e.target.value }))}
                placeholder="0990000000"
              />
            </Field>
          </div>

          <div className="space-y-4">
            <Field label="Dirección">
              <Input
                value={clienteForm.direccion}
                onChange={(e) => setClienteForm((state) => ({ ...state, direccion: e.target.value }))}
                placeholder="Sector / calle"
              />
            </Field>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
              <Switch
                checked={clienteForm.activo}
                onChange={(checked) => setClienteForm((state) => ({ ...state, activo: checked }))}
                label="Cliente activo"
                description="Si está inactivo no aparece como opción para nuevas ventas."
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <Field label="Observación">
              <Textarea
                value={clienteForm.observacion}
                onChange={(e) => setClienteForm((state) => ({ ...state, observacion: e.target.value }))}
                placeholder="Notas del cliente"
              />
            </Field>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={closeClienteModal}>
            Cancelar
          </Button>
          <Button onClick={onSaveCliente}>
            Guardar cambios
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(modalAbono)} onClose={() => setModalAbono(null)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Registrar abono</h3>
            <p className="text-xl font-bold text-[var(--color-text)]">{clienteDetalle?.nombre || '-'}</p>
            <p className="text-base font-semibold text-[var(--color-text-muted)]">
              Saldo actual: {formatMoney(Math.min(Number(modalAbono?.credito_pendiente || 0), Number(resumen?.saldo || 0)))}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setModalAbono(null)}>
            X
          </Button>
        </div>

        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Factura {modalAbono?.referencia || `#${modalAbono?.id || ''}`}</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {configuracion?.exigir_caja_abierta_para_cobros
            ? 'El método efectivo requiere turno abierto. Transferencia no impacta caja.'
            : 'Efectivo impacta caja si existe turno abierto. Transferencia no impacta caja.'}
        </p>

        {abonoError && <Alert tone="error" className="mt-3">{abonoError}</Alert>}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Valor" required error={abonoFormErrors.errors.monto}>
            <Input
              className="mt-2"
              placeholder="10.00"
              value={abonoForm.monto}
              onChange={(e) => {
                abonoFormErrors.clearFieldError('monto');
                setAbonoForm((s) => ({ ...s, monto: e.target.value }));
              }}
            />
          </Field>
          <Field label="Método de pago">
            <Select
              className="mt-2"
              value={abonoForm.metodo_pago}
              onChange={(e) => setAbonoForm((s) => ({ ...s, metodo_pago: e.target.value }))}
            >
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Observación">
            <Textarea className="mt-2" value={abonoForm.observacion} onChange={(e) => setAbonoForm((s) => ({ ...s, observacion: e.target.value }))} />
          </Field>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalAbono(null)}>
            Cancelar
          </Button>
          <Button onClick={registrarAbono}>
            Guardar abono
          </Button>
        </div>
      </Modal>

      <Modal open={blockedDeactivateOpen} onClose={() => setBlockedDeactivateOpen(false)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">No se puede desactivar</h3>
              <p className="ui-panel-description">
                {clienteDetalle ? `No puedes desactivar a ${clienteDetalle.nombre} porque tiene saldo pendiente.` : ''}
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--color-danger-soft)] bg-[color-mix(in_oklab,var(--color-danger-soft)_82%,white_18%)] p-3 text-sm text-[var(--color-text)]">
            Saldo pendiente actual:{' '}
            <strong className="text-[var(--color-danger)]">{formatMoney(resumen?.saldo || 0)}</strong>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="danger" onClick={() => setBlockedDeactivateOpen(false)}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmDeactivateOpen} onClose={() => setConfirmDeactivateOpen(false)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="ui-panel-title">Confirmar desactivación</h3>
            </div>
            <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setConfirmDeactivateOpen(false)}>
              X
            </Button>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {clienteDetalle ? `Vas a desactivar al cliente ${clienteDetalle.nombre}.` : ''}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmDeactivateOpen(false)} disabled={deactivateLoading}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" onClick={onConfirmDeactivate} disabled={deactivateLoading}>
              {deactivateLoading ? 'Desactivando...' : 'Sí, desactivar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
