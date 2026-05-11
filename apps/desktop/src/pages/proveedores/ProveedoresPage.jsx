import { useEffect, useMemo, useState } from 'react';
import { PiEye, PiPencilSimple, PiPlus } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
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
} from '../../shared/ui';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { formatMoney } from '../../lib/formatMoney';
import useFormErrors from '../../shared/hooks/useFormErrors';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';

const PAGE_SIZE = GLOBAL_PAGE_SIZE;
const PHONE_REGEX = /^\d{1,10}$/;

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

function sanitizePhoneInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

const toNumber = (value) => {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '0').replace(/[^0-9.-]+/g, '');
  return Number(cleaned) || 0;
};

export default function ProveedoresPage() {
  const { proveedores, error, loading, listar, crear, actualizar, cargarFacturas, cargarResumenCxp } = useProveedoresStore();
  const navigate = useNavigate();

  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS', credito: 'TODOS' });
  const [proveedorModal, setProveedorModal] = useState({ open: false, mode: 'create' });
  const [proveedorForm, setProveedorForm] = useState(emptyProveedorForm);
  const [blockedDeactivateProveedor, setBlockedDeactivateProveedor] = useState(null);
  const [statusToast, setStatusToast] = useState('');
  const [statusToastError, setStatusToastError] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [errorToastVisible, setErrorToastVisible] = useState(false);
  const [modalDebtInfo, setModalDebtInfo] = useState({ saldo: 0, facturasPendientes: 0 });
  const proveedorFormErrors = useFormErrors();

  const refreshList = () => {
    listar({
      include_cxp: 1,
      search: filtros.search || undefined,
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado,
      tiene_credito: filtros.credito === 'TODOS' ? undefined : filtros.credito
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
    proveedorFormErrors.resetErrors();
  };

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

  const openEditModal = async (proveedor) => {
    let saldoPendiente = Number(proveedor?.saldo_pendiente || 0);
    let facturasPendientes = 0;
    try {
      const [resumen, facturasProveedor] = await Promise.all([
        cargarResumenCxp(proveedor.id),
        cargarFacturas(proveedor.id)
      ]);
      saldoPendiente = Number(resumen?.saldo || saldoPendiente || 0);
      facturasPendientes = (facturasProveedor || []).filter((factura) => Number(factura.pendiente || 0) > 0).length;
    } catch (_) {
      // fallback with list data
    }
    setModalDebtInfo({
      saldo: saldoPendiente,
      facturasPendientes
    });
    setProveedorModal({ open: true, mode: 'edit' });
    proveedorFormErrors.resetErrors();
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
    setModalDebtInfo({ saldo: 0, facturasPendientes: 0 });
    proveedorFormErrors.resetErrors();
  };

  const onSaveProveedor = async () => {
    const nextErrors = {};
    if (!proveedorForm.nombre.trim()) nextErrors.nombre = 'Este campo es obligatorio.';
    if (String(proveedorForm.telefono || '').trim() && !PHONE_REGEX.test(proveedorForm.telefono.trim())) {
      nextErrors.telefono = 'Ingresa solo números positivos, máximo 10 dígitos.';
    }
    if (proveedorForm.tiene_credito) {
      const diasPago = Number(proveedorForm.dias_pago || 0);
      if (!String(proveedorForm.dias_pago || '').trim()) nextErrors.dias_pago = 'Este campo es obligatorio.';
      else if (!Number.isInteger(diasPago) || diasPago < 0 || diasPago > 365) nextErrors.dias_pago = 'Ingresa un valor entre 0 y 365.';
    }
    if (!proveedorFormErrors.setErrors(nextErrors)) return;

    if (proveedorModal.mode === 'edit' && proveedorForm.id) {
      const proveedorActual = proveedores.find((item) => Number(item.id) === Number(proveedorForm.id));
      const saldoPendiente = Number(proveedorActual?.saldo_pendiente || 0);
      const estabaActivo = Boolean(proveedorActual?.activo);
      const quiereDesactivar = estabaActivo && !proveedorForm.activo;

      if (quiereDesactivar && saldoPendiente > 0) {
        setBlockedDeactivateProveedor(proveedorActual || { ...proveedorForm, saldo_pendiente: saldoPendiente });
        setStatusToastError('No se puede desactivar este proveedor porque mantiene deuda pendiente.');
        return;
      }
    }

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
        setStatusToast('Proveedor actualizado correctamente.');
        if (
          proveedorForm.tiene_credito !== Boolean(proveedores.find((item) => Number(item.id) === Number(proveedorForm.id))?.tiene_credito)
        ) {
          setStatusToast('Crédito del proveedor actualizado correctamente.');
        }
      } else {
        await crear(payload);
        setStatusToast('Proveedor actualizado correctamente.');
      }

      closeProveedorModal();
      refreshList();
    } catch (_) {
      setStatusToastError('Error al actualizar proveedor.');
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
        title="Proveedores"
        description="Catálogo, estado y créditos por proveedor."
        actions={(
          <Button onClick={openCreateModal}>
            <PiPlus className="text-base" />
            Nuevo proveedor
          </Button>
        )}
      />

      {error && (
        <Alert tone="error">
          {error}
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
              setPagina(1);
              setFiltros({ search: '', estado: 'TODOS', credito: 'TODOS' });
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
            <option value="1">Con crédito</option>
            <option value="0">Sin crédito</option>
          </Select>
        </Field>
      </FiltersBar>

      <Card className="overflow-hidden p-0">
        {proveedoresOrdenados.length === 0 && !loading ? (
          <div className="p-5">
            <EmptyState
              title="Sin proveedores"
              description="No hay proveedores para los filtros actuales."
            />
          </div>
        ) : (
          <>
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Proveedor</TablaCelda>
                  <TablaCelda as="th">Contacto</TablaCelda>
                  <TablaCelda as="th">Crédito</TablaCelda>
                  <TablaCelda as="th">Pago cada</TablaCelda>
                  <TablaCelda as="th" className="text-right">Deuda</TablaCelda>
                  <TablaCelda as="th">Estado</TablaCelda>
                  <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {proveedoresPaginados.map((proveedor) => {
                  const saldoPendiente = toNumber(
                    proveedor.saldo_pendiente
                    ?? proveedor.saldoPendiente
                    ?? proveedor.credito_pendiente
                    ?? proveedor.creditoPendiente
                  );
                  const diasPago = Number(proveedor.dias_pago || 0);
                  const pagoCadaText = Number.isFinite(diasPago) && diasPago > 0 ? `${diasPago} días` : '—';
                  const tieneDeuda = saldoPendiente > 0;
                  return (
                    <TablaFila key={proveedor.id}>
                      <TablaCelda className="py-3">
                        <p className="font-semibold text-[var(--color-text)]">{proveedor.nombre}</p>
                      </TablaCelda>
                      <TablaCelda className="py-3">{proveedor.telefono || '-'}</TablaCelda>
                      <TablaCelda className="py-3">
                        {proveedor.tiene_credito ? (
                          <StatusBadge tone="warning">Crédito</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">Sin crédito</StatusBadge>
                        )}
                      </TablaCelda>
                      <TablaCelda className="py-3">{pagoCadaText}</TablaCelda>
                      <TablaCelda className="py-3 text-right">
                        {tieneDeuda ? (
                          <StatusBadge tone="warning">Pendiente {formatMoney(saldoPendiente)}</StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">Sin deuda</StatusBadge>
                        )}
                      </TablaCelda>
                      <TablaCelda className="py-3">
                        {proveedor.activo ? (
                          <StatusBadge status="ACTIVO" />
                        ) : (
                          <StatusBadge status="INACTIVO" />
                        )}
                      </TablaCelda>
                      <TablaCelda className="py-3">
                        <div className="flex justify-end">
                          <TableActions>
                          <TableActionButton
                            variant="view"
                            icon={<PiEye />}
                            aria-label="Ver proveedor"
                            title="Ver proveedor"
                            onClick={() => navigate(`/proveedores/${proveedor.id}`)}
                          >
                            Ver
                          </TableActionButton>
                          <TableActionButton
                            variant="edit"
                            icon={<PiPencilSimple />}
                            aria-label="Editar proveedor"
                            title="Editar proveedor"
                            onClick={() => openEditModal(proveedor)}
                          >
                            Editar
                          </TableActionButton>
                          </TableActions>
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
          </>
        )}
  </Card>

      {loading && <LoadingState label="Cargando proveedores..." />}

      <Modal open={proveedorModal.open} onClose={closeProveedorModal} maxWidthClass="max-w-4xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{proveedorModal.mode === 'edit' ? 'Editar proveedor' : 'Nuevo proveedor'}</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Configura datos comerciales, crédito y estado del proveedor.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={closeProveedorModal}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Nombre" required error={proveedorFormErrors.errors.nombre}>
            <Input
              className="bg-[var(--color-surface)]"
              value={proveedorForm.nombre}
              onChange={(e) => {
                proveedorFormErrors.clearFieldError('nombre');
                setProveedorForm((prev) => ({ ...prev, nombre: e.target.value }));
              }}
              placeholder="Pronaca"
            />
          </Field>

          <Field label="Teléfono" error={proveedorFormErrors.errors.telefono}>
            <Input
              className="bg-[var(--color-surface)]"
              value={proveedorForm.telefono}
              inputMode="numeric"
              onChange={(e) => {
                proveedorFormErrors.clearFieldError('telefono');
                setProveedorForm((prev) => ({ ...prev, telefono: sanitizePhoneInput(e.target.value) }));
              }}
              placeholder="0990000000"
            />
          </Field>

          <Field label="Dirección" className="md:col-span-2">
            <Input
              className="bg-[var(--color-surface)]"
              value={proveedorForm.direccion}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, direccion: e.target.value }))}
              placeholder="Sector / calle"
            />
          </Field>

          <Field label="Días de pago" hint="Solo aplica cuando compras a crédito está activo." error={proveedorFormErrors.errors.dias_pago}>
            <Input
              className={
                !proveedorForm.tiene_credito
                  ? 'bg-[var(--color-surface-muted)] text-[var(--color-text-subtle)]'
                  : 'bg-[var(--color-surface)]'
              }
              value={proveedorForm.dias_pago}
              onChange={(e) => {
                proveedorFormErrors.clearFieldError('dias_pago');
                const cleaned = String(e.target.value || '').replace(/\D/g, '');
                setProveedorForm((prev) => ({ ...prev, dias_pago: cleaned }));
              }}
              disabled={!proveedorForm.tiene_credito}
              inputMode="numeric"
              placeholder="15"
            />
          </Field>

          <Field label="Observación" className="md:col-span-2">
            <Textarea
              className="bg-[var(--color-surface)]"
              value={proveedorForm.observacion}
              onChange={(e) => setProveedorForm((prev) => ({ ...prev, observacion: e.target.value }))}
              placeholder="Notas internas"
            />
          </Field>

          <div className="md:col-span-2 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Configuración comercial</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
                <Switch
                  checked={proveedorForm.activo}
                  onChange={(checked) => setProveedorForm((prev) => ({ ...prev, activo: checked }))}
                  label="Proveedor activo"
                  description="Si está inactivo no aparece como opción para nuevas compras."
                />
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
                <Switch
                  checked={proveedorForm.tiene_credito}
                  onChange={(checked) => setProveedorForm((prev) => ({ ...prev, tiene_credito: checked }))}
                  label="Compras a crédito"
                  description="Permite registrar nuevas compras con saldo pendiente."
                />
              </div>
            </div>
            {Number(modalDebtInfo.saldo || 0) > 0 || Number(modalDebtInfo.facturasPendientes || 0) > 0 ? (
              <div className="rounded-xl border border-[#F5D08A] bg-[#FFF7E6] p-3 text-sm text-[#9A6700]">
                <p>Deuda pendiente actual: ${Number(modalDebtInfo.saldo || 0).toFixed(2)}</p>
                <p>Facturas pendientes: {Number(modalDebtInfo.facturasPendientes || 0)}</p>
                <p>Desactivar esta opción solo impedirá nuevas compras a crédito. Las cuentas pendientes seguirán activas.</p>
              </div>
            ) : null}
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

      <Modal open={Boolean(blockedDeactivateProveedor)} onClose={() => setBlockedDeactivateProveedor(null)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text)]">No se puede desactivar este proveedor porque mantiene deuda pendiente.</p>
          <div className="rounded-lg border border-[var(--color-danger-soft)] bg-[color-mix(in_oklab,var(--color-danger-soft)_82%,white_18%)] p-3 text-sm text-[var(--color-text)]">
            Saldo pendiente actual: <strong className="text-[var(--color-danger)]">{formatMoney(blockedDeactivateProveedor?.saldo_pendiente || 0)}</strong>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="danger" onClick={() => setBlockedDeactivateProveedor(null)}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
