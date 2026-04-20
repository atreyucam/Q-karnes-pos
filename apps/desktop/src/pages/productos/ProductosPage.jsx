import { useEffect, useMemo, useState } from 'react';
import { PiFolders, PiPencilSimple, PiPlus, PiTrash, PiWarningCircle } from 'react-icons/pi';
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
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';
import useBooleanSwitch from '../../shared/hooks/useBooleanSwitch';

const PAGE_SIZE = 10;
const PRODUCT_ROLE_OPTIONS = [
  { key: 'es_vendible', label: 'Vendible', hint: 'Aparece en ventas.' },
  { key: 'es_transformable', label: 'Transformable', hint: 'Puede usarse como padre en transformaciones.' },
  { key: 'es_insumo', label: 'Insumo', hint: 'Uso interno.' },
  { key: 'es_merma', label: 'Merma', hint: 'Producto técnico no comercial.' }
];
const PRODUCT_ROLE_FILTER_OPTIONS = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'VENDIBLE', label: 'Vendible', key: 'es_vendible' },
  { value: 'TRANSFORMABLE', label: 'Transformable', key: 'es_transformable' },
  { value: 'INSUMO', label: 'Insumo', key: 'es_insumo' },
  { value: 'MERMA', label: 'Merma', key: 'es_merma' }
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

function RoleBadge({ label, tone = 'neutral' }) {
  const toneClass = {
    success: 'border-[color-mix(in_oklab,var(--color-success)_35%,white_65%)] bg-[color-mix(in_oklab,var(--color-success)_12%,white_88%)] text-[color-mix(in_oklab,var(--color-success)_68%,black_32%)]',
    info: 'border-[color-mix(in_oklab,var(--color-primary)_35%,white_65%)] bg-[color-mix(in_oklab,var(--color-primary)_12%,white_88%)] text-[color-mix(in_oklab,var(--color-primary)_72%,black_28%)]',
    warning: 'border-[color-mix(in_oklab,var(--color-warning)_35%,white_65%)] bg-[color-mix(in_oklab,var(--color-warning)_12%,white_88%)] text-[color-mix(in_oklab,var(--color-warning)_72%,black_28%)]',
    danger: 'border-[color-mix(in_oklab,var(--color-danger)_35%,white_65%)] bg-[color-mix(in_oklab,var(--color-danger)_12%,white_88%)] text-[color-mix(in_oklab,var(--color-danger)_72%,black_28%)]',
    neutral: 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]'
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
}

function roleTone(roleKey) {
  if (roleKey === 'es_vendible') return 'success';
  if (roleKey === 'es_transformable') return 'info';
  if (roleKey === 'es_insumo') return 'warning';
  if (roleKey === 'es_merma') return 'danger';
  return 'neutral';
}

function resolveRoleFilterParams(roleValue) {
  const selectedRole = PRODUCT_ROLE_FILTER_OPTIONS.find((option) => option.value === roleValue);
  if (!selectedRole?.key) return {};
  return { [selectedRole.key]: 1 };
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

export default function ProductosPage() {
  const { productos, error, loading, listar, crear, actualizar } = useProductosStore();
  const [categorias, setCategorias] = useState([]);
  const [allProductos, setAllProductos] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', categoria: 'TODAS', estado: 'TODOS', rol: 'TODOS' });
  const [productoModal, setProductoModal] = useState({ open: false, mode: 'create' });
  const [productoForm, setProductoForm] = useState(emptyProductoForm);
  const [localError, setLocalError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [categoriaManagerOpen, setCategoriaManagerOpen] = useState(false);
  const [categoriaEditorOpen, setCategoriaEditorOpen] = useState(false);
  const [categoriaForm, setCategoriaForm] = useState(emptyCategoriaForm);
  const [categoriaMode, setCategoriaMode] = useState('create');
  const [categoriaError, setCategoriaError] = useState('');
  const [categoriaFeedback, setCategoriaFeedback] = useState('');
  const [categoriaSaving, setCategoriaSaving] = useState(false);
  const [categoriaDeleteTarget, setCategoriaDeleteTarget] = useState(null);
  const [categoriaDeleteError, setCategoriaDeleteError] = useState('');
  const [categoriaDeleteLoading, setCategoriaDeleteLoading] = useState(false);

  const refreshList = () =>
    listar({
      search: filtros.search || undefined,
      categoria_id: filtros.categoria === 'TODAS' ? undefined : Number(filtros.categoria),
      activo: filtros.estado === 'TODOS' ? undefined : filtros.estado,
      ...resolveRoleFilterParams(filtros.rol)
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

  const productosOrdenados = useMemo(
    () => [...productos].sort((a, b) => {
      const aEnMinimo = Number(a.stock_actual || 0) <= Number(a.stock_minimo || 0) ? 0 : 1;
      const bEnMinimo = Number(b.stock_actual || 0) <= Number(b.stock_minimo || 0) ? 0 : 1;
      if (aEnMinimo !== bEnMinimo) return aEnMinimo - bEnMinimo;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    }),
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
      precio_venta: String(Number(producto.precio_venta || producto.precio_referencia || 0)),
      stock_minimo: String(Number(producto.stock_minimo || 0)),
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
    setCategoriaForm(emptyCategoriaForm);
    setCategoriaError('');
  };

  const openCategoriaCreateModal = () => {
    setCategoriaMode('create');
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
      } else {
        await crear(payload);
      }
      closeProductoModal();
      await Promise.all([refreshList(), refreshCategorias()]);
    } catch (err) {
      setLocalError(err.message || 'No se pudo guardar el producto');
    }
  };

  const productoStatusSwitch = useBooleanSwitch({
    getValue: (producto) => Boolean(producto.activo),
    isSensitive: (producto, nextValue) => Boolean(producto.activo) && !nextValue,
    onCommit: async (producto, nextValue) => {
      setFeedback('');
      setLocalError('');
      await actualizar(producto.id, { activo: nextValue });
      await Promise.all([refreshList(), refreshCategorias()]);
      setFeedback(`Producto ${nextValue ? 'activado' : 'desactivado'}: ${producto.nombre}`);
    },
    onError: (nextError, producto, nextValue) => {
      setFeedback('');
      setLocalError(nextError.message || `No se pudo ${nextValue ? 'activar' : 'desactivar'} el producto ${producto.nombre}.`);
    }
  });

  const onSaveCategoria = async () => {
    setCategoriaError('');
    setCategoriaFeedback('');
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
      await refreshList();
      setCategoriaEditorOpen(false);
      setCategoriaMode('create');
      setCategoriaForm(emptyCategoriaForm);
      setCategoriaFeedback(categoriaMode === 'edit' ? 'Categoría actualizada correctamente.' : 'Categoría creada correctamente.');
    } catch (nextError) {
      setCategoriaError(parseApiError(nextError));
    } finally {
      setCategoriaSaving(false);
    }
  };

  const categoriaStatusSwitch = useBooleanSwitch({
    getValue: (categoria) => Boolean(categoria.activo ?? true),
    isSensitive: (categoria, nextValue) => Boolean(categoria.activo ?? true) && !nextValue,
    onCommit: async (categoria, nextValue) => {
      setCategoriaError('');
      setCategoriaFeedback('');
      await updateCategoria(categoria.id, { activo: nextValue });
      await refreshCategorias();
      await refreshList();
      setCategoriaFeedback(`Categoría ${nextValue ? 'activada' : 'desactivada'}: ${categoria.nombre}`);
    },
    onError: (nextError, categoria, nextValue) => {
      setCategoriaFeedback('');
      setCategoriaError(parseApiError(nextError) || `No se pudo ${nextValue ? 'activar' : 'desactivar'} la categoría ${categoria.nombre}.`);
    }
  });

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

      {(error || localError || feedback) && (
        <Alert tone={error || localError ? 'error' : 'success'}>
          {localError || error || feedback}
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
            variant="secondary"
            className="w-full xl:w-auto"
            onClick={() => {
              setPagina(1);
              setFiltros({ search: '', categoria: 'TODAS', estado: 'TODOS', rol: 'TODOS' });
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
          <Select value={filtros.rol} onChange={(e) => onChangeFiltro('rol', e.target.value)}>
            {PRODUCT_ROLE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
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
                  <TablaCelda as="th">Código</TablaCelda>
                  <TablaCelda as="th">Nombre</TablaCelda>
                  <TablaCelda as="th">Categoría</TablaCelda>
                  <TablaCelda as="th" className="text-right">Stock visible</TablaCelda>
                  <TablaCelda as="th">Unidad</TablaCelda>
                  <TablaCelda as="th" className="text-right">Precio venta</TablaCelda>
                  <TablaCelda as="th" className="text-right">Costo visible</TablaCelda>
                  <TablaCelda as="th">Roles</TablaCelda>
                  <TablaCelda as="th">Estado</TablaCelda>
                  <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {productosPaginados.map((producto) => {
                  const hasAlert = Number(producto.stock_actual || 0) <= Number(producto.stock_minimo || 0);
                  const unidadMedida = producto.unidad_medida || producto.unidad || 'UND';
                  const currentChecked = productoStatusSwitch.resolveChecked(producto);
                  return (
                    <TablaFila
                      key={producto.id}
                      className={hasAlert ? 'bg-[color-mix(in_oklab,var(--color-warning-soft)_74%,white_26%)]' : ''}
                    >
                      <TablaCelda className="font-semibold text-[var(--color-text)]">
                        <div className="flex items-center gap-2">
                          {hasAlert ? (
                            <PiWarningCircle
                              className="shrink-0 cursor-pointer text-[1.2rem] text-warning"
                              title="Stock bajo el mínimo"
                              aria-label="Stock bajo el mínimo"
                            />
                          ) : null}
                          <span>{producto.codigo}</span>
                        </div>
                      </TablaCelda>
                      <TablaCelda>
                        <div className="space-y-1">
                          <p className="font-semibold text-[var(--color-text)]">{producto.nombre}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            Stock mínimo: {formatQtyByUnit(producto.stock_minimo, unidadMedida)} {unidadMedida}
                          </p>
                        </div>
                      </TablaCelda>
                      <TablaCelda>{producto.categoria_nombre || 'Sin categoría'}</TablaCelda>
                      <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                        {formatQtyByUnit(producto.stock_actual, unidadMedida)}
                      </TablaCelda>
                      <TablaCelda>{unidadMedida}</TablaCelda>
                      <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(producto.precio_venta)}</TablaCelda>
                      <TablaCelda className="text-right">{formatMoney(producto.costo_promedio)}</TablaCelda>
                      <TablaCelda>
                        <div className="flex flex-wrap gap-1.5">
                          {getProductRoles(producto).map((role) => (
                            <RoleBadge key={`${producto.id}-${role.key}`} label={role.label} tone={roleTone(role.key)} />
                          ))}
                        </div>
                      </TablaCelda>
                      <TablaCelda>
                        <Switch
                          checked={currentChecked}
                          onChange={(checked) => {
                            setFeedback('');
                            productoStatusSwitch.requestChange(producto, checked);
                          }}
                          label={currentChecked ? 'Activo' : 'Inactivo'}
                          busy={productoStatusSwitch.isPending(producto)}
                          disabled={productoStatusSwitch.isPending(producto)}
                        />
                      </TablaCelda>
                      <TablaCelda>
                        <TableActions>
                          <TableActionButton
                            variant="warning"
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

        <div className="mt-4 grid gap-3 md:grid-cols-2">
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
              placeholder={productoForm.es_vendible ? '0.00' : 'Opcional'}
            />
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              {productoForm.es_vendible ? 'Obligatorio y mayor que cero para productos vendibles.' : 'Puede quedar en cero si el producto no aparece en ventas.'}
            </p>
          </div>

          <div>
            <label className={labelClassName()}>Stock mínimo</label>
            <Input
              className="mt-2"
              value={productoForm.stock_minimo}
              onChange={(e) => setProductoForm((prev) => ({ ...prev, stock_minimo: sanitizeQtyInput(e.target.value, prev.unidad_medida) }))}
              placeholder="0"
            />
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              {productoForm.unidad_medida === 'UND' ? 'UND se maneja como entero.' : 'KG y LB permiten decimales visibles.'}
            </p>
          </div>

          <div className="md:col-span-2">
            <label className={labelClassName()}>Roles del producto</label>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {PRODUCT_ROLE_OPTIONS.map((role) => (
                <div
                  key={role.key}
                  className={`rounded-lg border px-3 py-3 ${
                    productoForm.es_merma && role.key !== 'es_merma'
                      ? 'border-[var(--color-border)] bg-[var(--color-surface-muted)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <Switch
                    checked={Boolean(productoForm[role.key])}
                    disabled={productoForm.es_merma && role.key !== 'es_merma'}
                    onChange={(checked) => onToggleRole(role.key, checked)}
                    label={role.label}
                    description={role.hint}
                  />
                </div>
              ))}

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
                <Switch
                  checked={productoForm.activo}
                  onChange={(checked) => setProductoForm((prev) => ({ ...prev, activo: checked }))}
                  label="Producto activo"
                  description="Si está inactivo no aparece para nuevas operaciones."
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Debe existir al menos un rol activo. `Merma` es exclusivo y bloquea los demás roles mientras esté activo.
            </p>
          </div>

          {productoModal.mode === 'edit' && (
            <div className="md:col-span-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text-muted)]">
              Costo promedio actual: <strong className="text-[var(--color-text)]">{formatMoney(Number(productos.find((row) => row.id === productoForm.id)?.costo_promedio || 0))}</strong>
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
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <div className="ui-modal-header">
              <div className="ui-modal-header-copy">
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Gestionar categorías</h3>
                <p className="text-sm text-[var(--color-text-muted)]">Crea, renombra, activa, desactiva o elimina categorías sin productos asociados.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={openCategoriaCreateModal}>
                  Nueva categoría
                </Button>
              <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={closeCategoriaManager}>
                X
              </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto px-5 py-5">
            {(categoriaError || categoriaFeedback) && (
              <Alert tone={categoriaError ? 'error' : 'success'} className="mb-4">
                {categoriaError || categoriaFeedback}
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
                    return (
                      <TablaFila key={categoria.id}>
                        <TablaCelda className="font-semibold text-[var(--color-text)]">{categoria.nombre}</TablaCelda>
                        <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{totalProductos}</TablaCelda>
                        <TablaCelda>
                          <Switch
                            checked={categoriaStatusSwitch.resolveChecked(categoria)}
                            onChange={(checked) => {
                              setCategoriaFeedback('');
                              categoriaStatusSwitch.requestChange(categoria, checked);
                            }}
                            label={categoriaStatusSwitch.resolveChecked(categoria) ? 'Activa' : 'Inactiva'}
                            busy={categoriaStatusSwitch.isPending(categoria)}
                            disabled={categoriaStatusSwitch.isPending(categoria)}
                          />
                        </TablaCelda>
                        <TablaCelda>
                          <TableActions>
                            <TableActionButton
                              variant="warning"
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

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3">
            <Switch
              checked={categoriaForm.activo}
              onChange={(checked) => setCategoriaForm((prev) => ({ ...prev, activo: checked }))}
              label="Categoría activa"
              description="Si está inactiva deja de aparecer como opción en formularios."
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

      <ConfirmDialog
        open={Boolean(productoStatusSwitch.confirmState)}
        onClose={productoStatusSwitch.cancelConfirm}
        onConfirm={productoStatusSwitch.confirmChange}
        title="Desactivar producto"
        description={productoStatusSwitch.confirmState ? `Vas a desactivar el producto ${productoStatusSwitch.confirmState.item.nombre}.` : ''}
        confirmLabel={productoStatusSwitch.confirmState && productoStatusSwitch.isPending(productoStatusSwitch.confirmState.item) ? 'Desactivando...' : 'Si, desactivar'}
        confirmVariant="danger"
        confirmLoading={Boolean(productoStatusSwitch.confirmState && productoStatusSwitch.isPending(productoStatusSwitch.confirmState.item))}
      />

      <ConfirmDialog
        open={Boolean(categoriaStatusSwitch.confirmState)}
        onClose={categoriaStatusSwitch.cancelConfirm}
        onConfirm={categoriaStatusSwitch.confirmChange}
        title="Desactivar categoría"
        description={categoriaStatusSwitch.confirmState ? `Vas a desactivar la categoría ${categoriaStatusSwitch.confirmState.item.nombre}.` : ''}
        confirmLabel={categoriaStatusSwitch.confirmState && categoriaStatusSwitch.isPending(categoriaStatusSwitch.confirmState.item) ? 'Desactivando...' : 'Si, desactivar'}
        confirmVariant="danger"
        confirmLoading={Boolean(categoriaStatusSwitch.confirmState && categoriaStatusSwitch.isPending(categoriaStatusSwitch.confirmState.item))}
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
