import { useEffect, useMemo, useState } from 'react';
import apiClient from '../../lib/apiClient';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';

const PAGE_SIZE = 8;
const MIN_SEARCH_LENGTH = 2;

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

    if (!canSearch) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    async function loadClientes() {
      setLoading(true);
      setError('');
      try {
        const offset = (page - 1) * PAGE_SIZE;
        const response = await apiClient.get('/api/clientes', {
          params: {
            search: debouncedSearch,
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

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[min(900px,calc(100vw-32px))] max-w-3xl max-h-[calc(100vh-32px)] rounded-2xl border border-slate-200 bg-white shadow-lg flex flex-col min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-800">Factura - Seleccionar cliente</h3>
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={onClose}>
              X
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Buscar cliente..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button
              type="button"
              className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
              onClick={() => setShowCreate((prev) => !prev)}
            >
              {showCreate ? 'Cancelar' : 'Agregar cliente'}
            </button>
          </div>

          {showCreate && (
            <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto]">
              <input
                className="rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Nombre del cliente"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
              />
              <button
                type="button"
                disabled={saving}
                onClick={crearYSeleccionar}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Crear y seleccionar'}
              </button>
            </div>
          )}

          {error && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4">
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">ID</TablaCelda>
                <TablaCelda as="th">Nombre</TablaCelda>
                <TablaCelda as="th">Estado</TablaCelda>
                <TablaCelda as="th">Seleccionar</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {!canSearch && (
                <TablaFila>
                  <TablaCelda colSpan={4} className="text-center text-slate-500">
                    Busca al cliente
                  </TablaCelda>
                </TablaFila>
              )}

              {canSearch && loading && (
                <TablaFila>
                  <TablaCelda colSpan={4} className="text-center text-slate-500">
                    Cargando clientes...
                  </TablaCelda>
                </TablaFila>
              )}

              {canSearch && !loading && rows.length === 0 && (
                <TablaFila>
                  <TablaCelda colSpan={4} className="text-center text-slate-500">
                    Sin resultados
                  </TablaCelda>
                </TablaFila>
              )}

              {canSearch && !loading && rows.map((cliente) => (
                <TablaFila key={cliente.id}>
                  <TablaCelda>#{cliente.id}</TablaCelda>
                  <TablaCelda>{cliente.nombre}</TablaCelda>
                  <TablaCelda>{cliente.activo ? 'ACTIVO' : 'INACTIVO'}</TablaCelda>
                  <TablaCelda>
                    <button
                      type="button"
                      disabled={!cliente.activo}
                      onClick={() => {
                        onSelectCliente(cliente);
                        onClose();
                      }}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40"
                    >
                      Elegir
                    </button>
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-4 pb-4">
          <Paginador
            paginaActual={page}
            totalPaginas={totalPages}
            totalRegistros={canSearch ? total : 0}
            mostrarSiempre
            onPageChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}
