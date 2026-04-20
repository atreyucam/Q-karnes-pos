import { useEffect, useMemo, useState } from 'react';
import { PiMagnifyingGlass } from 'react-icons/pi';
import apiClient from '../../lib/apiClient';
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Paginador,
  StatusBadge,
  Switch,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../shared/ui';
import { uiClassTokens } from '../../shared/tokens/uiClassTokens';
import useFormErrors from '../../shared/hooks/useFormErrors';

const PAGE_SIZE = 8;
const MIN_SEARCH_LENGTH = 0;
const emptyClienteForm = {
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
  const createFormErrors = useFormErrors();

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
      createFormErrors.resetErrors();
    }
  }, [open]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const crearYSeleccionar = async () => {
    const nombre = nuevoClienteForm.nombre.trim();
    const cedula = nuevoClienteForm.cedula.trim();
    const nextErrors = {};
    if (!nombre) nextErrors.nombre = 'Este campo es obligatorio.';
    if (cedula && !/^\d{10}$/.test(cedula)) nextErrors.cedula = 'La cédula debe tener 10 dígitos numéricos.';
    if (!createFormErrors.setErrors(nextErrors)) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      const response = await apiClient.post('/api/clientes', {
        nombre,
        cedula: cedula || null,
        telefono: nuevoClienteForm.telefono.trim() || null,
        direccion: nuevoClienteForm.direccion.trim() || null,
        observacion: nuevoClienteForm.observacion.trim() || null,
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
        <div className="ui-modal-header !mx-0 px-4 py-4 sm:px-6 lg:px-8">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Buscar cliente</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              Selecciona un cliente existente o crea uno nuevo sin salir del flujo de venta.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={onClose}>
            X
          </Button>
        </div>

        <div className="border-b border-border px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-text-muted">Buscar cliente</p>
              <div className="relative max-w-[450px]">
                <PiMagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-text-subtle" />
                <Input
                  className="py-2.5 pl-10 pr-3"
                  placeholder="Nombre, cédula, teléfono..."
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
              + nuevo cliente
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
          <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Nuevo cliente</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Registra o actualiza clientes para ventas y crédito.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setShowCreate(false)}>
              X
            </Button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="Nombre" required error={createFormErrors.errors.nombre}>
                <Input
                  value={nuevoClienteForm.nombre}
                  onChange={(event) => {
                    createFormErrors.clearFieldError('nombre');
                    setNuevoClienteForm((state) => ({ ...state, nombre: event.target.value }));
                  }}
                  placeholder="Nombre del cliente"
                />
              </Field>

              <Field label="Cédula" error={createFormErrors.errors.cedula}>
                <Input
                  inputMode="numeric"
                  value={nuevoClienteForm.cedula}
                  onChange={(event) => {
                    createFormErrors.clearFieldError('cedula');
                    setNuevoClienteForm((state) => ({ ...state, cedula: sanitizeCedulaInput(event.target.value) }));
                  }}
                  placeholder="0123456789"
                />
              </Field>

              <Field label="Teléfono">
                <Input
                  value={nuevoClienteForm.telefono}
                  onChange={(event) => setNuevoClienteForm((state) => ({ ...state, telefono: event.target.value }))}
                  placeholder="0990000000"
                />
              </Field>
            </div>

            <div className="space-y-4">
              <Field label="Dirección">
                <Input
                  value={nuevoClienteForm.direccion}
                  onChange={(event) => setNuevoClienteForm((state) => ({ ...state, direccion: event.target.value }))}
                  placeholder="Sector / calle"
                />
              </Field>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
                <Switch
                  checked={nuevoClienteForm.activo}
                  onChange={(checked) => setNuevoClienteForm((state) => ({ ...state, activo: checked }))}
                  label="Cliente activo"
                  description="Si está inactivo no aparecerá como opción para nuevas ventas."
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <Field label="Observación">
                <Textarea
                  value={nuevoClienteForm.observacion}
                  onChange={(event) => setNuevoClienteForm((state) => ({ ...state, observacion: event.target.value }))}
                  placeholder="Notas del cliente"
                />
              </Field>
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
