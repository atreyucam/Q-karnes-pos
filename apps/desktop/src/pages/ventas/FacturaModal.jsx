import { useEffect, useMemo, useState } from 'react';
import { PiMagnifyingGlass, PiUserPlus, PiUsersThree, PiX } from 'react-icons/pi';
import apiClient from '../../lib/apiClient';
import {
  Alert,
  Button,
  Input,
  Modal,
  Paginador,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../shared/ui';
import { uiClassTokens } from '../../shared/tokens/uiClassTokens';

const PAGE_SIZE = 8;
const MIN_SEARCH_LENGTH = 0;
const emptyClienteForm = {
  nombre: '',
  telefono: '',
  direccion: '',
  activo: true
};

export default function FacturaModal({ open, onClose, onSelectCliente }) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [nuevoClienteForm, setNuevoClienteForm] = useState(emptyClienteForm);
  const [saving, setSaving] = useState(false);

  const canSearch = debouncedSearch.length >= MIN_SEARCH_LENGTH;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!open) return;

    async function loadClientes() {
      setLoading(true);
      setError('');
      try {
        const offset = (page - 1) * PAGE_SIZE;
        const response = await apiClient.get('/api/clientes', {
          params: {
            search: debouncedSearch || undefined,
            limit: PAGE_SIZE,
            offset
          }
        });

        const payload = response.data || {};
        setRows(payload.data || []);
        setTotal(Number(payload.meta?.total || 0));
      } catch (e) {
        setError(e?.response?.data?.error || 'No se pudo cargar clientes');
      } finally {
        setLoading(false);
      }
    }

    loadClientes();
  }, [open, canSearch, debouncedSearch, page]);

  useEffect(() => {
    if (!open) {
      setSearchInput('');
      setDebouncedSearch('');
      setPage(1);
      setRows([]);
      setTotal(0);
      setError('');
      setShowCreate(false);
      setNuevoClienteForm(emptyClienteForm);
      setSaving(false);
    }
  }, [open]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const crearYSeleccionar = async () => {
    const nombre = nuevoClienteForm.nombre.trim();
    if (!nombre) {
      setError('Nombre de cliente requerido');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await apiClient.post('/api/clientes', {
        nombre,
        telefono: nuevoClienteForm.telefono.trim() || null,
        direccion: nuevoClienteForm.direccion.trim() || null,
        activo: nuevoClienteForm.activo
      });
      const cliente = response.data?.data || response.data;
      onSelectCliente(cliente);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || 'No se pudo crear cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidthClass={uiClassTokens.modal.width.large} panelClassName="p-0">
      <div className="flex min-h-0 flex-1 flex-col bg-surface">
        <div className="bg-background px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="rounded-xl border border-success bg-success-soft p-2 text-success">
                <PiUsersThree className="text-2xl" />
              </div>
              <div>
                <p className="ui-page-eyebrow !text-success">Venta</p>
                <h3 className="text-lg font-extrabold leading-tight text-text sm:text-xl">Buscar cliente</h3>
                <p className="mt-0.5 text-sm text-text-muted">
                  Selecciona un cliente existente o crea uno nuevo sin salir del flujo de venta.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-subtle hover:bg-surface-alt hover:text-text-muted"
              onClick={onClose}
              aria-label="Cerrar modal"
            >
              <PiX className="text-xl" />
            </button>
          </div>
          <div className="mt-4 h-px w-full bg-surface-alt" />
        </div>

        <div className="border-b border-border px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">Buscar cliente</p>
              <div className="relative max-w-[450px]">
                <PiMagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-text-subtle" />
                <Input
                  className="py-2.5 pl-10 pr-3"
                  placeholder="Nombre, RUC, telefono..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={() => setShowCreate(true)}
            >
              <PiUserPlus className="h-4 w-4" />
              Agregar nuevo cliente
            </Button>
          </div>

          {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-4 py-4 sm:px-6 lg:px-8">
          <Tabla className="overflow-hidden rounded-[1.35rem] border border-border shadow-posSm">
            <TablaCabecera>
              <tr>
                <TablaCelda as="th" className="w-[90px]">ID</TablaCelda>
                <TablaCelda as="th">Cliente</TablaCelda>
                <TablaCelda as="th">Teléfono</TablaCelda>
                <TablaCelda as="th">Estado</TablaCelda>
                <TablaCelda as="th" className="text-right">Acción</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {!canSearch && (
                <TablaFila>
                  <TablaCelda colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">
                    Escribe un nombre para filtrar o selecciona un cliente de la lista.
                  </TablaCelda>
                </TablaFila>
              )}

              {canSearch && loading && (
                <TablaFila>
                  <TablaCelda colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">
                    Cargando clientes...
                  </TablaCelda>
                </TablaFila>
              )}

              {canSearch && !loading && rows.length === 0 && (
                <TablaFila>
                  <TablaCelda colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">
                    No se encontraron clientes con ese criterio.
                  </TablaCelda>
                </TablaFila>
              )}

              {canSearch && !loading && rows.map((cliente) => (
                <TablaFila key={cliente.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">#{cliente.id}</TablaCelda>
                  <TablaCelda className="font-medium text-[var(--color-text)]">{cliente.nombre}</TablaCelda>
                  <TablaCelda>{cliente.telefono || '-'}</TablaCelda>
                  <TablaCelda><StatusBadge status={cliente.activo ? 'ACTIVO' : 'INACTIVO'} /></TablaCelda>
                  <TablaCelda className="text-right">
                    <div className="flex justify-end">
                      <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="rounded-2xl px-5"
                      disabled={!cliente.activo}
                      onClick={() => {
                        onSelectCliente(cliente);
                        onClose();
                      }}
                    >
                      Seleccionar
                    </Button>
                    </div>
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </div>

        <div className="border-t border-border px-4 py-4 sm:px-6 lg:px-8">
          <Paginador
            paginaActual={page}
            totalPaginas={totalPages}
            totalRegistros={canSearch ? total : 0}
            mostrarSiempre
            onPageChange={setPage}
          />
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} maxWidthClass="max-w-4xl" panelClassName="p-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Nuevo cliente</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Crea el cliente y selecciónalo inmediatamente para la factura.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              X
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-[var(--color-text)]">Nombre</label>
                <Input
                  className="mt-2"
                  value={nuevoClienteForm.nombre}
                  onChange={(event) => setNuevoClienteForm((state) => ({ ...state, nombre: event.target.value }))}
                  placeholder="Nombre del cliente"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--color-text)]">Teléfono</label>
                <Input
                  className="mt-2"
                  value={nuevoClienteForm.telefono}
                  onChange={(event) => setNuevoClienteForm((state) => ({ ...state, telefono: event.target.value }))}
                  placeholder="0990000000"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-[var(--color-text)]">Dirección (opcional)</label>
                <Input
                  className="mt-2"
                  value={nuevoClienteForm.direccion}
                  onChange={(event) => setNuevoClienteForm((state) => ({ ...state, direccion: event.target.value }))}
                  placeholder="Sector / calle"
                />
              </div>
              <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 text-sm font-medium text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={nuevoClienteForm.activo}
                  onChange={(event) => setNuevoClienteForm((state) => ({ ...state, activo: event.target.checked }))}
                />
                Cliente activo
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" disabled={saving} onClick={crearYSeleccionar}>
              {saving ? 'Guardando...' : 'Crear y seleccionar'}
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
