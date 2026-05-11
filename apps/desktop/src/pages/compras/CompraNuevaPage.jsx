import { useEffect, useMemo, useState } from 'react';
import { PiMagnifyingGlass, PiPlus } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { parseApiError } from '../../lib/apiClient';
import { Alert, BackButton, Button, EmptyState, Field, Input, Modal, Paginador, Select, Tabla, TablaCabecera, TablaCuerpo, TablaCelda, TablaFila, Toast } from '../../ui';
import { useComprasStore } from '../../stores/comprasStore';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { getUnidad, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';
import { fetchCategorias, fetchProductosActivos } from '../../services/catalogoService';
import useFormErrors from '../../shared/hooks/useFormErrors';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';

const emptyProveedorForm = { nombre: '', telefono: '', direccion: '', dias_pago: '15' };
const emptyProductoForm = { nombre: '', categoria_id: '', unidad_medida: 'UND', precio_referencia: '0' };
const MODAL_PAGE_SIZE = GLOBAL_PAGE_SIZE;

function getTodayInEcuador() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function parseQtyByUnit(value, unidad) {
  const unit = getUnidad(unidad);
  if (unit === 'UND') {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function validateItem(item) {
  const unidad = getUnidad(item.unidad);
  const cantidad = parseQtyByUnit(item.cantidadInput, unidad);
  const cantidadError = !String(item.cantidadInput || '').trim()
    ? 'Cantidad requerida.'
    : !Number.isFinite(cantidad) || cantidad <= 0
      ? 'Debe ser mayor a cero.'
      : unidad === 'UND' && !Number.isInteger(cantidad)
        ? 'UND solo acepta enteros.'
        : '';
  return { cantidad, cantidadError };
}

function labelClassName() {
  return 'text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]';
}

function sectionTitleClassName() {
  return 'text-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-text)]';
}

export default function CompraNuevaPage() {
  const navigate = useNavigate();
  const { crearOrden, crearProducto, errorMeta } = useComprasStore();
  const { proveedores, listar: listarProveedores, crear: crearProveedor } = useProveedoresStore();
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [proveedorId, setProveedorId] = useState('');
  const [fechaEmision, setFechaEmision] = useState(getTodayInEcuador());
  const [observacion, setObservacion] = useState('');
  const [items, setItems] = useState([]);
  const [localError, setLocalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState(null);
  const [showProveedorPicker, setShowProveedorPicker] = useState(false);
  const [showProveedorCreate, setShowProveedorCreate] = useState(false);
  const [showProductoPicker, setShowProductoPicker] = useState(false);
  const [showProductoCreate, setShowProductoCreate] = useState(false);
  const [proveedorSearch, setProveedorSearch] = useState('');
  const [productoSearch, setProductoSearch] = useState('');
  const [productoCategoria, setProductoCategoria] = useState('TODAS');
  const [proveedorPage, setProveedorPage] = useState(1);
  const [productoPage, setProductoPage] = useState(1);
  const [proveedorNuevo, setProveedorNuevo] = useState(emptyProveedorForm);
  const [productoNuevo, setProductoNuevo] = useState(emptyProductoForm);
  const [productToast, setProductToast] = useState('');
  const proveedorFormErrors = useFormErrors();
  const productoFormErrors = useFormErrors();

  const proveedorSeleccionado = useMemo(() => proveedores.find((p) => Number(p.id) === Number(proveedorId)) || null, [proveedorId, proveedores]);
  const lineErrors = errorMeta?.details?.lines || [];

  useEffect(() => {
    listarProveedores({ include_cxp: 1, activo: 1 });
    Promise.all([fetchProductosActivos(), fetchCategorias()])
      .then(([nextProductos, nextCategorias]) => {
        setProductos(nextProductos);
        setCategorias(nextCategorias);
      })
      .catch((nextError) => setLocalError(parseApiError(nextError) || 'No se pudo cargar catálogos'));
  }, [listarProveedores]);

  useEffect(() => setProveedorPage(1), [proveedorSearch, showProveedorPicker]);
  useEffect(() => setProductoPage(1), [productoSearch, productoCategoria, showProductoPicker]);
  useEffect(() => {
    if (!productToast) return undefined;
    const timer = window.setTimeout(() => setProductToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [productToast]);

  const proveedoresFiltrados = useMemo(() => {
    const q = proveedorSearch.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter((p) => [p.nombre, p.telefono, p.direccion].some((value) => String(value || '').toLowerCase().includes(q)));
  }, [proveedorSearch, proveedores]);

  const productosFiltrados = useMemo(() => {
    const q = productoSearch.trim().toLowerCase();
    return productos.filter((producto) => {
      const matchesSearch = !q || [producto.codigo, producto.nombre, producto.categoria_nombre].some((value) => String(value || '').toLowerCase().includes(q));
      const matchesCategory = productoCategoria === 'TODAS' || String(producto.categoria_id || '') === productoCategoria;
      return matchesSearch && matchesCategory;
    });
  }, [productoCategoria, productoSearch, productos]);

  const proveedoresTotalPaginas = Math.max(1, Math.ceil(proveedoresFiltrados.length / MODAL_PAGE_SIZE));
  const proveedoresPaginados = useMemo(() => proveedoresFiltrados.slice((proveedorPage - 1) * MODAL_PAGE_SIZE, proveedorPage * MODAL_PAGE_SIZE), [proveedorPage, proveedoresFiltrados]);
  const productosTotalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / MODAL_PAGE_SIZE));
  const productosPaginados = useMemo(() => productosFiltrados.slice((productoPage - 1) * MODAL_PAGE_SIZE, productoPage * MODAL_PAGE_SIZE), [productoPage, productosFiltrados]);

  const totals = useMemo(() => items.reduce((acc, item) => {
    const next = validateItem(item);
    return {
      validRows: acc.validRows + (next.cantidadError ? 0 : 1),
      invalidRows: acc.invalidRows + (next.cantidadError ? 1 : 0)
    };
  }, { validRows: 0, invalidRows: 0 }), [items]);

  const addItem = (producto) => {
    const unidad = getUnidad(producto.unidad_medida || producto.unidad);
    setItems((prev) => prev.some((item) => item.producto_id === producto.id)
      ? prev.map((item) => item.producto_id === producto.id
        ? { ...item, cantidadInput: unidad === 'UND' ? String((Number(item.cantidadInput) || 0) + 1) : Number((Number(item.cantidadInput) || 0) + 1).toFixed(2) }
        : item)
      : [...prev, { producto_id: producto.id, codigo: producto.codigo, nombre: producto.nombre, unidad, cantidadInput: unidad === 'UND' ? '1' : '1.00' }]);
    setProductToast(`${producto.nombre} agregado correctamente.`);
  };

  const updateItem = (index, key, value) => {
    setItems((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (key === 'cantidadInput') return { ...item, cantidadInput: sanitizeQtyInput(value, item.unidad) };
      return item;
    }));
  };

  const onGuardarOrden = async () => {
    setLocalError('');
    if (!proveedorId) return setLocalError('Selecciona un proveedor antes de guardar.');
    if (!items.length) return setLocalError('Agrega al menos un producto.');
    if (totals.invalidRows > 0) return setLocalError('Corrige cantidades inválidas.');
    setSaving(true);
    try {
      const response = await crearOrden({
        proveedor_id: Number(proveedorId),
        fecha_emision: fechaEmision || undefined,
        observacion: observacion || undefined,
        items: items.map((item) => {
          const next = validateItem(item);
          return { producto_id: item.producto_id, cantidad: next.cantidad };
        })
      });
      setShowConfirmSave(false);
      setCreatedOrderId(response?.orden?.id || null);
      setShowSuccessModal(true);
    } catch (nextError) {
      setLocalError(parseApiError(nextError));
    } finally {
      setSaving(false);
    }
  };

  const onSolicitarGuardado = () => {
    setLocalError('');
    if (!proveedorId) return setLocalError('Selecciona un proveedor antes de guardar.');
    if (!items.length) return setLocalError('Agrega al menos un producto.');
    if (totals.invalidRows > 0) return setLocalError('Corrige cantidades inválidas.');
    setShowConfirmSave(true);
  };

  const onCrearProveedor = async () => {
    setLocalError('');
    const nextErrors = {};
    if (!proveedorNuevo.nombre.trim()) nextErrors.nombre = 'Este campo es obligatorio.';
    if (!proveedorFormErrors.setErrors(nextErrors)) return;
    const created = await crearProveedor({
      nombre: proveedorNuevo.nombre.trim(),
      telefono: proveedorNuevo.telefono.trim() || null,
      direccion: proveedorNuevo.direccion.trim() || null,
      tiene_credito: true,
      dias_pago: Number(proveedorNuevo.dias_pago || 0),
      activo: true
    }).catch((nextError) => {
      setLocalError(parseApiError(nextError));
      return null;
    });
    if (!created?.id) return;
    await listarProveedores({ include_cxp: 1, activo: 1 });
    setProveedorId(String(created.id));
    setProveedorNuevo(emptyProveedorForm);
    setShowProveedorCreate(false);
    setShowProveedorPicker(false);
  };

  const onCrearProducto = async () => {
    setLocalError('');
    const nextErrors = {};
    if (!productoNuevo.nombre.trim()) nextErrors.nombre = 'Este campo es obligatorio.';
    if (!productoFormErrors.setErrors(nextErrors)) return;
    const created = await crearProducto({
      nombre: productoNuevo.nombre.trim(),
      categoria_id: productoNuevo.categoria_id ? Number(productoNuevo.categoria_id) : null,
      unidad_medida: productoNuevo.unidad_medida,
      precio_venta: Number(productoNuevo.precio_referencia || 0),
      activo: true
    }).catch((nextError) => {
      setLocalError(parseApiError(nextError));
      return null;
    });
    if (!created?.id) return;
    const nextProductos = await fetchProductosActivos();
    setProductos(nextProductos);
    setProductoNuevo(emptyProductoForm);
    setShowProductoCreate(false);
    addItem(created);
  };

  return (
    <div className="space-y-5">
      <div className="w-full">
        <BackButton to="/compras">Volver a órdenes</BackButton>

        <div className="mt-5 space-y-1">
          <h1 className="text-[2rem] font-bold tracking-[-0.02em] text-[var(--color-text)]">Nueva orden de compra</h1>
          <p className="text-base text-[var(--color-text-muted)]">Registra proveedor, fecha y detalle de la orden. Guardar orden no ingresa stock.</p>
        </div>

        <div className="mt-6 space-y-4">
          {localError && <Alert tone="error">{localError}</Alert>}
          <Alert tone="info">
            Esta orden no captura costos finales y no actualiza stock. El inventario cambia cuando se registra la recepción.
          </Alert>
          {lineErrors.length > 0 && (
            <Alert tone="error">
              <ul className="list-disc pl-5 text-sm">
                {lineErrors.map((line) => <li key={`${line.index}-${line.code}`}>Línea {Number(line.index) + 1}: {line.message}</li>)}
              </ul>
            </Alert>
          )}
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-4 border-b border-[var(--color-border)] pb-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
              <label className={labelClassName()}>Proveedor</label>
                <div className="mt-2 flex gap-2">
                  <Input
                    readOnly
                    className="flex-1"
                    value={proveedorSeleccionado ? proveedorSeleccionado.nombre : ''}
                    placeholder="Selecciona un proveedor"
                    onClick={() => setShowProveedorPicker(true)}
                  />
                  <Button type="button" variant="ghost" className="shrink-0" onClick={() => setShowProveedorPicker(true)}>
                    Buscar
                  </Button>
                </div>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  {proveedorSeleccionado
                    ? [proveedorSeleccionado.telefono || null, proveedorSeleccionado.direccion || null].filter(Boolean).join(' • ') || 'Sin datos adicionales'
                    : 'Selecciona un proveedor activo para la orden.'}
                </p>
              </div>
              <div>
                <label className={labelClassName()}>Fecha</label>
                <Input className="mt-2" type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelClassName()}>Observación</label>
              <Input className="mt-2" value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <section className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-background-alt)] px-5 py-4">
              <p className={sectionTitleClassName()}>Detalle de orden</p>
              <Button onClick={() => setShowProductoPicker(true)}>
                <PiPlus className="text-base" />
                Agregar producto
              </Button>
            </div>

            <div className="px-5 py-5">
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th" className="w-16 !px-4 !py-3 text-center">#</TablaCelda>
                    <TablaCelda as="th" className="!px-4 !py-3">Producto</TablaCelda>
                    <TablaCelda as="th" className="!px-4 !py-3">Unidad</TablaCelda>
                    <TablaCelda as="th" className="w-[220px] !px-4 !py-3">Cantidad</TablaCelda>
                    <TablaCelda as="th" className="!px-4 !py-3 text-right">Acciones</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {!items.length && (
                    <TablaFila>
                      <TablaCelda colSpan={5} className="!py-16">
                        <div className="flex justify-center">
                          <EmptyState
                            className="max-w-md text-center"
                            title="Sin productos en la orden"
                            description="Presiona Agregar producto para empezar a construir la orden."
                          />
                        </div>
                      </TablaCelda>
                    </TablaFila>
                  )}
                  {items.map((item, index) => {
                    const next = validateItem(item);
                    return (
                      <TablaFila key={`${item.producto_id}-${index}`} className="align-middle">
                        <TablaCelda className="!px-4 !py-3 text-center font-semibold text-[var(--color-text)]">{index + 1}</TablaCelda>
                        <TablaCelda className="!px-4 !py-3">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-[var(--color-text)]">{item.nombre}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{item.codigo}</p>
                          </div>
                        </TablaCelda>
                        <TablaCelda className="!px-4 !py-3 font-semibold text-[var(--color-text)]">{item.unidad}</TablaCelda>
                        <TablaCelda className="!px-4 !py-3">
                          <Input className={next.cantidadError ? 'border-[var(--color-danger)]' : ''} value={item.cantidadInput} onChange={(e) => updateItem(index, 'cantidadInput', e.target.value)} />
                          <p className={`mt-1 text-xs ${next.cantidadError ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'}`}>
                            {next.cantidadError || (item.unidad === 'UND' ? 'Solo enteros.' : 'Permite decimales.')}
                          </p>
                        </TablaCelda>
                        <TablaCelda className="!px-4 !py-3">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="danger"
                              size="icon"
                              className="font-bold"
                              aria-label={`Quitar ${item.nombre}`}
                              title="Quitar"
                              onClick={() => setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                            >
                              <span className="text-lg font-extrabold leading-none text-current">×</span>
                            </Button>
                          </div>
                        </TablaCelda>
                      </TablaFila>
                    );
                  })}
                </TablaCuerpo>
              </Tabla>

              <div className="mt-6 flex justify-end">
                <div className="w-full max-w-[280px] rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="flex items-center justify-between text-sm text-[var(--color-text-muted)]">
                    <span>Filas</span>
                    <span className="font-semibold text-[var(--color-text)]">{items.length}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-sm font-semibold text-[var(--color-text)]">
                    <span>Filas válidas</span>
                    <span>{totals.validRows}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-text-muted)]">
                    <span>Recepción posterior</span>
                    <span className="font-semibold text-[var(--color-text)]">Obligatoria</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border)] pt-6">
          <Button variant="neutral" onClick={() => navigate('/compras')}>
            Cancelar
          </Button>
          <Button onClick={onSolicitarGuardado} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar orden'}
          </Button>
        </div>
      </div>

      <Modal open={showProveedorPicker} onClose={() => setShowProveedorPicker(false)} maxWidthClass="max-w-5xl" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Seleccionar proveedor</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Busca y selecciona un proveedor disponible.</p>
            </div>
            <Button variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setShowProveedorPicker(false)}>X</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[280px] flex-1">
              <PiMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input className="pl-10" placeholder="Buscar proveedor..." value={proveedorSearch} onChange={(e) => setProveedorSearch(e.target.value)} />
            </div>
            <Button variant="secondary" onClick={() => setShowProveedorCreate(true)}>
              <PiPlus className="text-base" />
              Agregar proveedor
            </Button>
          </div>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Proveedor</TablaCelda>
                <TablaCelda as="th">Teléfono</TablaCelda>
                <TablaCelda as="th">Dirección</TablaCelda>
                <TablaCelda as="th" className="text-right">Acción</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {proveedoresPaginados.map((proveedor) => (
                <TablaFila key={proveedor.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">{proveedor.nombre}</TablaCelda>
                  <TablaCelda>{proveedor.telefono || '-'}</TablaCelda>
                  <TablaCelda>{proveedor.direccion || '-'}</TablaCelda>
                  <TablaCelda>
                    <div className="flex justify-end">
                      <Button variant="secondary" size="sm" onClick={() => {
                        setProveedorId(String(proveedor.id));
                        setShowProveedorPicker(false);
                      }}>
                        Seleccionar
                      </Button>
                    </div>
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>

          <Paginador paginaActual={proveedorPage} totalPaginas={proveedoresTotalPaginas} totalRegistros={proveedoresFiltrados.length} mostrarSiempre onPageChange={setProveedorPage} />
        </div>
      </Modal>

      <Modal open={showProveedorCreate} onClose={() => setShowProveedorCreate(false)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Agregar proveedor</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Alta rápida desde la orden.</p>
            </div>
            <Button variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setShowProveedorCreate(false)}>X</Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre del proveedor" required error={proveedorFormErrors.errors.nombre}>
              <Input
                className="mt-2"
                value={proveedorNuevo.nombre}
                onChange={(e) => {
                  proveedorFormErrors.clearFieldError('nombre');
                  setProveedorNuevo((prev) => ({ ...prev, nombre: e.target.value }));
                }}
              />
            </Field>
            <Field label="Teléfono de contacto">
              <Input className="mt-2" value={proveedorNuevo.telefono} onChange={(e) => setProveedorNuevo((prev) => ({ ...prev, telefono: e.target.value }))} />
            </Field>
            <Field label="Dirección del proveedor" className="md:col-span-2">
              <Input className="mt-2" value={proveedorNuevo.direccion} onChange={(e) => setProveedorNuevo((prev) => ({ ...prev, direccion: e.target.value }))} />
            </Field>
            <Field label="Días de pago a crédito">
              <Input className="mt-2" value={proveedorNuevo.dias_pago} onChange={(e) => setProveedorNuevo((prev) => ({ ...prev, dias_pago: e.target.value }))} />
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="neutral" onClick={() => setShowProveedorCreate(false)}>Cancelar</Button>
            <Button onClick={onCrearProveedor}>Guardar proveedor</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showProductoPicker} onClose={() => setShowProductoPicker(false)} maxWidthClass="max-w-5xl" panelClassName="p-0">
        <div className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Agregar producto</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Busca y selecciona un producto para la orden.</p>
            </div>
            <Button variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setShowProductoPicker(false)}>X</Button>
          </div>

          <div className="shrink-0 px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[280px] flex-1">
                <PiMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <Input className="pl-10" placeholder="Buscar producto..." value={productoSearch} onChange={(e) => setProductoSearch(e.target.value)} />
              </div>
              <div className="min-w-[220px]">
                <Select value={productoCategoria} onChange={(e) => setProductoCategoria(e.target.value)}>
                  <option value="TODAS">Todas las categorías</option>
                  {categorias.map((categoria) => <option key={categoria.id} value={String(categoria.id)}>{categoria.nombre}</option>)}
                </Select>
              </div>
              <Button variant="secondary" onClick={() => setShowProductoCreate(true)}>
                <PiPlus className="text-base" />
                Crear producto
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Código</TablaCelda>
                  <TablaCelda as="th">Unidad</TablaCelda>
                  <TablaCelda as="th" className="text-right">Acción</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {productosPaginados.map((producto) => (
                  <TablaFila key={producto.id}>
                    <TablaCelda>
                      <div>
                        <p className="font-semibold text-[var(--color-text)]">{producto.nombre}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{producto.categoria_nombre || 'Sin categoría'}</p>
                      </div>
                    </TablaCelda>
                    <TablaCelda>{producto.codigo}</TablaCelda>
                    <TablaCelda>{getUnidad(producto.unidad_medida || producto.unidad)}</TablaCelda>
                    <TablaCelda>
                      <div className="flex justify-end">
                        <Button variant="secondary" size="sm" onClick={() => addItem(producto)}>Seleccionar</Button>
                      </div>
                    </TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </div>

          <div className="shrink-0 border-t border-[var(--color-border)] px-5 py-4">
            <Paginador paginaActual={productoPage} totalPaginas={productosTotalPaginas} totalRegistros={productosFiltrados.length} mostrarSiempre onPageChange={setProductoPage} />
          </div>
        </div>
      </Modal>

      <Modal open={showProductoCreate} onClose={() => setShowProductoCreate(false)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Crear producto</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Alta rápida desde la orden.</p>
            </div>
            <Button variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setShowProductoCreate(false)}>X</Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre descriptivo" required error={productoFormErrors.errors.nombre}>
              <Input
                className="mt-2"
                value={productoNuevo.nombre}
                onChange={(e) => {
                  productoFormErrors.clearFieldError('nombre');
                  setProductoNuevo((prev) => ({ ...prev, nombre: e.target.value }));
                }}
              />
            </Field>
            <Field label="Categoría">
              <Select className="mt-2" value={productoNuevo.categoria_id} onChange={(e) => setProductoNuevo((prev) => ({ ...prev, categoria_id: e.target.value }))}>
                <option value="">Selecciona categoría</option>
                {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
              </Select>
            </Field>
            <Field label="Unidad de medida">
              <Select className="mt-2" value={productoNuevo.unidad_medida} onChange={(e) => setProductoNuevo((prev) => ({ ...prev, unidad_medida: e.target.value }))}>
                <option value="UND">UND</option>
                <option value="KG">KG</option>
                <option value="LB">LB</option>
              </Select>
            </Field>
            <Field label="Precio de venta">
              <Input className="mt-2" value={productoNuevo.precio_referencia} onChange={(e) => setProductoNuevo((prev) => ({ ...prev, precio_referencia: sanitizeDecimalInput(e.target.value, 2) }))} />
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="neutral" onClick={() => setShowProductoCreate(false)}>Cancelar</Button>
            <Button onClick={onCrearProducto}>Guardar producto</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showConfirmSave} onClose={() => setShowConfirmSave(false)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Confirmar guardado</h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Se guardará la orden para {proveedorSeleccionado?.nombre || 'el proveedor seleccionado'} con {items.length} fila(s) en el detalle.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="neutral" onClick={() => setShowConfirmSave(false)}>Cancelar</Button>
            <Button onClick={onGuardarOrden} disabled={saving}>{saving ? 'Guardando...' : 'Confirmar y guardar'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showSuccessModal} onClose={() => setShowSuccessModal(false)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Orden creada correctamente</h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              La orden de compra {createdOrderId ? `#${createdOrderId}` : ''} fue registrada con éxito. Recuerda que todavía no ingresa stock hasta la recepción.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="neutral" onClick={() => {
              setShowSuccessModal(false);
              navigate('/compras');
            }}>
              Cerrar
            </Button>
            <Button onClick={() => navigate(createdOrderId ? `/compras/ordenes/${createdOrderId}` : '/compras')}>
              Ver orden
            </Button>
          </div>
        </div>
      </Modal>

      {productToast ? (
        <div className="fixed bottom-5 right-5 z-[1100] max-w-sm">
          <Toast tone="success">{productToast}</Toast>
        </div>
      ) : null}
    </div>
  );
}
