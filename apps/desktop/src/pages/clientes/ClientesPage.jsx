import { useEffect, useMemo, useState } from 'react';
import { PiCurrencyDollar, PiEye, PiPencilSimple, PiPlus } from 'react-icons/pi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  FiltersBar,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Paginador,
  Select,
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
} from '../../shared/ui';
import { useClientesStore } from '../../stores/clientesStore';
import { useCajaStore } from '../../stores/cajaStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { formatMoney } from '../../lib/formatMoney';
import useFormErrors from '../../shared/hooks/useFormErrors';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';

const PAGE_SIZE = GLOBAL_PAGE_SIZE;
const PHONE_REGEX = /^\d{1,10}$/;

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
function sanitizePhoneInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

const toNumber = (value) => {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '0').replace(/[^0-9.-]+/g, '');
  return Number(cleaned) || 0;
};

const PAYMENT_METHOD_LABELS = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia'
};

export default function ClientesPage() {
  const {
    clientes,
    meta,
    error,
    loading,
    listar,
    crear,
    actualizar,
    abonar,
    cargarDeudas
  } = useClientesStore();
  const turnoActual = useCajaStore((state) => state.turnoActual);
  const fetchTurnoActual = useCajaStore((state) => state.fetchTurnoActual);
  const configuracion = useConfiguracionStore((state) => state.configuracion);
  const metodosPago = useConfiguracionStore((state) => state.metodosPago);
  const cargarMetodosPago = useConfiguracionStore((state) => state.cargarMetodosPago);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const creditoQuery = String(searchParams.get('credito') || '').toLowerCase();
  const initialCredito = creditoQuery === 'con_deuda' || creditoQuery === 'pendiente'
    ? 'CON'
    : creditoQuery === 'sin_deuda'
      ? 'SIN'
      : 'TODOS';

  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS', credito: initialCredito });
  const [clienteModal, setClienteModal] = useState({ open: false, mode: 'create' });
  const [clienteForm, setClienteForm] = useState(emptyClienteForm);
  const [abonoModal, setAbonoModal] = useState(null);
  const [abonoForm, setAbonoForm] = useState({
    venta_id: '',
    monto: '',
    metodo_pago: 'EFECTIVO',
    banco: '',
    referencia: '',
    observacion: ''
  });
  const [feedback, setFeedback] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusToast, setStatusToast] = useState('');
  const [statusToastError, setStatusToastError] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [errorToastVisible, setErrorToastVisible] = useState(false);
  const [loadingAbonoMeta, setLoadingAbonoMeta] = useState(false);
  const clienteFormErrors = useFormErrors();
  const abonoFormErrors = useFormErrors();

  const refreshList = () => {
    listar({
      include_credito: 1,
      limit: PAGE_SIZE,
      offset: (pagina - 1) * PAGE_SIZE,
      search: filtros.search || undefined,
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado,
      credito: filtros.credito === 'TODOS' ? undefined : filtros.credito
    });
  };

  useEffect(() => {
    const timer = setTimeout(refreshList, 250);
    return () => clearTimeout(timer);
  }, [listar, pagina, filtros]);

  useEffect(() => {
    cargarMetodosPago();
    fetchTurnoActual({ silent: true });
  }, [cargarMetodosPago, fetchTurnoActual]);

  useEffect(() => {
    if (!statusToast) return undefined;
    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 3800);
    const clearTimer = window.setTimeout(() => setStatusToast(''), 4000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusToast]);

  useEffect(() => {
    if (!statusToastError) return undefined;
    setErrorToastVisible(true);
    const hideTimer = window.setTimeout(() => setErrorToastVisible(false), 3800);
    const clearTimer = window.setTimeout(() => setStatusToastError(''), 4000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusToastError]);

  const totalRegistros = Number(meta?.total || 0);
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / PAGE_SIZE));

  const clientesOrdenados = useMemo(() => {
    return [...clientes].sort((a, b) => {
      const saldoA = Number(a.saldo_credito || 0);
      const saldoB = Number(b.saldo_credito || 0);
      if (saldoB !== saldoA) return saldoB - saldoA;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    });
  }, [clientes]);

  const onChangeFiltro = (key, value) => {
    setPagina(1);
    setFiltros((prev) => {
      const next = { ...prev, [key]: value };
      const nextParams = new URLSearchParams(searchParams);

      if (key === 'credito') {
        if (value === 'CON') nextParams.set('credito', 'con_deuda');
        else if (value === 'SIN') nextParams.set('credito', 'sin_deuda');
        else nextParams.delete('credito');
      }

      setSearchParams(nextParams, { replace: true });
      return next;
    });
  };

  const openCreateModal = () => {
    setClienteModal({ open: true, mode: 'create' });
    setClienteForm({ ...emptyClienteForm });
    clienteFormErrors.resetErrors();
  };

  const openEditModal = (cliente) => {
    setClienteModal({ open: true, mode: 'edit' });
    clienteFormErrors.resetErrors();
    setClienteForm({
      id: cliente.id,
      nombre: cliente.nombre || '',
      cedula: cliente.cedula || '',
      telefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      observacion: cliente.observacion || '',
      activo: Boolean(cliente.activo)
    });
  };

  const closeClienteModal = () => {
    setClienteModal({ open: false, mode: 'create' });
    setClienteForm({ ...emptyClienteForm });
    clienteFormErrors.resetErrors();
  };

  const onSaveCliente = async () => {
    const nextErrors = {};
    if (!clienteForm.nombre.trim()) nextErrors.nombre = 'Este campo es obligatorio.';
    if (!clienteForm.cedula.trim()) nextErrors.cedula = 'Este campo es obligatorio.';
    else if (!/^\d{10}$/.test(clienteForm.cedula)) nextErrors.cedula = 'La cédula debe tener 10 dígitos numéricos.';
    if (String(clienteForm.telefono || '').trim() && !PHONE_REGEX.test(clienteForm.telefono.trim())) {
      nextErrors.telefono = 'Ingresa solo números positivos, máximo 10 dígitos.';
    }
    if (!clienteFormErrors.setErrors(nextErrors)) return;

    const payload = {
      nombre: clienteForm.nombre.trim(),
      cedula: clienteForm.cedula.trim(),
      telefono: clienteForm.telefono.trim() || null,
      direccion: clienteForm.direccion.trim() || null,
      observacion: clienteForm.observacion.trim() || null,
      activo: clienteForm.activo
    };

    try {
      if (clienteModal.mode === 'edit' && clienteForm.id) {
        await actualizar(clienteForm.id, payload);
      } else {
        await crear(payload);
      }

      closeClienteModal();
      refreshList();
    } catch (_) {
      // store error already exposed in page alert
    }
  };

  const onRegistrarAbono = async () => {
    if (!abonoModal) return;
    const monto = Number(abonoForm.monto || 0);
    const saldoPendiente = Number(abonoModal.saldo_credito || 0);
    const metodo = String(abonoForm.metodo_pago || '').toUpperCase();
    const ventaId = Number(abonoForm.venta_id || 0);
    const nextErrors = {};
    if (!(ventaId > 0)) nextErrors.venta_id = 'Selecciona una deuda.';
    if (!String(abonoForm.monto || '').trim() || !(monto > 0)) nextErrors.monto = 'Ingresa un monto válido.';
    if (monto > saldoPendiente) nextErrors.monto = 'El abono no puede superar el crédito pendiente.';
    if (metodo === 'TRANSFERENCIA' && !String(abonoForm.banco || '').trim()) {
      nextErrors.banco = 'Selecciona el banco de la transferencia.';
    }
    if (metodo === 'EFECTIVO' && configuracion.exigir_caja_abierta_para_cobros && !turnoActual?.id) {
      nextErrors.metodo_pago = 'Para registrar abonos en efectivo debes abrir caja.';
    }
    if (saldoPendiente <= 0) nextErrors.monto = 'Este cliente no tiene crédito pendiente.';
    if (!abonoFormErrors.setErrors(nextErrors)) return;

    await abonar(abonoModal.id, {
      venta_id: ventaId,
      monto,
      metodo_pago: metodo,
      banco: metodo === 'TRANSFERENCIA' ? abonoForm.banco || undefined : undefined,
      referencia: metodo === 'TRANSFERENCIA' ? abonoForm.referencia || undefined : undefined,
      observacion: abonoForm.observacion || undefined
    });

    setAbonoModal(null);
    setAbonoForm({ venta_id: '', monto: '', metodo_pago: 'EFECTIVO', banco: '', referencia: '', observacion: '' });
    abonoFormErrors.resetErrors();
    setStatusToast('Abono registrado correctamente');
    refreshList();
  };

  const saldoPosterior = useMemo(() => {
    const saldo = Number(abonoModal?.saldo_credito || 0);
    const monto = Number(abonoForm.monto || 0);
    return Math.max(0, saldo - (Number.isFinite(monto) ? monto : 0));
  }, [abonoModal?.saldo_credito, abonoForm.monto]);

  const metodosPagoDisponibles = useMemo(() => {
    const habilitados = (metodosPago || [])
      .filter((method) => method.habilitado)
      .map((method) => String(method.codigo || '').toUpperCase());
    const base = habilitados.length ? habilitados : ['EFECTIVO', 'TRANSFERENCIA'];
    return base.filter((code, index) => base.indexOf(code) === index);
  }, [metodosPago]);

  const abrirModalAbono = async (cliente) => {
    if (toNumber(cliente.saldo_credito) <= 0) return;
    setLoadingAbonoMeta(true);
    try {
      const deudas = await cargarDeudas(cliente.id, { estado: 'PENDIENTE' });
      const primeraDeuda = (deudas || []).find((item) => Number(item.saldo || 0) > 0);
      setAbonoModal({ ...cliente, deudas: deudas || [] });
      setAbonoForm({
        venta_id: primeraDeuda ? String(primeraDeuda.id) : '',
        monto: '',
        metodo_pago: 'EFECTIVO',
        banco: '',
        referencia: '',
        observacion: ''
      });
      abonoFormErrors.resetErrors();
    } finally {
      setLoadingAbonoMeta(false);
    }
  };

  return (
    <div className="space-y-5">
      {statusToast ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast
            tone="success"
            title="Operacion completada"
            description={statusToast}
            onClose={() => {
              setToastVisible(false);
              setStatusToast('');
            }}
            className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}
          />
        </div>
      ) : null}
      {statusToastError ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast
            tone="danger"
            title="No se pudo completar"
            description={statusToastError}
            onClose={() => {
              setErrorToastVisible(false);
              setStatusToastError('');
            }}
            className={errorToastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}
          />
        </div>
      ) : null}

      <PageHeader
        title="Clientes y crédito"
        description="Gestión de clientes, estado y cartera."
        actions={(
          <Button onClick={openCreateModal}>
            <PiPlus className="text-base" />
            Nuevo cliente
          </Button>
        )}
      />

      {(statusError || error || feedback) && (
        <Alert tone={statusError || error ? 'error' : 'success'}>
          {statusError || error || feedback}
        </Alert>
      )}

      <FiltersBar
        search={(
          <Field label="Buscar">
            <Input
              value={filtros.search}
              onChange={(e) => onChangeFiltro('search', e.target.value)}
              placeholder="Nombre, teléfono o dirección"
            />
          </Field>
        )}
        actions={(
          <Button
            variant="neutral"
            className="w-full xl:w-auto"
            onClick={() => {
              setFiltros({ search: '', estado: 'TODOS', credito: 'TODOS' });
              const nextParams = new URLSearchParams(searchParams);
              nextParams.delete('credito');
              setSearchParams(nextParams, { replace: true });
            }}
          >
            Limpiar filtros
          </Button>
        )}
      >
        <Field label="Estado">
          <Select
            value={filtros.estado}
            onChange={(e) => onChangeFiltro('estado', e.target.value)}
          >
            <option value="TODOS">Todos</option>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </Select>
        </Field>

        <Field label="Crédito">
          <Select
            value={filtros.credito}
            onChange={(e) => onChangeFiltro('credito', e.target.value)}
          >
            <option value="TODOS">Todos</option>
            <option value="CON">Con crédito</option>
            <option value="SIN">Sin crédito</option>
          </Select>
        </Field>
      </FiltersBar>

      <Card className="overflow-hidden p-0">
        {clientesOrdenados.length === 0 && !loading ? (
          <div className="p-5">
            <EmptyState
              title="Sin clientes"
              description="No hay clientes para los filtros actuales."
            />
          </div>
        ) : (
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">ID</TablaCelda>
                <TablaCelda as="th">Cliente</TablaCelda>
                <TablaCelda as="th">Contacto</TablaCelda>
                <TablaCelda as="th" className="text-right">Crédito</TablaCelda>
                <TablaCelda as="th">Estado</TablaCelda>
                <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {clientesOrdenados.map((c) => {
                const saldoCredito = toNumber(c.saldo_credito);
                const sinSaldo = saldoCredito <= 0;
                return (
                  <TablaFila key={c.id}>
                    <TablaCelda className="py-3 font-semibold text-[var(--color-text)]">#{c.id}</TablaCelda>
                    <TablaCelda className="py-3">
                      <p className="text-[var(--color-text)]">{c.nombre}</p>
                    </TablaCelda>
                    <TablaCelda className="py-3">{c.telefono || '-'}</TablaCelda>
                    <TablaCelda className="py-3 text-right">
                      {sinSaldo ? (
                        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                          Sin deuda
                        </span>
                      ) : (
                        <span className="rounded-full border border-[#F5D08A] bg-[#FFF7E6] px-3 py-1 text-xs font-semibold text-[#9A6700]">
                          Pendiente {formatMoney(saldoCredito)}
                        </span>
                      )}
                    </TablaCelda>
                    <TablaCelda className="py-3">
                      {c.activo ? (
                        <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                          Inactivo
                        </span>
                      )}
                    </TablaCelda>
                    <TablaCelda className="py-3">
                      <TableActions>
                        <TableActionButton
                          variant="neutral"
                          className="border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                          icon={<PiEye />}
                          aria-label="Ver cliente"
                          title="Ver cliente"
                          onClick={() => navigate(`/clientes/${c.id}`)}
                        >
                          Ver
                        </TableActionButton>
                        <TableActionButton
                          variant="success"
                          className="border border-[var(--color-text)] bg-[var(--color-text)] text-white hover:border-black hover:bg-black"
                          icon={<PiCurrencyDollar />}
                          aria-label="Registrar abono"
                          title={sinSaldo ? 'Sin saldo pendiente' : 'Registrar abono'}
                          disabled={sinSaldo}
                          onClick={() => abrirModalAbono(c)}
                        >
                          Abonar
                        </TableActionButton>
                        <TableActionButton
                          variant="secondary"
                          className="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          icon={<PiPencilSimple />}
                          aria-label="Editar cliente"
                          title="Editar cliente"
                          onClick={() => openEditModal(c)}
                        >
                          Editar
                        </TableActionButton>
                      </TableActions>
                    </TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>
        )}
      </Card>

      <Paginador
        paginaActual={pagina}
        totalPaginas={totalPaginas}
        totalRegistros={totalRegistros}
        mostrarSiempre
        onPageChange={setPagina}
      />

      {loading && <LoadingState label="Cargando clientes..." />}

      <Modal open={clienteModal.open} onClose={closeClienteModal} maxWidthClass="max-w-4xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{clienteModal.mode === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Registra o actualiza clientes para ventas y crédito.</p>
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
                  setClienteForm((s) => ({ ...s, nombre: e.target.value }));
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
                  setClienteForm((s) => ({ ...s, cedula: sanitizeCedulaInput(e.target.value) }));
                }}
                placeholder="0123456789"
              />
            </Field>

            <Field label="Teléfono" error={clienteFormErrors.errors.telefono}>
              <Input
                inputMode="numeric"
                value={clienteForm.telefono}
                onChange={(e) => {
                  clienteFormErrors.clearFieldError('telefono');
                  setClienteForm((s) => ({ ...s, telefono: sanitizePhoneInput(e.target.value) }));
                }}
                placeholder="0990000000"
              />
            </Field>
          </div>

          <div className="space-y-4">
            <Field label="Dirección">
              <Input
                value={clienteForm.direccion}
                onChange={(e) => setClienteForm((s) => ({ ...s, direccion: e.target.value }))}
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
                onChange={(e) => setClienteForm((s) => ({ ...s, observacion: e.target.value }))}
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
            {clienteModal.mode === 'edit' ? 'Guardar cambios' : 'Guardar cliente'}
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(abonoModal)} onClose={() => setAbonoModal(null)} maxWidthClass="max-w-2xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Abonar crédito</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Registra un pago parcial o total.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setAbonoModal(null)}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Cliente</p>
            <p className="text-base font-semibold text-[var(--color-text)]">{abonoModal?.nombre}</p>
            <p className="text-sm text-[var(--color-text-muted)]">Teléfono: {abonoModal?.telefono || '-'}</p>
            <p className="text-sm">
              <span className="text-[var(--color-text-muted)]">Crédito pendiente: </span>
              <span className="font-semibold text-[var(--color-text)]">{formatMoney(abonoModal?.saldo_credito || 0)}</span>
            </p>
          </div>

          <div className="space-y-3">
            <Field label="Documento con deuda" required error={abonoFormErrors.errors.venta_id}>
              <Select
                value={abonoForm.venta_id}
                onChange={(e) => {
                  abonoFormErrors.clearFieldError('venta_id');
                  setAbonoForm((s) => ({ ...s, venta_id: e.target.value }));
                }}
              >
                <option value="">Selecciona una deuda</option>
                {(abonoModal?.deudas || []).map((deuda) => (
                  <option key={deuda.id} value={deuda.id}>
                    {`Venta #${deuda.id} • Pendiente ${formatMoney(deuda.saldo)}`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Monto a abonar" required error={abonoFormErrors.errors.monto}>
            <Input
              placeholder="0.00"
              className="h-11 text-base font-semibold"
              value={abonoForm.monto}
              onChange={(e) => {
                abonoFormErrors.clearFieldError('monto');
                setAbonoForm((s) => ({ ...s, monto: e.target.value }));
              }}
            />
          </Field>
          <Field label="Saldo después del abono">
            <div className={`h-11 rounded-[10px] border px-3 py-2 ${saldoPosterior <= 0
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text)]'}`}
            >
              <p className="text-base font-semibold">
                {saldoPosterior <= 0 ? 'Pagado completamente' : formatMoney(saldoPosterior)}
              </p>
              {saldoPosterior <= 0 ? <p className="text-xs font-medium text-green-700/85">{formatMoney(saldoPosterior)}</p> : null}
            </div>
          </Field>
          <Field label="Método de pago" required error={abonoFormErrors.errors.metodo_pago}>
            <Select
              value={abonoForm.metodo_pago}
              onChange={(e) => {
                abonoFormErrors.clearFieldError('metodo_pago');
                setAbonoForm((s) => ({ ...s, metodo_pago: e.target.value }));
              }}
            >
              {metodosPagoDisponibles.map((codigo) => (
                <option key={codigo} value={codigo}>{PAYMENT_METHOD_LABELS[codigo] || codigo}</option>
              ))}
            </Select>
          </Field>
          {String(abonoForm.metodo_pago).toUpperCase() === 'TRANSFERENCIA' ? (
            <>
              <Field label="Banco" required error={abonoFormErrors.errors.banco}>
                <Input
                  value={abonoForm.banco}
                  onChange={(e) => {
                    abonoFormErrors.clearFieldError('banco');
                    setAbonoForm((s) => ({ ...s, banco: e.target.value }));
                  }}
                  placeholder="Banco Pichincha"
                />
              </Field>
              <Field label="Referencia">
                <Input
                  value={abonoForm.referencia}
                  onChange={(e) => setAbonoForm((s) => ({ ...s, referencia: e.target.value }))}
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
              value={abonoForm.observacion}
              onChange={(e) => setAbonoForm((s) => ({ ...s, observacion: e.target.value }))}
            />
          </Field>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAbonoModal(null)}>
            Cancelar
          </Button>
          <Button
            className="border border-[var(--color-text)] bg-[var(--color-text)] text-white hover:border-black hover:bg-black"
            onClick={onRegistrarAbono}
            disabled={loadingAbonoMeta || Number(abonoModal?.saldo_credito || 0) <= 0}
          >
            Registrar abono
          </Button>
        </div>
      </Modal>
    </div>
  );
}
