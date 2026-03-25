import { useEffect, useMemo, useState } from 'react';
import { PiCheck, PiEye, PiPencilSimple, PiX } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { formatMoney } from '../../lib/formatMoney';

const PAGE_SIZE = 10;

const emptyProveedorForm = {
  id: null,
  nombre: '',
  telefono: '',
  direccion: '',
  observacion: '',
  tiene_credito: true,
  dias_pago: '15',
  activo: true
};

export default function ProveedoresPage() {
  const { proveedores, error, loading, listar, crear, actualizar } = useProveedoresStore();
  const navigate = useNavigate();

  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS' });
  const [proveedorModal, setProveedorModal] = useState({ open: false, mode: 'create' });
  const [proveedorForm, setProveedorForm] = useState(emptyProveedorForm);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateError, setDeactivateError] = useState('');
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const refreshList = () => {
    listar({
      include_cxp: 1,
      search: filtros.search || undefined,
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(refreshList, 250);
    return () => window.clearTimeout(timer);
  }, [listar, filtros]);

  const proveedoresOrdenados = useMemo(() => {
    return [...proveedores].sort((a, b) => {
      const saldoA = Number(a.saldo_pendiente || 0);
      const saldoB = Number(b.saldo_pendiente || 0);
      if (saldoB !== saldoA) return saldoB - saldoA;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    });
  }, [proveedores]);

  const totalPaginas = Math.max(1, Math.ceil(proveedoresOrdenados.length / PAGE_SIZE));
  const proveedoresPaginados = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return proveedoresOrdenados.slice(start, start + PAGE_SIZE);
  }, [pagina, proveedoresOrdenados]);

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas);
    }
  }, [pagina, totalPaginas]);

  const onChangeFiltro = (key, value) => {
    setPagina(1);
    setFiltros((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateModal = () => {
    setProveedorModal({ open: true, mode: 'create' });
    setProveedorForm({ ...emptyProveedorForm });
  };

  const openEditModal = (proveedor) => {
    setProveedorModal({ open: true, mode: 'edit' });
    setProveedorForm({
      id: proveedor.id,
      nombre: proveedor.nombre || '',
      telefono: proveedor.telefono || '',
      direccion: proveedor.direccion || '',
      observacion: proveedor.observacion || '',
      tiene_credito: Boolean(proveedor.tiene_credito),
      dias_pago: String(Number(proveedor.dias_pago || 0)),
      activo: Boolean(proveedor.activo)
    });
  };

  const closeProveedorModal = () => {
    setProveedorModal({ open: false, mode: 'create' });
    setProveedorForm({ ...emptyProveedorForm });
  };

  const onSaveProveedor = async () => {
    if (!proveedorForm.nombre.trim()) return;

    const payload = {
      nombre: proveedorForm.nombre.trim(),
      telefono: proveedorForm.telefono.trim() || null,
      direccion: proveedorForm.direccion.trim() || null,
      observacion: proveedorForm.observacion.trim() || null,
      tiene_credito: proveedorForm.tiene_credito,
      dias_pago: proveedorForm.tiene_credito ? Number(proveedorForm.dias_pago || 0) : 0,
      activo: proveedorForm.activo
    };

    try {
      if (proveedorModal.mode === 'edit' && proveedorForm.id) {
        await actualizar(proveedorForm.id, payload);
      } else {
        await crear(payload);
      }

      closeProveedorModal();
      refreshList();
    } catch (_) {
      // store error already exposed in page alert
    }
  };

  const onToggleProveedor = async (proveedor) => {
    if (proveedor.activo) {
      setDeactivateTarget(proveedor);
      return;
    }

    try {
      await actualizar(proveedor.id, { activo: true });
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
      setDeactivateError(error.message || 'El sistema no permitio desactivar este proveedor.');
    } finally {
      setDeactivateLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Proveedores"
        description="Catalogo, estado y creditos por proveedor."
        actions={(
          <Button onClick={openCreateModal}>
            Nuevo proveedor
          </Button>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_180px]">
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

          <div className="flex items-end">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setPagina(1);
                setFiltros({ search: '', estado: 'TODOS' });
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Proveedor</TablaCelda>
              <TablaCelda as="th">Telefono</TablaCelda>
              <TablaCelda as="th">Credito</TablaCelda>
              <TablaCelda as="th">Cada (dias)</TablaCelda>
              <TablaCelda as="th" className="text-right">Credito pendiente</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {proveedoresPaginados.map((proveedor) => {
              const saldoPendiente = Number(proveedor.saldo_pendiente || 0);
              return (
                <TablaFila key={proveedor.id}>
                  <TablaCelda>
                    <div className="space-y-1">
                      <p className="font-semibold text-[var(--color-text)]">{proveedor.nombre}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{proveedor.direccion || 'Sin direccion registrada'}</p>
                    </div>
                  </TablaCelda>
                  <TablaCelda>{proveedor.telefono || '-'}</TablaCelda>
                  <TablaCelda>
                    <StatusBadge tone={proveedor.tiene_credito ? 'warning' : 'neutral'}>
                      {proveedor.tiene_credito ? 'Credito' : 'Sin credito'}
                    </StatusBadge>
                  </TablaCelda>
                  <TablaCelda>{Number(proveedor.dias_pago || 0)}</TablaCelda>
                  <TablaCelda className={`text-right font-semibold ${saldoPendiente > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                    {formatMoney(saldoPendiente)}
                  </TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={proveedor.activo ? 'ACTIVO' : 'INACTIVO'} />
                  </TablaCelda>
                  <TablaCelda>
                    <div className="flex justify-end gap-1">
                      <IconButton
                        variant="iconView"
                        size="sm"
                        aria-label="Ver proveedor"
                        title="Ver proveedor"
                        onClick={() => navigate(`/proveedores/${proveedor.id}`)}
                      >
                        <PiEye className="text-lg" />
                      </IconButton>
                      <IconButton
                        variant="iconEdit"
                        size="sm"
                        aria-label="Editar proveedor"
                        title="Editar proveedor"
                        onClick={() => openEditModal(proveedor)}
                      >
                        <PiPencilSimple className="text-lg" />
                      </IconButton>
                      <IconButton
                        variant={proveedor.activo ? 'iconDanger' : 'iconSuccess'}
                        size="sm"
                        aria-label={proveedor.activo ? 'Desactivar proveedor' : 'Activar proveedor'}
                        title={proveedor.activo ? 'Desactivar proveedor' : 'Activar proveedor'}
                        onClick={() => onToggleProveedor(proveedor)}
                      >
                        {proveedor.activo ? <PiX className="text-lg" /> : <PiCheck className="text-lg" />}
                      </IconButton>
                    </div>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>

        <div className="px-5 pb-5">
          <Paginador
            paginaActual={pagina}
            totalPaginas={totalPaginas}
            totalRegistros={proveedoresOrdenados.length}
            mostrarSiempre
            onPageChange={setPagina}
          />
        </div>
      </Card>

      {loading && <LoadingState label="Cargando proveedores..." />}

      <Modal open={proveedorModal.open} onClose={closeProveedorModal} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{proveedorModal.mode === 'edit' ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Configura datos comerciales, credito y estado.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={closeProveedorModal}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Nombre</label>
            <Input
              className="mt-2"
              value={proveedorForm.nombre}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, nombre: e.target.value }))}
              placeholder="Pronaca"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Telefono</label>
            <Input
              className="mt-2"
              value={proveedorForm.telefono}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, telefono: e.target.value }))}
              placeholder="0990000000"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Direccion</label>
            <Input
              className="mt-2"
              value={proveedorForm.direccion}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, direccion: e.target.value }))}
              placeholder="Sector / calle"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cada cuantos dias se paga</label>
            <Input
              className="mt-2"
              value={proveedorForm.dias_pago}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, dias_pago: e.target.value }))}
              disabled={!proveedorForm.tiene_credito}
              placeholder="15"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observacion</label>
            <Textarea
              className="mt-2"
              value={proveedorForm.observacion}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, observacion: e.target.value }))}
              placeholder="Notas internas"
            />
          </div>

          <div>
            <Checkbox
              checked={proveedorForm.tiene_credito}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, tiene_credito: e.target.checked }))}
              label="Tiene credito"
            />
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">Habilita compras a credito y saldo pendiente.</p>
          </div>

          <div>
            <Checkbox
              checked={proveedorForm.activo}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, activo: e.target.checked }))}
              label="Proveedor activo"
            />
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">Si esta inactivo no aparece para nuevas ordenes.</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={closeProveedorModal}>
            Cancelar
          </Button>
          <Button onClick={onSaveProveedor}>
            {proveedorModal.mode === 'edit' ? 'Guardar cambios' : 'Guardar proveedor'}
          </Button>
        </div>
      </Modal>

      <DeactivateEntityDialogs
        confirmOpen={Boolean(deactivateTarget)}
        entityLabel={deactivateTarget ? `al proveedor ${deactivateTarget.nombre}` : 'este proveedor'}
        onCloseConfirm={() => setDeactivateTarget(null)}
        onConfirm={onConfirmDeactivate}
        confirmLoading={deactivateLoading}
        blockedOpen={Boolean(deactivateError)}
        blockedMessage={deactivateError}
        onCloseBlocked={() => setDeactivateError('')}
      />
    </div>
  );
}
