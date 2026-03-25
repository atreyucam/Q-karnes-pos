import { useEffect, useMemo, useState } from 'react';
import { PiCheck, PiFolders, PiPencilSimple, PiPlus, PiTrash, PiX } from 'react-icons/pi';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
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
  TablaCelda
} from '../../ui';
import { parseApiError } from '../../lib/apiClient';
import { useProductosStore } from '../../stores/productosStore';
import { createCategoria, deleteCategoria, fetchCategorias, updateCategoria } from '../../services/catalogoService';
import { formatMoney } from '../../lib/formatMoney';
import { sanitizeDecimalInput } from '../../lib/formatQty';

const PAGE_SIZE = 10;

const emptyProductoForm = {
  id: null,
  codigo: '',
  nombre: '',
  categoria_id: '',
  unidad_medida: 'UND',
  precio_venta: '',
  stock_minimo: '0',
  activo: true
};

const emptyCategoriaForm = {
  id: null,
  nombre: '',
  activo: true
};

function labelClassName() {
  return 'text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]';
}

function parseMargin(precioVenta, costoPromedio) {
  const price = Number(precioVenta || 0);
  const cost = Number(costoPromedio || 0);
  if (price <= 0) return null;
  if (cost <= 0) return 100;
  return Math.round((((price - cost) / price) * 100) * 10) / 10;
}

export default function ProductosPage() {
  const { productos, error, loading, listar, crear, actualizar } = useProductosStore();
  const [categorias, setCategorias] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', categoria: 'TODAS', estado: 'TODOS' });
  const [productoModal, setProductoModal] = useState({ open: false, mode: 'create' });
  const [productoForm, setProductoForm] = useState(emptyProductoForm);
  const [localError, setLocalError] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivateError, setDeactivateError] = useState('');
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [categoriaManagerOpen, setCategoriaManagerOpen] = useState(false);
  const [categoriaForm, setCategoriaForm] = useState(emptyCategoriaForm);
  const [categoriaMode, setCategoriaMode] = useState('create');
  const [categoriaError, setCategoriaError] = useState('');
  const [categoriaSaving, setCategoriaSaving] = useState(false);
  const [categoriaDeactivateTarget, setCategoriaDeactivateTarget] = useState(null);
  const [categoriaDeactivateError, setCategoriaDeactivateError] = useState('');
  const [categoriaDeactivateLoading, setCategoriaDeactivateLoading] = useState(false);
  const [categoriaDeleteTarget, setCategoriaDeleteTarget] = useState(null);
  const [categoriaDeleteError, setCategoriaDeleteError] = useState('');
  const [categoriaDeleteLoading, setCategoriaDeleteLoading] = useState(false);

  const refreshList = () =>
    listar({
      search: filtros.search || undefined,
      categoria_id: filtros.categoria === 'TODAS' ? undefined : Number(filtros.categoria),
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado
    });

  const refreshCategorias = async () => {
    try {
      const rows = await fetchCategorias();
      setCategorias(rows || []);
    } catch (_) {
      setCategorias([]);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(refreshList, 250);
    return () => window.clearTimeout(timer);
  }, [listar, filtros]);

  useEffect(() => {
    refreshCategorias();
  }, []);

  const categoriasOrdenadas = useMemo(
    () => [...categorias].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' })),
    [categorias]
  );

  const categoriaUsageMap = useMemo(() => {
    const counts = new Map();
    for (const producto of productos) {
      const key = String(producto.categoria_id || '');
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [productos]);

  const productosOrdenados = useMemo(
    () => [...productos].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' })),
    [productos]
  );

  const totalPaginas = Math.max(1, Math.ceil(productosOrdenados.length / PAGE_SIZE));
  const productosPaginados = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return productosOrdenados.slice(start, start + PAGE_SIZE);
  }, [pagina, productosOrdenados]);

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const onChangeFiltro = (key, value) => {
    setPagina(1);
    setFiltros((prev) => ({ ...prev, [key]: value }));
  };

  const openCreateModal = () => {
    setLocalError('');
    setProductoModal({ open: true, mode: 'create' });
    setProductoForm(emptyProductoForm);
  };

  const openEditModal = (producto) => {
    setLocalError('');
    setProductoModal({ open: true, mode: 'edit' });
    setProductoForm({
      id: producto.id,
      codigo: producto.codigo || '',
      nombre: producto.nombre || '',
      categoria_id: producto.categoria_id ? String(producto.categoria_id) : '',
      unidad_medida: producto.unidad_medida || producto.unidad || 'UND',
      precio_venta: String(Number(producto.precio_venta || producto.precio_referencia || 0)),
      stock_minimo: String(Number(producto.stock_minimo || 0)),
      activo: Boolean(producto.activo)
    });
  };

  const closeProductoModal = () => {
    setProductoModal({ open: false, mode: 'create' });
    setProductoForm(emptyProductoForm);
    setLocalError('');
  };

  const openCategoriaManager = () => {
    setCategoriaManagerOpen(true);
    setCategoriaMode('create');
    setCategoriaForm(emptyCategoriaForm);
    setCategoriaError('');
  };

  const closeCategoriaManager = () => {
    setCategoriaManagerOpen(false);
    setCategoriaMode('create');
    setCategoriaForm(emptyCategoriaForm);
    setCategoriaError('');
  };

  const openCategoriaEdit = (categoria) => {
    setCategoriaMode('edit');
    setCategoriaForm({
      id: categoria.id,
      nombre: categoria.nombre || '',
      activo: Boolean(categoria.activo ?? true)
    });
    setCategoriaError('');
    setCategoriaManagerOpen(true);
  };

  const onSaveProducto = async () => {
    setLocalError('');
    if (!productoForm.codigo.trim() || !productoForm.nombre.trim()) {
      setLocalError('Código y nombre son obligatorios.');
      return;
    }

    const precioVenta = Number(String(productoForm.precio_venta || '').replace(',', '.'));
    if (!Number.isFinite(precioVenta) || precioVenta <= 0) {
      setLocalError('Precio de venta inválido.');
      return;
    }

    const stockMinimo = Number(String(productoForm.stock_minimo || '0').replace(',', '.'));
    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
      setLocalError('Stock mínimo inválido.');
      return;
    }

    const payload = {
      ...(productoModal.mode === 'create' ? { codigo: productoForm.codigo.trim() } : {}),
      nombre: productoForm.nombre.trim(),
      categoria_id: productoForm.categoria_id ? Number(productoForm.categoria_id) : null,
      unidad_medida: productoForm.unidad_medida,
      precio_venta: precioVenta,
      stock_minimo: stockMinimo,
      activo: productoForm.activo
    };

    try {
      if (productoModal.mode === 'edit' && productoForm.id) {
        await actualizar(productoForm.id, payload);
      } else {
        await crear(payload);
      }
      closeProductoModal();
      refreshList();
    } catch (err) {
      setLocalError(err.message || 'No se pudo guardar el producto');
    }
  };

  const onToggleProducto = async (producto) => {
    if (producto.activo) {
      setDeactivateTarget(producto);
      return;
    }

    try {
      await actualizar(producto.id, { activo: true });
      refreshList();
    } catch (error) {
      setLocalError(error.message || 'No se pudo actualizar el estado del producto.');
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
      setDeactivateError(error.message || 'El sistema no permitio desactivar este producto.');
    } finally {
      setDeactivateLoading(false);
    }
  };

  const onSaveCategoria = async () => {
    setCategoriaError('');
    if (!categoriaForm.nombre.trim()) {
      setCategoriaError('El nombre de la categoría es obligatorio.');
      return;
    }

    setCategoriaSaving(true);
    try {
      if (categoriaMode === 'edit' && categoriaForm.id) {
        await updateCategoria(categoriaForm.id, {
          nombre: categoriaForm.nombre.trim(),
          activo: categoriaForm.activo
        });
      } else {
        await createCategoria({
          nombre: categoriaForm.nombre.trim(),
          activo: true
        });
      }
      await refreshCategorias();
      setCategoriaMode('create');
      setCategoriaForm(emptyCategoriaForm);
    } catch (nextError) {
      setCategoriaError(parseApiError(nextError));
    } finally {
      setCategoriaSaving(false);
    }
  };

  const onToggleCategoria = async (categoria) => {
    if (Boolean(categoria.activo ?? true)) {
      setCategoriaDeactivateTarget(categoria);
      return;
    }

    try {
      await updateCategoria(categoria.id, { activo: true });
      await refreshCategorias();
    } catch (nextError) {
      setCategoriaDeactivateError(parseApiError(nextError));
    }
  };

  const onConfirmDeactivateCategoria = async () => {
    if (!categoriaDeactivateTarget) return;
    setCategoriaDeactivateLoading(true);
    try {
      await updateCategoria(categoriaDeactivateTarget.id, { activo: false });
      setCategoriaDeactivateTarget(null);
      await refreshCategorias();
    } catch (nextError) {
      setCategoriaDeactivateTarget(null);
      setCategoriaDeactivateError(parseApiError(nextError));
    } finally {
      setCategoriaDeactivateLoading(false);
    }
  };

  const onRequestDeleteCategoria = (categoria) => {
    const totalProductos = categoriaUsageMap.get(String(categoria.id)) || 0;
    if (totalProductos > 0) {
      setCategoriaDeleteError('No se puede eliminar la categoría porque tiene productos asociados. Puedes desactivarla.');
      return;
    }
    setCategoriaDeleteTarget(categoria);
  };

  const onConfirmDeleteCategoria = async () => {
    if (!categoriaDeleteTarget) return;
    setCategoriaDeleteLoading(true);
    try {
      await deleteCategoria(categoriaDeleteTarget.id);
      setCategoriaDeleteTarget(null);
      await refreshCategorias();
    } catch (nextError) {
      setCategoriaDeleteTarget(null);
      setCategoriaDeleteError(parseApiError(nextError));
    } finally {
      setCategoriaDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Productos"
        description="Catálogo comercial separado del inventario: nombre, categoría, unidad, precio de venta y estado."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openCategoriaManager}>
              <PiFolders className="text-base" />
              <div className='pl-1.5'>
                Categorías
              </div>
            </Button>
            <Button onClick={openCreateModal}>
              <PiPlus className="text-base" />
              <div className='pl-1.5'>
                Nuevo producto
              </div>
            </Button>
          </div>
        )}
      />

      {(error || localError) && <Alert tone="error">{localError || error}</Alert>}

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px_180px]">
          <div>
            <label className={labelClassName()}>Buscar</label>
            <Input
              className="mt-2"
              value={filtros.search}
              onChange={(e) => onChangeFiltro('search', e.target.value)}
              placeholder="Código, nombre o categoría"
            />
          </div>

          <div>
            <label className={labelClassName()}>Categoría</label>
            <Select className="mt-2" value={filtros.categoria} onChange={(e) => onChangeFiltro('categoria', e.target.value)}>
              <option value="TODAS">Todas</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className={labelClassName()}>Estado</label>
            <Select className="mt-2" value={filtros.estado} onChange={(e) => onChangeFiltro('estado', e.target.value)}>
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
                setFiltros({ search: '', categoria: 'TODAS', estado: 'TODOS' });
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
              <TablaCelda as="th">Código</TablaCelda>
              <TablaCelda as="th">Producto</TablaCelda>
              <TablaCelda as="th">Categoría</TablaCelda>
              <TablaCelda as="th">Unidad</TablaCelda>
              <TablaCelda as="th" className="text-right">Precio venta</TablaCelda>
              <TablaCelda as="th" className="text-right">Costo promedio</TablaCelda>
              <TablaCelda as="th" className="text-right">Margen</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {productosPaginados.map((producto) => {
              const margin = parseMargin(producto.precio_venta, producto.costo_promedio);
              return (
                <TablaFila key={producto.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">{producto.codigo}</TablaCelda>
                  <TablaCelda>
                    <div className="space-y-1">
                      <p className="font-semibold text-[var(--color-text)]">{producto.nombre}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">Stock mínimo: {Number(producto.stock_minimo || 0)}</p>
                    </div>
                  </TablaCelda>
                  <TablaCelda>{producto.categoria_nombre || 'Sin categoría'}</TablaCelda>
                  <TablaCelda>{producto.unidad_medida || producto.unidad || 'UND'}</TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(producto.precio_venta)}</TablaCelda>
                  <TablaCelda className="text-right">{formatMoney(producto.costo_promedio)}</TablaCelda>
                  <TablaCelda className="text-right">
                    <span className={margin !== null && margin < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}>
                      {margin === null ? '-' : `${margin.toFixed(1)}%`}
                    </span>
                  </TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={producto.activo ? 'ACTIVO' : 'INACTIVO'} />
                  </TablaCelda>
                  <TablaCelda>
                    <div className="flex justify-end gap-1">
                      <IconButton
                        variant="iconEdit"
                        size="sm"
                        aria-label="Editar producto"
                        title="Editar producto"
                        onClick={() => openEditModal(producto)}
                      >
                        <PiPencilSimple className="text-lg" />
                      </IconButton>
                      <IconButton
                        variant={producto.activo ? 'iconDanger' : 'iconSuccess'}
                        size="sm"
                        aria-label={producto.activo ? 'Desactivar producto' : 'Activar producto'}
                        title={producto.activo ? 'Desactivar producto' : 'Activar producto'}
                        onClick={() => onToggleProducto(producto)}
                      >
                        {producto.activo ? <PiX className="text-lg" /> : <PiCheck className="text-lg" />}
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
            totalRegistros={productosOrdenados.length}
            mostrarSiempre
            onPageChange={setPagina}
          />
        </div>
      </Card>

      {loading && <LoadingState label="Cargando productos..." />}

      <Modal open={productoModal.open} onClose={closeProductoModal} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              {productoModal.mode === 'edit' ? 'Editar producto' : 'Nuevo producto'}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)]">Gestiona el catálogo comercial y el precio de venta.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={closeProductoModal}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelClassName()}>Código</label>
            <Input
              className="mt-2"
              value={productoForm.codigo}
              onChange={(e) => setProductoForm((prev) => ({ ...prev, codigo: e.target.value }))}
              placeholder="P001"
              disabled={productoModal.mode === 'edit'}
            />
          </div>

          <div>
            <label className={labelClassName()}>Nombre descriptivo</label>
            <Input
              className="mt-2"
              value={productoForm.nombre}
              onChange={(e) => setProductoForm((prev) => ({ ...prev, nombre: e.target.value }))}
              placeholder="Chorizo argentino"
            />
          </div>

          <div>
            <label className={labelClassName()}>Categoría</label>
            <Select
              className="mt-2"
              value={productoForm.categoria_id}
              onChange={(e) => setProductoForm((prev) => ({ ...prev, categoria_id: e.target.value }))}
            >
              <option value="">Sin categoría</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className={labelClassName()}>Unidad de medida</label>
            <Select
              className="mt-2"
              value={productoForm.unidad_medida}
              onChange={(e) => setProductoForm((prev) => ({ ...prev, unidad_medida: e.target.value }))}
            >
              <option value="UND">UND</option>
              <option value="LB">LB</option>
            </Select>
          </div>

          <div>
            <label className={labelClassName()}>Precio de venta</label>
            <Input
              className="mt-2"
              value={productoForm.precio_venta}
              onChange={(e) => setProductoForm((prev) => ({ ...prev, precio_venta: sanitizeDecimalInput(e.target.value, 2) }))}
              placeholder="0.00"
            />
          </div>

          <div>
            <label className={labelClassName()}>Stock mínimo</label>
            <Input
              className="mt-2"
              value={productoForm.stock_minimo}
              onChange={(e) => setProductoForm((prev) => ({ ...prev, stock_minimo: sanitizeDecimalInput(e.target.value, 3) }))}
              placeholder="0"
            />
          </div>

          {productoModal.mode === 'edit' && (
            <div className="md:col-span-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text-muted)]">
              Costo promedio actual: <strong className="text-[var(--color-text)]">{formatMoney(Number(productos.find((row) => row.id === productoForm.id)?.costo_promedio || 0))}</strong>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-between gap-2">
          <div className="flex items-center">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={productoForm.activo}
                onChange={(e) => setProductoForm((prev) => ({ ...prev, activo: e.target.checked }))}
              />
              Producto activo
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={closeProductoModal}>
              Cancelar
            </Button>
            <Button onClick={onSaveProducto}>
              {productoModal.mode === 'edit' ? 'Guardar cambios' : 'Guardar producto'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={categoriaManagerOpen} onClose={closeCategoriaManager} maxWidthClass="sm:max-w-[min(1120px,calc(100vw-1rem))]" panelClassName="p-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Gestionar categorías</h3>
                <p className="text-sm text-[var(--color-text-muted)]">Crea, renombra, activa, desactiva o elimina categorías sin productos asociados.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={closeCategoriaManager}>
                X
              </Button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="border-b border-[var(--color-border)] px-5 py-5 lg:border-b-0 lg:border-r">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--color-text)]">
                    {categoriaMode === 'edit' ? 'Editar categoría' : 'Nueva categoría'}
                  </h4>
                  <p className="text-xs text-[var(--color-text-muted)]">Los cambios se reflejan en los selectores del sistema.</p>
                </div>

                {categoriaError && <Alert tone="error">{categoriaError}</Alert>}

                <div>
                  <label className={labelClassName()}>Nombre</label>
                  <Input
                    className="mt-2"
                    value={categoriaForm.nombre}
                    onChange={(e) => setCategoriaForm((prev) => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Nombre de categoría"
                  />
                </div>

                {categoriaMode === 'edit' && (
                  <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
                    <input
                      type="checkbox"
                      checked={categoriaForm.activo}
                      onChange={(e) => setCategoriaForm((prev) => ({ ...prev, activo: e.target.checked }))}
                    />
                    Categoría activa
                  </label>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button onClick={onSaveCategoria} disabled={categoriaSaving}>
                    {categoriaSaving ? 'Guardando...' : categoriaMode === 'edit' ? 'Guardar cambios' : 'Crear categoría'}
                  </Button>
                  {categoriaMode === 'edit' && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setCategoriaMode('create');
                        setCategoriaForm(emptyCategoriaForm);
                        setCategoriaError('');
                      }}
                    >
                      Cancelar edición
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="min-h-0 overflow-auto px-5 py-5">
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Categoría</TablaCelda>
                    <TablaCelda as="th" className="text-right">Productos</TablaCelda>
                    <TablaCelda as="th">Estado</TablaCelda>
                    <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {categoriasOrdenadas.map((categoria) => {
                    const totalProductos = categoriaUsageMap.get(String(categoria.id)) || 0;
                    const isActive = Boolean(categoria.activo ?? true);
                    return (
                      <TablaFila key={categoria.id}>
                        <TablaCelda className="font-semibold text-[var(--color-text)]">{categoria.nombre}</TablaCelda>
                        <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{totalProductos}</TablaCelda>
                        <TablaCelda>
                          <StatusBadge status={isActive ? 'ACTIVO' : 'INACTIVO'} />
                        </TablaCelda>
                        <TablaCelda>
                          <div className="flex justify-end gap-1">
                            <IconButton
                              variant="iconEdit"
                              size="sm"
                              aria-label={`Editar categoría ${categoria.nombre}`}
                              title="Editar categoría"
                              onClick={() => openCategoriaEdit(categoria)}
                            >
                              <PiPencilSimple className="text-lg" />
                            </IconButton>
                            <IconButton
                              variant={isActive ? 'iconDanger' : 'iconSuccess'}
                              size="sm"
                              aria-label={isActive ? `Desactivar categoría ${categoria.nombre}` : `Activar categoría ${categoria.nombre}`}
                              title={isActive ? 'Desactivar categoría' : 'Activar categoría'}
                              onClick={() => onToggleCategoria(categoria)}
                            >
                              {isActive ? <PiX className="text-lg" /> : <PiCheck className="text-lg" />}
                            </IconButton>
                            <IconButton
                              variant="iconDanger"
                              size="sm"
                              aria-label={`Eliminar categoría ${categoria.nombre}`}
                              title={totalProductos > 0 ? 'No se puede eliminar; tiene productos asociados' : 'Eliminar categoría'}
                              disabled={totalProductos > 0}
                              onClick={() => onRequestDeleteCategoria(categoria)}
                            >
                              <PiTrash className="text-lg" />
                            </IconButton>
                          </div>
                        </TablaCelda>
                      </TablaFila>
                    );
                  })}
                  {categoriasOrdenadas.length === 0 && (
                    <TablaFila>
                      <TablaCelda colSpan={4} className="text-center text-[var(--color-text-muted)]">
                        No hay categorías registradas.
                      </TablaCelda>
                    </TablaFila>
                  )}
                </TablaCuerpo>
              </Tabla>
            </div>
          </div>
        </div>
      </Modal>

      <DeactivateEntityDialogs
        confirmOpen={Boolean(deactivateTarget)}
        entityLabel={deactivateTarget ? `al producto ${deactivateTarget.nombre}` : 'este producto'}
        onCloseConfirm={() => setDeactivateTarget(null)}
        onConfirm={onConfirmDeactivate}
        confirmLoading={deactivateLoading}
        blockedOpen={Boolean(deactivateError)}
        blockedMessage={deactivateError}
        onCloseBlocked={() => setDeactivateError('')}
      />

      <DeactivateEntityDialogs
        confirmOpen={Boolean(categoriaDeactivateTarget)}
        entityLabel={categoriaDeactivateTarget ? `la categoría ${categoriaDeactivateTarget.nombre}` : 'esta categoría'}
        onCloseConfirm={() => setCategoriaDeactivateTarget(null)}
        onConfirm={onConfirmDeactivateCategoria}
        confirmLoading={categoriaDeactivateLoading}
        blockedOpen={Boolean(categoriaDeactivateError)}
        blockedMessage={categoriaDeactivateError}
        onCloseBlocked={() => setCategoriaDeactivateError('')}
      />

      <ConfirmDialog
        open={Boolean(categoriaDeleteTarget)}
        onClose={() => setCategoriaDeleteTarget(null)}
        onConfirm={onConfirmDeleteCategoria}
        title="Eliminar categoría"
        description={`Se eliminará ${categoriaDeleteTarget?.nombre || 'la categoría'} de forma permanente.`}
        confirmLabel={categoriaDeleteLoading ? 'Eliminando...' : 'Eliminar'}
        confirmVariant="danger"
      />

      <Modal open={Boolean(categoriaDeleteError)} onClose={() => setCategoriaDeleteError('')} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div>
            <h3 className="ui-panel-title">No se pudo completar la acción</h3>
            <p className="ui-panel-description">{categoriaDeleteError}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setCategoriaDeleteError('')}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
