import { useEffect, useMemo, useState } from 'react';
import { PiCurrencyDollar, PiEye, PiPencilSimple, PiPlus } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
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
import { formatMoney } from '../../lib/formatMoney';
import useBooleanSwitch from '../../shared/hooks/useBooleanSwitch';
import useFormErrors from '../../shared/hooks/useFormErrors';

const PAGE_SIZE = 10;

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

export default function ClientesPage() {
  const { clientes, meta, error, loading, listar, crear, actualizar, abonar } = useClientesStore();
  const navigate = useNavigate();

  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS', credito: 'TODOS' });
  const [clienteModal, setClienteModal] = useState({ open: false, mode: 'create' });
  const [clienteForm, setClienteForm] = useState(emptyClienteForm);
  const [abonoModal, setAbonoModal] = useState(null);
  const [abonoForm, setAbonoForm] = useState({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
  const [feedback, setFeedback] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusToast, setStatusToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
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
    if (!statusToast) return undefined;
    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 2400);
    const clearTimer = window.setTimeout(() => setStatusToast(''), 2580);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [statusToast]);

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
    setFiltros((prev) => ({ ...prev, [key]: value }));
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
    const nextErrors = {};
    if (!String(abonoForm.monto || '').trim()) nextErrors.monto = 'Este campo es obligatorio.';
    else if (!(monto > 0)) nextErrors.monto = 'Ingresa un valor válido.';
    if (!abonoFormErrors.setErrors(nextErrors)) return;

    await abonar(abonoModal.id, {
      monto,
      metodo_pago: abonoForm.metodo_pago,
      observacion: abonoForm.observacion || undefined
    });

    setAbonoModal(null);
    setAbonoForm({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
    abonoFormErrors.resetErrors();
    refreshList();
  };

  const clienteStatusSwitch = useBooleanSwitch({
    getValue: (cliente) => Boolean(cliente.activo),
    isSensitive: (cliente, nextValue) => Boolean(cliente.activo) && !nextValue,
    onCommit: async (cliente, nextValue) => {
      setStatusError('');
      setFeedback('');
      await actualizar(cliente.id, { activo: nextValue });
      await refreshList();
      setStatusToast(`Cliente ha sido ${nextValue ? 'activado' : 'desactivado'}.`);
    },
    onError: (nextError, cliente, nextValue) => {
      setStatusToast('');
      setFeedback('');
      setStatusError(nextError.message || `No se pudo ${nextValue ? 'activar' : 'desactivar'} el cliente ${cliente.nombre}.`);
    }
  });

  return (
    <div className="space-y-5">
      {statusToast ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast tone="success" className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}>{statusToast}</Toast>
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
          <Button variant="secondary" className="w-full xl:w-auto" onClick={() => setFiltros({ search: '', estado: 'TODOS', credito: 'TODOS' })}>
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
                <TablaCelda as="th">Teléfono</TablaCelda>
                <TablaCelda as="th" className="text-right">Crédito pendiente</TablaCelda>
                <TablaCelda as="th">Estado</TablaCelda>
                <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {clientesOrdenados.map((c) => {
                const saldoCredito = Number(c.saldo_credito || 0);
                const sinSaldo = saldoCredito <= 0;
                const currentChecked = clienteStatusSwitch.resolveChecked(c);
                return (
                  <TablaFila
                    key={c.id}
                    className={saldoCredito > 0 ? 'bg-[color-mix(in_oklab,var(--color-warning-soft)_62%,white_38%)]' : ''}
                  >
                    <TablaCelda className="font-semibold text-[var(--color-text)]">#{c.id}</TablaCelda>
                    <TablaCelda>
                      <p className="text-[var(--color-text)]">{c.nombre}</p>
                    </TablaCelda>
                    <TablaCelda>{c.telefono || '-'}</TablaCelda>
                    <TablaCelda className={`text-right font-semibold ${saldoCredito > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                      {formatMoney(saldoCredito)}
                    </TablaCelda>
                    <TablaCelda>
                      <Switch
                        checked={currentChecked}
                        onChange={(checked) => {
                          setFeedback('');
                          clienteStatusSwitch.requestChange(c, checked);
                        }}
                        label={currentChecked ? 'Activo' : 'Inactivo'}
                        busy={clienteStatusSwitch.isPending(c)}
                        disabled={clienteStatusSwitch.isPending(c)}
                      />
                    </TablaCelda>
                    <TablaCelda>
                      <TableActions>
                        <TableActionButton
                          variant="neutral"
                          icon={<PiEye />}
                          aria-label="Ver cliente"
                          title="Ver cliente"
                          onClick={() => navigate(`/clientes/${c.id}`)}
                        >
                          Ver
                        </TableActionButton>
                        <TableActionButton
                          variant="secondary"
                          icon={<PiCurrencyDollar />}
                          aria-label="Registrar abono"
                          title={sinSaldo ? 'Sin saldo pendiente' : 'Registrar abono'}
                          disabled={sinSaldo}
                          onClick={() => {
                            setAbonoModal(c);
                            setAbonoForm({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
                            abonoFormErrors.resetErrors();
                          }}
                        >
                          Abonar
                        </TableActionButton>
                        <TableActionButton
                          variant="warning"
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

            <Field label="Teléfono">
              <Input
                value={clienteForm.telefono}
                onChange={(e) => setClienteForm((s) => ({ ...s, telefono: e.target.value }))}
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

      <ConfirmDialog
        open={Boolean(clienteStatusSwitch.confirmState)}
        onClose={clienteStatusSwitch.cancelConfirm}
        onConfirm={clienteStatusSwitch.confirmChange}
        title="Desactivar cliente"
        description={clienteStatusSwitch.confirmState ? `Vas a desactivar al cliente ${clienteStatusSwitch.confirmState.item.nombre}.` : ''}
        confirmLabel={clienteStatusSwitch.confirmState && clienteStatusSwitch.isPending(clienteStatusSwitch.confirmState.item) ? 'Desactivando...' : 'Sí, desactivar'}
        confirmVariant="danger"
        confirmLoading={Boolean(clienteStatusSwitch.confirmState && clienteStatusSwitch.isPending(clienteStatusSwitch.confirmState.item))}
      />

      <Modal open={Boolean(abonoModal)} onClose={() => setAbonoModal(null)} maxWidthClass="max-w-md" panelClassName="p-4">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Registrar abono</h3>
            <p className="text-xl font-bold text-[var(--color-text)]">{abonoModal?.nombre}</p>
            <p className="text-base font-semibold text-[var(--color-text-muted)]">Saldo actual: {formatMoney(abonoModal?.saldo_credito)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setAbonoModal(null)}>
            X
          </Button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Valor" required error={abonoFormErrors.errors.monto}>
            <Input
              placeholder="0.00"
              value={abonoForm.monto}
              onChange={(e) => {
                abonoFormErrors.clearFieldError('monto');
                setAbonoForm((s) => ({ ...s, monto: e.target.value }));
              }}
            />
          </Field>
          <Field label="Método de pago">
            <Select value={abonoForm.metodo_pago} onChange={(e) => setAbonoForm((s) => ({ ...s, metodo_pago: e.target.value }))}>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Observación">
            <Textarea placeholder="Observación opcional" value={abonoForm.observacion} onChange={(e) => setAbonoForm((s) => ({ ...s, observacion: e.target.value }))} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAbonoModal(null)}>
            Cancelar
          </Button>
          <Button onClick={onRegistrarAbono}>
            Guardar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
