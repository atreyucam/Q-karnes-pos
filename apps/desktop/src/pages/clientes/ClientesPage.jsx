import { useEffect, useMemo, useState } from 'react';
import { PiCheck, PiCurrencyDollar, PiEye, PiPencilSimple, PiPlus, PiX } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  DeactivateEntityDialogs,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Paginador,
  Select,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../ui';
import { useClientesStore } from '../../stores/clientesStore';
import { formatMoney } from '../../lib/formatMoney';

const PAGE_SIZE = 10;

const emptyClienteForm = {
  id: null,
  nombre: '',
  telefono: '',
  direccion: '',
  observacion: '',
  activo: true
};

export default function ClientesPage() {
  const { clientes, meta, error, loading, listar, crear, actualizar, abonar } = useClientesStore();
  const navigate = useNavigate();

  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS', credito: 'TODOS' });
  const [clienteModal, setClienteModal] = useState({ open: false, mode: 'create' });
  const [clienteForm, setClienteForm] = useState(emptyClienteForm);
  const [abonoModal, setAbonoModal] = useState(null);
  const [abonoForm, setAbonoForm] = useState({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateError, setDeactivateError] = useState('');
  const [deactivateLoading, setDeactivateLoading] = useState(false);

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
  };

  const openEditModal = (cliente) => {
    setClienteModal({ open: true, mode: 'edit' });
    setClienteForm({
      id: cliente.id,
      nombre: cliente.nombre || '',
      telefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      observacion: cliente.observacion || '',
      activo: Boolean(cliente.activo)
    });
  };

  const closeClienteModal = () => {
    setClienteModal({ open: false, mode: 'create' });
    setClienteForm({ ...emptyClienteForm });
  };

  const onSaveCliente = async () => {
    if (!clienteForm.nombre.trim()) return;

    const payload = {
      nombre: clienteForm.nombre.trim(),
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
    await abonar(abonoModal.id, {
      monto: Number(abonoForm.monto || 0),
      metodo_pago: abonoForm.metodo_pago,
      observacion: abonoForm.observacion || undefined
    });

    setAbonoModal(null);
    setAbonoForm({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
    refreshList();
  };

  const onToggleCliente = async (cliente) => {
    if (cliente.activo) {
      setDeactivateTarget(cliente);
      return;
    }

    try {
      await actualizar(cliente.id, { activo: true });
      refreshList();
    } catch (_) {
      // store error already exposed in page alert
    }
  };

  const onConfirmDeactivate = async () => {
    if (!deactivateTarget) return;

    setDeactivateLoading(true);
    try {
      await actualizar(deactivateTarget.id, { activo: false });
      setDeactivateTarget(null);
      refreshList();
    } catch (error) {
      setDeactivateTarget(null);
      setDeactivateError(error.message || 'El sistema no permitio desactivar este cliente.');
    } finally {
      setDeactivateLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientes y credito"
        description="Gestion de clientes, estado y cartera."
        actions={(
          <Button onClick={openCreateModal}>
            <PiPlus className="text-base" />
            Nuevo cliente
          </Button>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_190px] xl:grid-cols-[minmax(0,1fr)_190px_190px_180px]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Buscar</label>
            <Input
              className="mt-2"
              value={filtros.search}
              onChange={(e) => onChangeFiltro('search', e.target.value)}
              placeholder="Nombre, telefono o direccion"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</label>
            <Select
              className="mt-2"
              value={filtros.estado}
              onChange={(e) => onChangeFiltro('estado', e.target.value)}
            >
              <option value="TODOS">Todos</option>
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Credito</label>
            <Select
              className="mt-2"
              value={filtros.credito}
              onChange={(e) => onChangeFiltro('credito', e.target.value)}
            >
              <option value="TODOS">Todos</option>
              <option value="CON">Con credito</option>
              <option value="SIN">Sin credito</option>
            </Select>
          </div>

          <div className="flex items-end xl:justify-end">
            <Button variant="secondary" className="w-full xl:w-auto" onClick={() => setFiltros({ search: '', estado: 'TODOS', credito: 'TODOS' })}>
              Limpiar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">ID</TablaCelda>
              <TablaCelda as="th">Cliente</TablaCelda>
              <TablaCelda as="th">Telefono</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th" className="text-right">Credito pendiente</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {clientesOrdenados.map((c) => {
              const saldoCredito = Number(c.saldo_credito || 0);
              const sinSaldo = saldoCredito <= 0;
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
                  <TablaCelda>
                    <StatusBadge status={c.activo ? 'ACTIVO' : 'INACTIVO'} />
                  </TablaCelda>
                  <TablaCelda className={`text-right font-semibold ${saldoCredito > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                    {formatMoney(saldoCredito)}
                  </TablaCelda>
                  <TablaCelda>
                    <div className="flex justify-end gap-1">
                      <IconButton
                        variant="iconView"
                        size="sm"
                        aria-label="Ver cliente"
                        title="Ver cliente"
                        onClick={() => navigate(`/clientes/${c.id}`)}
                      >
                        <PiEye className="text-lg" />
                      </IconButton>
                      <IconButton
                        variant="iconSecondary"
                        size="sm"
                        aria-label="Registrar abono"
                        title={sinSaldo ? 'Sin saldo pendiente' : 'Registrar abono'}
                        disabled={sinSaldo}
                        onClick={() => {
                          setAbonoModal(c);
                          setAbonoForm({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
                        }}
                      >
                        <PiCurrencyDollar className="text-lg" />
                      </IconButton>
                      <IconButton
                        variant="iconEdit"
                        size="sm"
                        aria-label="Editar cliente"
                        title="Editar cliente"
                        onClick={() => openEditModal(c)}
                      >
                        <PiPencilSimple className="text-lg" />
                      </IconButton>
                      <IconButton
                        variant={c.activo ? 'iconDanger' : 'iconSuccess'}
                        size="sm"
                        aria-label={c.activo ? 'Desactivar cliente' : 'Activar cliente'}
                        title={c.activo ? 'Desactivar cliente' : 'Activar cliente'}
                        onClick={() => onToggleCliente(c)}
                      >
                        {c.activo ? <PiX className="text-lg" /> : <PiCheck className="text-lg" />}
                      </IconButton>
                    </div>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{clienteModal.mode === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Registra o actualiza clientes para ventas y credito.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={closeClienteModal}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]">Nombre</label>
              <Input
                className="mt-2"
                value={clienteForm.nombre}
                onChange={(e) => setClienteForm((s) => ({ ...s, nombre: e.target.value }))}
                placeholder="Ej: Restaurante El Buen Sabor"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[var(--color-text)]">Telefono</label>
              <Input
                className="mt-2"
                value={clienteForm.telefono}
                onChange={(e) => setClienteForm((s) => ({ ...s, telefono: e.target.value }))}
                placeholder="0990000000"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]">Direccion</label>
              <Input
                className="mt-2"
                value={clienteForm.direccion}
                onChange={(e) => setClienteForm((s) => ({ ...s, direccion: e.target.value }))}
                placeholder="Sector / calle"
              />
            </div>

            <div className="pt-6">
              <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 text-sm font-medium text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={clienteForm.activo}
                  onChange={(e) => setClienteForm((s) => ({ ...s, activo: e.target.checked }))}
                />
                Cliente activo
              </label>
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="text-sm font-medium text-[var(--color-text)]">Observacion</label>
            <Textarea
              className="mt-2"
              value={clienteForm.observacion}
              onChange={(e) => setClienteForm((s) => ({ ...s, observacion: e.target.value }))}
              placeholder="Notas del cliente"
            />
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

      <DeactivateEntityDialogs
        confirmOpen={Boolean(deactivateTarget)}
        entityLabel={deactivateTarget ? `al cliente ${deactivateTarget.nombre}` : 'este cliente'}
        onCloseConfirm={() => setDeactivateTarget(null)}
        onConfirm={onConfirmDeactivate}
        confirmLoading={deactivateLoading}
        blockedOpen={Boolean(deactivateError)}
        blockedMessage={deactivateError}
        onCloseBlocked={() => setDeactivateError('')}
      />

      <Modal open={Boolean(abonoModal)} onClose={() => setAbonoModal(null)} maxWidthClass="max-w-md" panelClassName="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Registrar abono</h3>
            <p className="text-xl font-bold text-[var(--color-text)]">{abonoModal?.nombre}</p>
            <p className="text-base font-semibold text-[var(--color-text-muted)]">Saldo actual: {formatMoney(abonoModal?.saldo_credito)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAbonoModal(null)}>
            X
          </Button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Input placeholder="Valor" value={abonoForm.monto} onChange={(e) => setAbonoForm((s) => ({ ...s, monto: e.target.value }))} />
          <Select value={abonoForm.metodo_pago} onChange={(e) => setAbonoForm((s) => ({ ...s, metodo_pago: e.target.value }))}>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
          </Select>
        </div>
        <div className="mt-3">
          <Textarea placeholder="Observacion" value={abonoForm.observacion} onChange={(e) => setAbonoForm((s) => ({ ...s, observacion: e.target.value }))} />
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
