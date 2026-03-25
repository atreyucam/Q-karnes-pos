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

export default function FacturaModal({ open, onClose, onSelectCliente }) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
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
      setNuevoNombre('');
      setSaving(false);
    }
  }, [open]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const crearYSeleccionar = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      setError('Nombre de cliente requerido');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await apiClient.post('/api/clientes', { nombre, activo: true });
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
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="bg-slate-50/50 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-emerald-700">
                <PiUsersThree className="text-2xl" />
              </div>
              <div>
                <p className="ui-page-eyebrow !text-emerald-700">Venta</p>
                <h3 className="text-lg font-extrabold leading-tight text-slate-900 sm:text-xl">Buscar cliente</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Selecciona un cliente existente o crea uno nuevo sin salir del flujo de venta.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              onClick={onClose}
              aria-label="Cerrar modal"
            >
              <PiX className="text-xl" />
            </button>
          </div>
          <div className="mt-4 h-px w-full bg-slate-200" />
        </div>

        <div className="border-b border-slate-200 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">Buscar cliente</p>
              <div className="relative max-w-[450px]">
                <PiMagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400" />
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
              onClick={() => setShowCreate((prev) => !prev)}
            >
              <PiUserPlus className="h-4 w-4" />
              {showCreate ? 'Cancelar alta' : 'Agregar nuevo cliente'}
            </Button>
          </div>

          {showCreate && (
            <div className="mt-4 grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:grid-cols-[1fr_auto]">
              <Input
                className="py-2.5 px-3"
                placeholder="Nombre del cliente"
                value={nuevoNombre}
                onChange={(event) => setNuevoNombre(event.target.value)}
              />
              <Button
                type="button"
                variant="primary"
                disabled={saving}
                onClick={crearYSeleccionar}
              >
                {saving ? 'Guardando...' : 'Crear y seleccionar'}
              </Button>
            </div>
          )}

          {error ? <Alert tone="error" className="mt-4">{error}</Alert> : null}
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-4 py-4 sm:px-6 lg:px-8">
          <Tabla className="overflow-hidden rounded-[1.35rem] border border-[#d8e2ee] shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Cliente</TablaCelda>
                <TablaCelda as="th">Nombre</TablaCelda>
                <TablaCelda as="th">Estado</TablaCelda>
                <TablaCelda as="th">Accion</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {!canSearch && (
                <TablaFila>
                  <TablaCelda colSpan={4} className="py-8 text-center text-[var(--color-text-muted)]">
                    Escribe un nombre para filtrar o selecciona un cliente de la lista.
                  </TablaCelda>
                </TablaFila>
              )}

              {canSearch && loading && (
                <TablaFila>
                  <TablaCelda colSpan={4} className="py-8 text-center text-[var(--color-text-muted)]">
                    Cargando clientes...
                  </TablaCelda>
                </TablaFila>
              )}

              {canSearch && !loading && rows.length === 0 && (
                <TablaFila>
                  <TablaCelda colSpan={4} className="py-8 text-center text-[var(--color-text-muted)]">
                    No se encontraron clientes con ese criterio.
                  </TablaCelda>
                </TablaFila>
              )}

              {canSearch && !loading && rows.map((cliente) => (
                <TablaFila key={cliente.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">#{cliente.id}</TablaCelda>
                  <TablaCelda>{cliente.nombre}</TablaCelda>
                  <TablaCelda><StatusBadge status={cliente.activo ? 'ACTIVO' : 'INACTIVO'} /></TablaCelda>
                  <TablaCelda>
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
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </div>

        <div className="border-t border-slate-200 px-4 py-4 sm:px-6 lg:px-8">
          <Paginador
            paginaActual={page}
            totalPaginas={totalPages}
            totalRegistros={canSearch ? total : 0}
            mostrarSiempre
            onPageChange={setPage}
          />
        </div>
      </div>
    </Modal>
  );
}
