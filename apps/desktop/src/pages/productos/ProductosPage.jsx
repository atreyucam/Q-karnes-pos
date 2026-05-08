import { useEffect, useMemo, useState } from 'react';
import { PiFolders, PiPencilSimple, PiPlus, PiTrash } from 'react-icons/pi';
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
  Toast,
  TableActions,
  TableActionButton,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../shared/ui';
import { parseApiError } from '../../lib/apiClient';
import { useProductosStore } from '../../stores/productosStore';
import { createCategoria, deleteCategoria, fetchCategorias, fetchProductos, updateCategoria } from '../../services/catalogoService';
import { formatCurrency, formatWeight } from '../../lib/formatNumber';
import { sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';

const PAGE_SIZE = GLOBAL_PAGE_SIZE;
const PRODUCT_ROLE_OPTIONS = [
  { key: 'es_vendible', label: 'Vendible', hint: 'Aparece en ventas.' },
  { key: 'es_transformable', label: 'Transformable', hint: 'Puede usarse como padre en transformaciones.' },
  { key: 'es_insumo', label: 'Insumo', hint: 'Uso interno.' },
  { key: 'es_merma', label: 'Merma', hint: 'Producto técnico no comercial.' }
];
const PRODUCT_ROLE_FILTER_OPTIONS = [
  { label: 'Vendible', key: 'es_vendible' },
  { label: 'Transformable', key: 'es_transformable' },
  { label: 'Insumo', key: 'es_insumo' },
  { label: 'Merma', key: 'es_merma' }
];

const emptyProductoForm = {
  id: null,
  codigo: '',
  nombre: '',
  categoria_id: '',
  unidad_medida: 'UND',
  precio_venta: '',
  stock_minimo: '0',
  activo: true,
  es_vendible: true,
  es_transformable: false,
  es_insumo: false,
  es_merma: false
};

const emptyCategoriaForm = {
  id: null,
  nombre: '',
  activo: true
};

function labelClassName() {
  return 'text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]';
}

function getProductRoles(producto) {
  return PRODUCT_ROLE_OPTIONS.filter((role) => Boolean(producto?.[role.key]));
}

function validateProductRoles(productoForm) {
  const rolesActivos = PRODUCT_ROLE_OPTIONS.filter((role) => Boolean(productoForm?.[role.key]));
  if (!rolesActivos.length) return 'Selecciona al menos un rol para el producto.';
  if (productoForm.es_merma && rolesActivos.length > 1) {
    return 'Un producto de merma no puede combinarse con otros roles.';
  }
  return '';
}

function formatDecimalInput(value, decimals = 2) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return '';
  return parsed.toFixed(decimals);
}

function normalizeStockFieldInput(value, unit) {
  if (unit === 'UND') {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return '';
    return String(Math.trunc(parsed));
  }
  return formatDecimalInput(value, 2);
}

function normalizeStockInputForUnit(value, unit) {
  if (unit !== 'UND') return sanitizeQtyInput(value, unit);

  const normalizedValue = String(value ?? '').trim().replace(',', '.');
  if (!normalizedValue) return '';

  const parsed = Number(normalizedValue);
  if (Number.isFinite(parsed)) return String(Math.trunc(parsed));

  const digitsOnly = String(value ?? '').replace(/[^0-9]/g, '');
  if (!digitsOnly) return '';
  return String(Math.trunc(Number(digitsOnly)));
}

const toNumber = (value) => {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '0').replace(/[^0-9.-]+/g, '');
  return Number(cleaned) || 0;
};

const getProductStockValues = (producto) => {
  const stockVisible = toNumber(
    producto.stock_visible
    ?? producto.stockVisible
    ?? producto.stock_actual
    ?? producto.stockActual
    ?? producto.stock
  );
  const stockMinimo = toNumber(
    producto.stock_minimo
    ?? producto.stockMinimo
    ?? 0
  );
  return { stockVisible, stockMinimo };
};

const getProductStatus = (producto) => {
  const { stockVisible, stockMinimo } = getProductStockValues(producto);
  if (stockVisible <= 0) return { label: 'Sin stock', tone: 'danger' };
  if (stockMinimo > 0 && stockVisible <= stockMinimo) return { label: 'Bajo mínimo', tone: 'warning' };
  return { label: 'Normal', tone: 'normal' };
};

export default function ProductosPage() {
  const { productos, error, loading, listar, crear, actualizar } = useProductosStore();
  const [categorias, setCategorias] = useState([]);
  const [allProductos, setAllProductos] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', categoria: 'TODAS', estado: 'TODOS', roles: [] });
  const [productoModal, setProductoModal] = useState({ open: false, mode: 'create' });
  const [productoForm, setProductoForm] = useState(emptyProductoForm);
  const [localError, setLocalError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [categoriaManagerOpen, setCategoriaManagerOpen] = useState(false);
  const [categoriaEditorOpen, setCategoriaEditorOpen] = useState(false);
  const [categoriaForm, setCategoriaForm] = useState(emptyCategoriaForm);
  const [categoriaInitialActivo, setCategoriaInitialActivo] = useState(true);
  const [categoriaMode, setCategoriaMode] = useState('create');
  const [categoriaError, setCategoriaError] = useState('');
  const [categoriaSaving, setCategoriaSaving] = useState(false);
  const [categoriaDeleteTarget, setCategoriaDeleteTarget] = useState(null);
  const [categoriaDeleteError, setCategoriaDeleteError] = useState(null);
  const [categoriaDeleteLoading, setCategoriaDeleteLoading] = useState(false);
  const [categoriaDeactivateConfirm, setCategoriaDeactivateConfirm] = useState(null);

  const refreshList = () =>
    listar({
      search: filtros.search || undefined,
      categoria_id: filtros.categoria === 'TODAS' ? undefined : Number(filtros.categoria),
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado
    });

  const refreshCategorias = async () => {
    try {
      const [rows, productsSnapshot] = await Promise.all([fetchCategorias(), fetchProductos()]);
      setCategorias(rows || []);
      setAllProductos(productsSnapshot || []);
    } catch (_) {
      setCategorias([]);
      setAllProductos([]);
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
    for (const producto of allProductos) {
      const key = String(producto.categoria_id || '');
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [allProductos]);

  const productosFiltradosPorRol = useMemo(() => {
    if (!filtros.roles.length) return productos;
    return productos.filter((producto) => filtros.roles.some((roleKey) => Boolean(producto?.[roleKey])));
  }, [productos, filtros.roles]);

  const productosOrdenados = useMemo(
    () => [...productosFiltradosPorRol].sort((a, b) => {
      const aEnMinimo = Number(a.stock_actual || 0) <= Number(a.stock_minimo || 0) ? 0 : 1;
      const bEnMinimo = Number(b.stock_actual || 0) <= Number(b.stock_minimo || 0) ? 0 : 1;
      if (aEnMinimo !== bEnMinimo) return aEnMinimo - bEnMinimo;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    }),
    [productosFiltradosPorRol]
  );

  const totalPaginas = Math.max(1, Math.ceil(productosOrdenados.length / PAGE_SIZE));
  const productosPaginados = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return productosOrdenados.slice(start, start + PAGE_SIZE);
  }, [pagina, productosOrdenados]);

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  useEffect(() => {
    if (!feedback?.description) return undefined;
    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 3800);
    const clearTimer = window.setTimeout(() => setFeedback(null), 4000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [feedback]);

  const onChangeFiltro = (key, value) => {
    setPagina(1);
    setFiltros((prev) => ({ ...prev, [key]: value }));
  };

  const onToggleRoleFiltro = (roleKey) => {
    setPagina(1);
    setFiltros((prev) => {
      const exists = prev.roles.includes(roleKey);
      return {
        ...prev,
        roles: exists ? prev.roles.filter((item) => item !== roleKey) : [...prev.roles, roleKey]
      };
    });
  };

  const onChangeUnidadMedida = (value) => {
    setProductoForm((prev) => ({
      ...prev,
      unidad_medida: value,
      stock_minimo: normalizeStockInputForUnit(prev.stock_minimo, value)
    }));
  };

  const onToggleRole = (roleKey, checked) => {
    setProductoForm((prev) => {
      if (roleKey === 'es_merma') {
        return checked
          ? {
              ...prev,
              es_vendible: false,
              es_transformable: false,
              es_insumo: false,
              es_merma: true,
              precio_venta: '0'
            }
          : { ...prev, es_merma: false };
      }

      return {
        ...prev,
        es_merma: false,
        [roleKey]: checked
      };
    });
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
      precio_venta: formatDecimalInput(producto.precio_venta || producto.precio_referencia || 0, 2),
      stock_minimo: normalizeStockFieldInput(producto.stock_minimo || 0, producto.unidad_medida || producto.unidad || 'UND'),
      activo: Boolean(producto.activo),
      es_vendible: Boolean(producto.es_vendible),
      es_transformable: Boolean(producto.es_transformable),
      es_insumo: Boolean(producto.es_insumo),
      es_merma: Boolean(producto.es_merma)
    });
  };

  const closeProductoModal = () => {
    setProductoModal({ open: false, mode: 'create' });
    setProductoForm(emptyProductoForm);
    setLocalError('');
  };

  const openCategoriaManager = () => {
    setCategoriaManagerOpen(true);
    setCategoriaError('');
  };

  const closeCategoriaManager = () => {
    setCategoriaManagerOpen(false);
    setCategoriaEditorOpen(false);
    setCategoriaMode('create');
    setCategoriaInitialActivo(true);
    setCategoriaForm(emptyCategoriaForm);
    setCategoriaError('');
  };

  const openCategoriaCreateModal = () => {
    setCategoriaMode('create');
    setCategoriaInitialActivo(true);
    setCategoriaForm(emptyCategoriaForm);
    setCategoriaError('');
    setCategoriaEditorOpen(true);
  };

  const openCategoriaEdit = (categoria) => {
    setCategoriaMode('edit');
    setCategoriaForm({
      id: categoria.id,
      nombre: categoria.nombre || '',
      activo: Boolean(categoria.activo ?? true)
    });
    setCategoriaInitialActivo(Boolean(categoria.activo ?? true));
    setCategoriaError('');
    setCategoriaEditorOpen(true);
  };

  const onSaveProducto = async () => {
    setLocalError('');
    if (!productoForm.nombre.trim()) {
      setLocalError('El nombre es obligatorio.');
      return;
    }

    const normalizedStockInput = normalizeStockInputForUnit(productoForm.stock_minimo, productoForm.unidad_medida);
    const stockMinimo = Number(String(normalizedStockInput || '0').replace(',', '.'));
    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
      setLocalError('Stock mínimo inválido.');
      return;
    }

    const roleError = validateProductRoles(productoForm);
    if (roleError) {
      setLocalError(roleError);
      return;
    }

    const precioTexto = String(productoForm.precio_venta || '').replace(',', '.').trim();
    const precioVenta = precioTexto === '' ? 0 : Number(precioTexto);
    if (productoForm.es_vendible) {
      if (!Number.isFinite(precioVenta) || precioVenta <= 0) {
        setLocalError('Precio de venta inválido para un producto vendible.');
        return;
      }
    } else if (!Number.isFinite(precioVenta) || precioVenta < 0) {
      setLocalError('Precio de referencia inválido.');
      return;
    }

    const payload = {
      nombre: productoForm.nombre.trim(),
      categoria_id: productoForm.categoria_id ? Number(productoForm.categoria_id) : null,
      unidad_medida: productoForm.unidad_medida,
      precio_venta: precioVenta,
      stock_minimo: stockMinimo,
      activo: productoForm.activo,
      es_vendible: Boolean(productoForm.es_vendible),
      es_transformable: Boolean(productoForm.es_transformable),
      es_insumo: Boolean(productoForm.es_insumo),
      es_merma: Boolean(productoForm.es_merma)
    };

    try {
      if (productoModal.mode === 'edit' && productoForm.id) {
        await actualizar(productoForm.id, payload);
        setFeedback({ tone: 'success', title: 'Producto guardado', description: 'Producto actualizado correctamente' });
      } else {
        await crear(payload);
        setFeedback({ tone: 'success', title: 'Producto guardado', description: 'Producto creado correctamente' });
      }
      closeProductoModal();
      await Promise.all([refreshList(), refreshCategorias()]);
    } catch (err) {
      const errorMessage = err.message || 'No se pudo actualizar el producto';
      setLocalError(errorMessage);
      setFeedback({ tone: 'error', title: 'Error al guardar', description: errorMessage });
    }
  };

  const commitSaveCategoria = async (payloadOverride = null) => {
    setCategoriaError('');
    if (!categoriaForm.nombre.trim()) {
      setCategoriaError('El nombre de la categoría es obligatorio.');
      return;
    }

    const payload = payloadOverride || {
      nombre: categoriaForm.nombre.trim(),
      activo: categoriaForm.activo
    };

    setCategoriaSaving(true);
    try {
      if (categoriaMode === 'edit' && categoriaForm.id) {
        await updateCategoria(categoriaForm.id, payload);
        setFeedback({
          tone: 'success',
          title: 'Categoría guardada',
          description: payload.activo ? 'Categoría actualizada correctamente' : 'Categoría desactivada correctamente'
        });
      } else {
        await createCategoria(payload);
        setFeedback({ tone: 'success', title: 'Categoría guardada', description: 'Categoría creada correctamente' });
      }
      await refreshCategorias();
      await refreshList();
      setCategoriaEditorOpen(false);
      setCategoriaMode('create');
      setCategoriaInitialActivo(true);
      setCategoriaForm(emptyCategoriaForm);
    } catch (nextError) {
      const message = parseApiError(nextError) || 'No se pudo completar la acción';
      setCategoriaError(message);
      setFeedback({ tone: 'error', title: 'No se pudo completar la acción', description: message });
    } finally {
      setCategoriaSaving(false);
    }
  };

  const onSaveCategoria = async () => {
    if (categoriaMode === 'edit' && categoriaForm.id && categoriaInitialActivo && !categoriaForm.activo) {
      setCategoriaDeactivateConfirm({
        nombre: categoriaForm.nombre,
        payload: { nombre: categoriaForm.nombre.trim(), activo: false }
      });
      return;
    }

    if (categoriaMode === 'edit' && categoriaForm.id && !categoriaInitialActivo && categoriaForm.activo) {
      await commitSaveCategoria({ nombre: categoriaForm.nombre.trim(), activo: true });
      setFeedback({ tone: 'success', title: 'Categoría guardada', description: 'Categoría activada correctamente' });
      return;
    }

    await commitSaveCategoria();
  };

  const onRequestDeleteCategoria = (categoria) => {
    const totalProductos = categoriaUsageMap.get(String(categoria.id)) || 0;
    if (totalProductos > 0) {
      setCategoriaDeleteError({
        message: 'La categoría todavía tiene productos asociados. Puedes desactivarla para ocultarla de formularios y nuevas operaciones.',
        totalProductos
      });
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
      await refreshList();
      setFeedback({ tone: 'success', title: 'Categoría eliminada', description: 'Categoría eliminada correctamente' });
    } catch (nextError) {
      setCategoriaDeleteTarget(null);
      const message = parseApiError(nextError) || 'No se pudo completar la acción';
      setCategoriaDeleteError({ message, totalProductos: null });
      setFeedback({ tone: 'error', title: 'No se pudo completar la acción', description: message });
    } finally {
      setCategoriaDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {feedback?.description ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast
            tone={feedback.tone || 'success'}
            title={feedback.title || 'Operación completada'}
            description={feedback.description}
            onClose={() => {
              setToastVisible(false);
              setFeedback(null);
            }}
            className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}
          />
        </div>
      ) : null}

      <PageHeader
        title="Productos"
        description="Catálogo operativo con roles explícitos: vendible, transformable, insumo o merma."
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

      {(error || localError) && (
        <Alert tone="error">
          {localError || error}
        </Alert>
      )}

      <FiltersBar
        search={(
          <Field label="Buscar">
            <Input
              value={filtros.search}
              onChange={(e) => onChangeFiltro('search', e.target.value)}
              placeholder="Código, nombre o categoría"
            />
          </Field>
        )}
        actions={(
          <Button
            variant="neutral"
            className="w-full xl:w-auto"
            onClick={() => {
              setPagina(1);
              setFiltros({ search: '', categoria: 'TODAS', estado: 'TODOS', roles: [] });
            }}
          >
            Limpiar filtros
          </Button>
        )}
        secondaryMinWidth={190}
      >
        <Field label="Categoría">
          <Select value={filtros.categoria} onChange={(e) => onChangeFiltro('categoria', e.target.value)}>
            <option value="TODAS">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Estado">
          <Select value={filtros.estado} onChange={(e) => onChangeFiltro('estado', e.target.value)}>
            <option value="TODOS">Todos</option>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </Select>
        </Field>

        {/* labelClassName()}>Rol< */}
        <Field label="Rol">
          <div className="mt-2 flex flex-wrap gap-2">
            {PRODUCT_ROLE_FILTER_OPTIONS.map((role) => {
              const isActive = filtros.roles.includes(role.key);
              return (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => onToggleRoleFiltro(role.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'border-[#1f2937] bg-[#1f2937] text-white'
                      : 'border-[#dfe3e8] bg-white text-[#4b5563] hover:bg-[#f6f6f7]'
                  }`}
                >
                  {role.label}
                </button>
              );
            })}
          </div>
        </Field>
      </FiltersBar>

      <Card className="overflow-hidden p-0">
        {productosOrdenados.length === 0 && !loading ? (
          <div className="p-5">
            <EmptyState
              title="Sin productos"
              description="No hay productos para los filtros actuales."
            />
          </div>
        ) : (
          <>
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th" className="w-3 px-0" aria-hidden />
                  <TablaCelda as="th">Código</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th" className="text-right">Stock visible</TablaCelda>
                  <TablaCelda as="th" className="text-right">Precio venta</TablaCelda>
                  <TablaCelda as="th" className="text-right">Costo visible</TablaCelda>
                  <TablaCelda as="th">Estado stock</TablaCelda>
                  <TablaCelda as="th">Activo</TablaCelda>
                  <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {productosPaginados.map((producto) => {
                  const { stockVisible, stockMinimo } = getProductStockValues(producto);
                  const stockStatus = getProductStatus(producto);
                  const unidadMedida = producto.unidad_medida || producto.unidad || 'UND';
                  const roles = getProductRoles(producto);
                  const roleText = roles.length ? roles.map((role) => role.label.toLowerCase()).join(' · ') : 'sin rol';
                  const statusAccentClass = stockStatus.tone === 'danger'
                    ? 'bg-[#d72c0d]'
                    : stockStatus.tone === 'warning'
                      ? 'bg-[#b98900]'
                      : 'bg-[#c4cdd5]';
                  return (
                    <TablaFila
                      key={producto.id}
                      className="hover:!bg-[#fafafa] hover:outline hover:outline-1 hover:outline-[#dfe3e8]"
                    >
                      <TablaCelda className="w-3 px-0">
                        <span className={`block h-14 w-[3px] rounded-r ${statusAccentClass}`} aria-hidden />
                      </TablaCelda>
                      <TablaCelda className="font-semibold text-[var(--color-text)]">
                        <span>{producto.codigo}</span>
                      </TablaCelda>
                      <TablaCelda>
                        <div className="space-y-1">
                          <p className="font-semibold text-[var(--color-text)]">{producto.nombre}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{`${producto.categoria_nombre || 'Sin categoría'} · ${roleText}`}</p>
                        </div>
                      </TablaCelda>
                      <TablaCelda>
                        <div className="text-right font-semibold text-[var(--color-text)]">{formatWeight(stockVisible, unidadMedida)}</div>
                        <p className="text-right text-[11px] text-[var(--color-text-muted)]">Mín: {formatWeight(stockMinimo, unidadMedida)}</p>
                      </TablaCelda>
                      <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatCurrency(producto.precio_venta)}</TablaCelda>
                      <TablaCelda className="text-right">{formatCurrency(producto.costo_promedio)}</TablaCelda>
                      <TablaCelda>
                        <span className="text-sm text-[var(--color-text-secondary)]">{stockStatus.label}</span>
                      </TablaCelda>
                      <TablaCelda>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${Boolean(producto.activo) ? 'border-[#cce5d0] bg-[#f5fbf6] text-[#1f7a35]' : 'border-[#d9dce1] bg-[#f6f7f8] text-[#5c6670]'}`}>
                          {Boolean(producto.activo) ? 'Activo' : 'Inactivo'}
                        </span>
                      </TablaCelda>
                      <TablaCelda>
                        <TableActions>
                          <TableActionButton
                            variant="neutral"
                            className="border-[#dfe3e8] bg-white hover:bg-[#f6f6f7]"
                            icon={<PiPencilSimple />}
                            aria-label="Editar producto"
                            title="Editar producto"
                            onClick={() => openEditModal(producto)}
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

            <div className="px-5 pb-5">
              <Paginador
                paginaActual={pagina}
                totalPaginas={totalPaginas}
                totalRegistros={productosOrdenados.length}
                mostrarSiempre
                onPageChange={setPagina}
              />
            </div>
          </>
        )}
      </Card>

      {loading && <LoadingState label="Cargando productos..." />}

      <Modal open={productoModal.open} onClose={closeProductoModal} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              {productoModal.mode === 'edit' ? 'Editar producto' : 'Nuevo producto'}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)]">Define datos base y roles operativos del producto.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={closeProductoModal}>
            X
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <p className="text-sm font-semibold text-[var(--color-text)]">Datos del producto</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {productoModal.mode === 'edit' ? (
                <div>
                  <label className={labelClassName()}>Código</label>
                  <Input className="mt-2" value={productoForm.codigo} disabled />
                </div>
              ) : null}

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
                  onChange={(e) => onChangeUnidadMedida(e.target.value)}
                >
                  <option value="UND">UND</option>
                  <option value="KG">KG</option>
                  <option value="LB">LB</option>
                </Select>
              </div>

              <div>
                <label className={labelClassName()}>
                  {productoForm.es_vendible ? 'Precio de venta' : 'Precio de referencia'}
                </label>
                <Input
                  className="mt-2"
                  value={productoForm.precio_venta}
                  onChange={(e) => setProductoForm((prev) => ({ ...prev, precio_venta: sanitizeDecimalInput(e.target.value, 2) }))}
                  onBlur={() => setProductoForm((prev) => ({ ...prev, precio_venta: formatDecimalInput(prev.precio_venta, 2) }))}
                  placeholder={productoForm.es_vendible ? '0.00' : 'Opcional'}
                />
              </div>

              <div>
                <label className={labelClassName()}>Stock mínimo</label>
                <Input
                  className="mt-2"
                  value={productoForm.stock_minimo}
                  onChange={(e) => setProductoForm((prev) => ({ ...prev, stock_minimo: sanitizeQtyInput(e.target.value, prev.unidad_medida) }))}
                  onBlur={() => setProductoForm((prev) => ({ ...prev, stock_minimo: normalizeStockFieldInput(prev.stock_minimo, prev.unidad_medida) }))}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <p className="text-sm font-semibold text-[var(--color-text)]">Roles del producto</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRODUCT_ROLE_OPTIONS.map((role) => {
                const isActive = Boolean(productoForm[role.key]);
                const isDisabled = productoForm.es_merma && role.key !== 'es_merma';
                return (
                  <button
                    key={role.key}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => onToggleRole(role.key, !isActive)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'border-[#1f2937] bg-[#1f2937] text-white'
                        : 'border-[#dfe3e8] bg-white text-[#4b5563] hover:bg-[#f6f6f7]'
                    } ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Debe existir al menos un rol activo. `Merma` es exclusivo y bloquea los demás roles mientras esté activo.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <p className="text-sm font-semibold text-[var(--color-text)]">Estado del producto</p>
            <div className="mt-3">
              <Switch
                checked={productoForm.activo}
                onChange={(checked) => setProductoForm((prev) => ({ ...prev, activo: checked }))}
                label="Activo"
                description="Si está inactivo no aparece para nuevas operaciones."
              />
            </div>
          </div>

          {productoModal.mode === 'edit' && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text-muted)]">
              Costo promedio actual: <strong className="text-[var(--color-text)]">{formatCurrency(Number(productos.find((row) => row.id === productoForm.id)?.costo_promedio || 0))}</strong>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
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
          <div className="px-5 py-4">
            <div className="ui-modal-header">
              <div className="ui-modal-header-copy">
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Gestionar categorías</h3>
                <p className="text-sm text-[var(--color-text-muted)]">Crea, renombra, activa, desactiva o elimina categorías sin productos asociados.</p>
              </div>
              <div className="flex items-start">
                <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={closeCategoriaManager}>
                  X
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto px-5 pb-5 pt-0">
            <div className="mb-4 flex justify-end">
              <Button onClick={openCategoriaCreateModal}>
                <PiPlus className="text-base" />
                Nueva categoría
              </Button>
            </div>
            {categoriaError && (
              <Alert tone="error" className="mb-4">
                {categoriaError}
              </Alert>
            )}
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
                    const productosLabel = `${totalProductos} ${totalProductos === 1 ? 'producto' : 'productos'}`;
                    return (
                      <TablaFila key={categoria.id} className="transition-colors hover:bg-[var(--color-surface-muted)]">
                        <TablaCelda className="font-semibold text-[var(--color-text)]">{categoria.nombre}</TablaCelda>
                        <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{productosLabel}</TablaCelda>
                        <TablaCelda>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${Boolean(categoria.activo ?? true) ? 'border-green-200 bg-green-50 text-green-700' : 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]'}`}>
                            {Boolean(categoria.activo ?? true) ? 'Activa' : 'Inactiva'}
                          </span>
                        </TablaCelda>
                        <TablaCelda>
                          <TableActions>
                            <TableActionButton
                              variant="secondary"
                              icon={<PiPencilSimple />}
                              aria-label={`Editar categoría ${categoria.nombre}`}
                              title="Editar categoría"
                              onClick={() => openCategoriaEdit(categoria)}
                            >
                              Editar
                            </TableActionButton>
                            <TableActionButton
                              variant="danger"
                              icon={<PiTrash />}
                              aria-label={`Eliminar categoría ${categoria.nombre}`}
                              title={totalProductos > 0 ? 'Eliminar categoría (solo si queda sin productos)' : 'Eliminar categoría'}
                              onClick={() => onRequestDeleteCategoria(categoria)}
                            >
                              Eliminar
                            </TableActionButton>
                          </TableActions>
                        </TablaCelda>
                      </TablaFila>
                    );
                  })}
                  {categoriasOrdenadas.length === 0 && (
                    <TablaFila>
                      <TablaCelda colSpan={4}>
                        <EmptyState
                          title="Sin categorías registradas"
                          description="Crea una categoría para organizar el catálogo."
                        />
                      </TablaCelda>
                    </TablaFila>
                  )}
                </TablaCuerpo>
              </Tabla>
          </div>
        </div>
      </Modal>

      <Modal open={categoriaEditorOpen} onClose={() => setCategoriaEditorOpen(false)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">
                {categoriaMode === 'edit' ? 'Editar categoría' : 'Nueva categoría'}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)]">Los cambios se reflejan en los selectores del sistema.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={() => setCategoriaEditorOpen(false)}>
              X
            </Button>
          </div>

          <Field label="Nombre">
            <Input
              value={categoriaForm.nombre}
              onChange={(e) => setCategoriaForm((prev) => ({ ...prev, nombre: e.target.value }))}
              placeholder="Nombre de categoría"
            />
          </Field>

          <div className="space-y-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
            <p className={labelClassName()}>Estado</p>
            <Switch
              checked={categoriaForm.activo}
              onChange={(checked) => setCategoriaForm((prev) => ({ ...prev, activo: checked }))}
              label="Categoría activa"
              description="Si está inactiva, dejará de aparecer en formularios y nuevas operaciones."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCategoriaEditorOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onSaveCategoria} disabled={categoriaSaving}>
              {categoriaSaving ? 'Guardando...' : categoriaMode === 'edit' ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(categoriaDeactivateConfirm)} onClose={() => setCategoriaDeactivateConfirm(null)} maxWidthClass="max-w-md" panelClassName="p-5">
        <div className="space-y-4">
          <div>
            <h3 className="ui-panel-title">Desactivar categoría</h3>
            <p className="ui-panel-description">
              La categoría dejará de aparecer en formularios y nuevas operaciones.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Categoría:</p>
            <p className="text-sm font-semibold text-[var(--color-text)]">{categoriaDeactivateConfirm?.nombre}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCategoriaDeactivateConfirm(null)} disabled={categoriaSaving}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!categoriaDeactivateConfirm?.payload) return;
                await commitSaveCategoria(categoriaDeactivateConfirm.payload);
                setCategoriaDeactivateConfirm(null);
              }}
              disabled={categoriaSaving}
            >
              {categoriaSaving ? 'Desactivando...' : 'Desactivar categoría'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(categoriaDeleteTarget)}
        onClose={() => setCategoriaDeleteTarget(null)}
        onConfirm={onConfirmDeleteCategoria}
        title="Eliminar categoría"
        description={`Se eliminará ${categoriaDeleteTarget?.nombre || 'la categoría'} de forma permanente.`}
        confirmLabel={categoriaDeleteLoading ? 'Eliminando...' : 'Eliminar'}
        confirmVariant="danger"
      />

      <Modal open={Boolean(categoriaDeleteError)} onClose={() => setCategoriaDeleteError(null)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div>
            <h3 className="ui-panel-title">No se puede eliminar</h3>
            <p className="ui-panel-description">{categoriaDeleteError?.message || 'No se pudo completar la acción'}</p>
            {Number.isFinite(Number(categoriaDeleteError?.totalProductos)) ? (
              <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
                Productos asociados: {categoriaDeleteError.totalProductos}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setCategoriaDeleteError(null)}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
