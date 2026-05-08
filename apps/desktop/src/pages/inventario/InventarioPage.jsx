import { useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiCheckCircle, PiClipboardText, PiPackage, PiPencilSimple, PiWarningCircle, PiWaves } from 'react-icons/pi';
import { useSearchParams } from 'react-router-dom';
import { parseApiError } from '../../lib/apiClient';
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
  MetricTile,
  Modal,
  PageHeader,
  Paginador,
  Select,
  Tabs,
  TableActions,
  TableActionButton,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  TipoBadge
} from '../../ui';
import { useInventarioStore } from '../../stores/inventarioStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatCurrency, formatNumber, formatWeight } from '../../lib/formatNumber';
import { getUnidad, sanitizeQtyInput } from '../../lib/formatQty';
import { fetchCategorias } from '../../services/catalogoService';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';

const PAGE_SIZE = GLOBAL_PAGE_SIZE;
const MODAL_PAGE_SIZE = GLOBAL_PAGE_SIZE;

function formatInventoryQty(value, unidad, options = {}) {
  const unit = getUnidad(unidad);
  if (options.appendUnit) return formatWeight(value, unit);
  return formatNumber(value);
}

function sanitizeCostInput(value) {
  return String(value || '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');
}

function getInventoryValue(row) {
  if (row?.valor_inventario_centavos !== undefined && row?.valor_inventario_centavos !== null) {
    return Number(row.valor_inventario_centavos || 0) / 100;
  }
  return Number(row?.stock_actual || 0) * Number(row?.costo_promedio || 0);
}

function hasInventoryAlert(row) {
  return Number(row?.stock_actual || 0) <= Number(row?.stock_minimo || 0);
}

function getInventoryStatus(row) {
  if (Number(row?.stock_actual || 0) <= 0) return { label: 'Sin stock', tone: 'danger' };
  if (hasInventoryAlert(row)) return { label: 'Bajo mínimo', tone: 'warning' };
  return { label: 'Normal', tone: 'normal' };
}

function getInventoryAlertPriority(row) {
  const stockActual = Number(row?.stock_actual || 0);
  const stockMinimo = Number(row?.stock_minimo || 0);
  if (stockActual <= 0) return 0;
  if (stockActual <= stockMinimo) return 1;
  return 2;
}

function resolveAlertLabel(row) {
  return getInventoryStatus(row).label;
}

function resolveOrigenLabel(row) {
  if (row?.origen_tipo && row?.origen_id) return `${row.origen_tipo}:${row.origen_id}`;
  if (row?.origen_tipo) return row.origen_tipo;
  return row?.referencia || '-';
}

function filterProductosCatalogo(productos, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return productos;
  return productos.filter((producto) =>
    [producto.codigo, producto.nombre].some((value) => String(value || '').toLowerCase().includes(q))
  );
}

function InventoryActionModal({
  open,
  onClose,
  title,
  description,
  children,
  onConfirm,
  confirmLabel,
  confirmVariant = 'primary',
  loading
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-5xl" panelClassName="p-5">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="ui-panel-title">{title}</h3>
            <p className="ui-panel-description">{description}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            X
          </Button>
        </div>
        <div className="space-y-4">{children}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={loading}>
            {loading ? 'Procesando...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function InventoryProductPickerTable({
  search,
  onSearchChange,
  rows,
  page,
  totalPages,
  totalRecords,
  selectedId,
  onSelect,
  onPageChange
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Buscar producto</label>
        <Input className="mt-2" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Código o nombre" />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Código</TablaCelda>
              <TablaCelda as="th">Producto</TablaCelda>
              <TablaCelda as="th" className="text-right">Stock</TablaCelda>
              <TablaCelda as="th" className="text-right">Acción</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {rows.length === 0 ? (
              <TablaFila>
                <TablaCelda colSpan={4} className="text-center text-[var(--color-text-muted)]">
                  No hay productos para este filtro.
                </TablaCelda>
              </TablaFila>
            ) : rows.map((producto) => {
              const selected = String(selectedId || '') === String(producto.id);
              return (
                <TablaFila key={producto.id} className={selected ? 'bg-[var(--color-primary-soft)]' : ''}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">{producto.codigo}</TablaCelda>
                  <TablaCelda>{producto.nombre}</TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                    {formatInventoryQty(producto.stock_actual, producto.unidad_medida || producto.unidad, { appendUnit: true })}
                  </TablaCelda>
                  <TablaCelda>
                    <div className="flex justify-end">
                      <Button type="button" size="sm" variant={selected ? 'secondary' : 'primary'} onClick={() => onSelect(producto)}>
                        {selected ? 'Seleccionado' : 'Seleccionar'}
                      </Button>
                    </div>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>
      </div>

      <Paginador paginaActual={page} totalPaginas={totalPages} totalRegistros={totalRecords} mostrarSiempre onPageChange={onPageChange} />
    </div>
  );
}

export default function InventarioPage() {
  const {
    disponible,
    alertas,
    conteos,
    mermas,
    movimientos,
    loading,
    error,
    cargarDisponible,
    cargarAlertas,
    cargarConteos,
    cargarMermas,
    cargarMovimientos,
    crearConteo,
    aplicarConteo,
    ajustesMasivo,
    crearMerma,
    actualizarProducto
  } = useInventarioStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const alertaQuery = String(searchParams.get('alerta') || '').toLowerCase();
  const initialAlertaFiltro = alertaQuery === 'sin_stock' || alertaQuery === 'bajo_minimo'
    ? alertaQuery
    : '';

  const [categorias, setCategorias] = useState([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [searchFiltro, setSearchFiltro] = useState('');
  const [alertaFiltro, setAlertaFiltro] = useState(initialAlertaFiltro);
  const [tab, setTab] = useState('stock');
  const [pagina, setPagina] = useState(1);

  const [productoEdit, setProductoEdit] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', stock_minimo: '', activo: true, categoria_id: '' });

  const [showConteoModal, setShowConteoModal] = useState(false);
  const [showAjusteModal, setShowAjusteModal] = useState(false);
  const [showMermaModal, setShowMermaModal] = useState(false);
  const [conteoPendiente, setConteoPendiente] = useState(null);

  const [conteoForm, setConteoForm] = useState({
    producto_id: '',
    stock_conteo: '',
    observacion: '',
    costo_origen_tipo: 'PROMEDIO_ACTUAL',
    costo_unitario_manual: ''
  });
  const [ajusteForm, setAjusteForm] = useState({
    producto_id: '',
    tipo: 'ENTRADA',
    cantidad: '',
    referencia: '',
    observacion: '',
    costo_origen_tipo: 'PROMEDIO_ACTUAL',
    costo_unitario_manual: ''
  });
  const [mermaForm, setMermaForm] = useState({ producto_id: '', cantidad: '', motivo: 'Merma operativa' });
  const [conteoSearch, setConteoSearch] = useState('');
  const [ajusteSearch, setAjusteSearch] = useState('');
  const [mermaSearch, setMermaSearch] = useState('');
  const [conteoPickerPage, setConteoPickerPage] = useState(1);
  const [ajustePickerPage, setAjustePickerPage] = useState(1);
  const [mermaPickerPage, setMermaPickerPage] = useState(1);

  const [catalogoError, setCatalogoError] = useState('');
  const [formError, setFormError] = useState('');

  const refreshInventoryData = async () => {
    await Promise.all([
      cargarDisponible(),
      cargarAlertas(),
      cargarConteos(),
      cargarMermas(),
      cargarMovimientos()
    ]);
  };

  useEffect(() => {
    refreshInventoryData();

    fetchCategorias()
      .then((data) => {
        setCategorias(data || []);
        setCatalogoError('');
      })
      .catch((catalogError) => {
        setCategorias([]);
        setCatalogoError(parseApiError(catalogError));
      });
  }, [cargarDisponible, cargarAlertas, cargarConteos, cargarMermas, cargarMovimientos]);

  useEffect(() => {
    setPagina(1);
  }, [tab, categoriaFiltro, searchFiltro, disponible.length, conteos.length, mermas.length, movimientos.length]);

  useEffect(() => setConteoPickerPage(1), [conteoSearch]);
  useEffect(() => setAjustePickerPage(1), [ajusteSearch]);
  useEffect(() => setMermaPickerPage(1), [mermaSearch]);

  const productoOpciones = useMemo(() => {
    const source = Array.isArray(disponible) && disponible.length ? disponible : alertas;
    return [...(source || [])].sort((a, b) =>
      String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { sensitivity: 'base' })
    );
  }, [disponible, alertas]);

  const productoMap = useMemo(
    () => new Map(productoOpciones.map((producto) => [String(producto.id), producto])),
    [productoOpciones]
  );

  const conteoProducto = productoMap.get(String(conteoForm.producto_id || ''));
  const ajusteProducto = productoMap.get(String(ajusteForm.producto_id || ''));
  const mermaProducto = productoMap.get(String(mermaForm.producto_id || ''));

  const conteoDelta = useMemo(() => {
    if (!conteoProducto || conteoForm.stock_conteo === '') return 0;
    const conteo = Number(String(conteoForm.stock_conteo).replace(',', '.'));
    if (!Number.isFinite(conteo)) return 0;
    return conteo - Number(conteoProducto.stock_actual || 0);
  }, [conteoForm.stock_conteo, conteoProducto]);

  const isConteoPositivo = conteoDelta > 0;
  const isAjustePositivo = ajusteForm.tipo === 'ENTRADA';

  const conteoProductosFiltrados = useMemo(() => filterProductosCatalogo(productoOpciones, conteoSearch), [productoOpciones, conteoSearch]);
  const ajusteProductosFiltrados = useMemo(() => filterProductosCatalogo(productoOpciones, ajusteSearch), [productoOpciones, ajusteSearch]);
  const mermaProductosFiltrados = useMemo(() => filterProductosCatalogo(productoOpciones, mermaSearch), [productoOpciones, mermaSearch]);
  const conteoProductosPaginados = useMemo(() => conteoProductosFiltrados.slice((conteoPickerPage - 1) * MODAL_PAGE_SIZE, conteoPickerPage * MODAL_PAGE_SIZE), [conteoPickerPage, conteoProductosFiltrados]);
  const ajusteProductosPaginados = useMemo(() => ajusteProductosFiltrados.slice((ajustePickerPage - 1) * MODAL_PAGE_SIZE, ajustePickerPage * MODAL_PAGE_SIZE), [ajustePickerPage, ajusteProductosFiltrados]);
  const mermaProductosPaginados = useMemo(() => mermaProductosFiltrados.slice((mermaPickerPage - 1) * MODAL_PAGE_SIZE, mermaPickerPage * MODAL_PAGE_SIZE), [mermaPickerPage, mermaProductosFiltrados]);
  const conteoPickerTotal = Math.max(1, Math.ceil(conteoProductosFiltrados.length / MODAL_PAGE_SIZE));
  const ajustePickerTotal = Math.max(1, Math.ceil(ajusteProductosFiltrados.length / MODAL_PAGE_SIZE));
  const mermaPickerTotal = Math.max(1, Math.ceil(mermaProductosFiltrados.length / MODAL_PAGE_SIZE));

  const ajustesRows = useMemo(
    () => (movimientos || []).filter((row) => String(row.tipo || '').toUpperCase() === 'AJUSTE'),
    [movimientos]
  );

  const rowsByTab = useMemo(() => ({
    stock: disponible,
    movimientos,
    conteos,
    ajustes: ajustesRows,
    mermas
  }), [ajustesRows, conteos, disponible, mermas, movimientos]);

  const filteredRows = useMemo(() => {
    const rows = rowsByTab[tab] || [];
    if (tab !== 'stock') return rows;

    const q = searchFiltro.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (categoriaFiltro && String(row.categoria_id) !== String(categoriaFiltro)) return false;
      if (alertaFiltro === 'sin_stock' && Number(row.stock_actual || 0) > 0) return false;
      if (alertaFiltro === 'bajo_minimo' && Number(row.stock_actual || 0) > Number(row.stock_minimo || 0)) return false;
      if (!q) return true;
      return [row.codigo, row.nombre].some((value) => String(value || '').toLowerCase().includes(q));
    });
    return [...filtered].sort((a, b) => {
      const priorityA = getInventoryAlertPriority(a);
      const priorityB = getInventoryAlertPriority(b);
      if (priorityA !== priorityB) return priorityA - priorityB;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    });
  }, [rowsByTab, tab, categoriaFiltro, searchFiltro, alertaFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => filteredRows.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE),
    [filteredRows, pagina]
  );

  const totalValorInventario = useMemo(
    () => (disponible || []).reduce((acc, row) => acc + getInventoryValue(row), 0),
    [disponible]
  );

  const tabGuidance = {
    stock: 'Stock actual muestra stock visible, costo visible, valor visible y alerta por mínimo.',
    movimientos: 'Kardex operativo con origen, saldo resultante, costo visible y total visible.',
    conteos: 'Si la diferencia es positiva, debes elegir una política de costo.',
    ajustes: 'Los ajustes positivos exigen política de costo; los negativos consumen promedio actual.',
    mermas: 'La merma descuenta stock y valor del inventario.'
  };

  const resetProductEdit = () => {
    setProductoEdit(null);
    setEditForm({ nombre: '', stock_minimo: '', activo: true, categoria_id: '' });
  };

  const resetConteoModal = () => {
    setShowConteoModal(false);
    setConteoForm({
      producto_id: '',
      stock_conteo: '',
      observacion: '',
      costo_origen_tipo: 'PROMEDIO_ACTUAL',
      costo_unitario_manual: ''
    });
    setConteoSearch('');
    setConteoPickerPage(1);
  };

  const resetAjusteModal = () => {
    setShowAjusteModal(false);
    setAjusteForm({
      producto_id: '',
      tipo: 'ENTRADA',
      cantidad: '',
      referencia: '',
      observacion: '',
      costo_origen_tipo: 'PROMEDIO_ACTUAL',
      costo_unitario_manual: ''
    });
    setAjusteSearch('');
    setAjustePickerPage(1);
  };

  const resetMermaModal = () => {
    setShowMermaModal(false);
    setMermaForm({ producto_id: '', cantidad: '', motivo: 'Merma operativa' });
    setMermaSearch('');
    setMermaPickerPage(1);
  };

  const onGuardarProducto = async () => {
    setFormError('');
    if (!productoEdit) return;
    if (!String(editForm.nombre || '').trim()) {
      setFormError('El nombre del producto es obligatorio.');
      return;
    }
    if (editForm.stock_minimo === '' || Number(editForm.stock_minimo) < 0) {
      setFormError('El stock mínimo debe ser mayor o igual a 0.');
      return;
    }

    await actualizarProducto(productoEdit.id, {
      nombre: editForm.nombre.trim(),
      stock_minimo: Number(editForm.stock_minimo || 0),
      activo: editForm.activo,
      categoria_id: editForm.categoria_id ? Number(editForm.categoria_id) : null
    });

    resetProductEdit();
    await Promise.all([cargarDisponible(), cargarAlertas()]);
  };

  const onCrearConteo = async () => {
    setFormError('');
    if (!conteoForm.producto_id) {
      setFormError('Selecciona un producto para crear el conteo.');
      return;
    }
    if (conteoForm.stock_conteo === '') {
      setFormError('Ingresa el stock contado.');
      return;
    }
    if (isConteoPositivo && conteoForm.costo_origen_tipo === 'MANUAL' && Number(conteoForm.costo_unitario_manual || 0) <= 0) {
      setFormError('Ingresa el costo manual para la diferencia positiva del conteo.');
      return;
    }

    await crearConteo({
      observacion: conteoForm.observacion.trim() || undefined,
      items: [
        {
          producto_id: Number(conteoForm.producto_id),
          stock_conteo: Number(String(conteoForm.stock_conteo).replace(',', '.')),
          ...(isConteoPositivo ? {
            costo_origen_tipo: conteoForm.costo_origen_tipo,
            ...(conteoForm.costo_origen_tipo === 'MANUAL'
              ? { costo_unitario_manual: Number(String(conteoForm.costo_unitario_manual).replace(',', '.')) }
              : {})
          } : {})
        }
      ]
    });

    resetConteoModal();
    setTab('conteos');
    await Promise.all([cargarConteos(), cargarDisponible(), cargarAlertas()]);
  };

  const onConfirmarAplicarConteo = async () => {
    if (!conteoPendiente?.id) return;
    setFormError('');
    await aplicarConteo(Number(conteoPendiente.id));
    setConteoPendiente(null);
    await Promise.all([cargarConteos(), cargarDisponible(), cargarMovimientos(), cargarAlertas()]);
  };

  const onAplicarAjuste = async () => {
    setFormError('');
    if (!ajusteForm.producto_id) {
      setFormError('Selecciona un producto para aplicar ajuste.');
      return;
    }
    if (!ajusteForm.cantidad || Number(String(ajusteForm.cantidad).replace(',', '.')) <= 0) {
      setFormError('La cantidad debe ser mayor a 0.');
      return;
    }
    if (isAjustePositivo && ajusteForm.costo_origen_tipo === 'MANUAL' && Number(ajusteForm.costo_unitario_manual || 0) <= 0) {
      setFormError('Ingresa el costo manual del ajuste positivo.');
      return;
    }

    const cantidad = Number(String(ajusteForm.cantidad).replace(',', '.'));

    await ajustesMasivo({
      observacion: ajusteForm.observacion.trim() || undefined,
      items: [
        {
          producto_id: Number(ajusteForm.producto_id),
          cantidad: ajusteForm.tipo === 'SALIDA' ? -cantidad : cantidad,
          referencia: ajusteForm.referencia.trim() || 'AJUSTE_MANUAL',
          ...(isAjustePositivo ? {
            costo_origen_tipo: ajusteForm.costo_origen_tipo,
            ...(ajusteForm.costo_origen_tipo === 'MANUAL'
              ? { costo_unitario_manual: Number(String(ajusteForm.costo_unitario_manual).replace(',', '.')) }
              : {})
          } : {})
        }
      ]
    });

    resetAjusteModal();
    setTab('ajustes');
    await Promise.all([cargarDisponible(), cargarMovimientos(), cargarAlertas()]);
  };

  const onCrearMerma = async () => {
    setFormError('');
    if (!mermaForm.producto_id) {
      setFormError('Selecciona un producto para registrar merma.');
      return;
    }
    if (!mermaForm.cantidad || Number(String(mermaForm.cantidad).replace(',', '.')) <= 0) {
      setFormError('La cantidad de merma debe ser mayor a 0.');
      return;
    }
    if (!String(mermaForm.motivo || '').trim()) {
      setFormError('Ingresa un motivo para la merma.');
      return;
    }

    await crearMerma({
      producto_id: Number(mermaForm.producto_id),
      cantidad: Number(String(mermaForm.cantidad).replace(',', '.')),
      motivo: mermaForm.motivo.trim()
    });

    resetMermaModal();
    setTab('mermas');
    await Promise.all([cargarDisponible(), cargarMermas(), cargarMovimientos(), cargarAlertas()]);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventario"
        description="Stock actual, kardex, conteos, ajustes y mermas sobre inventario valorizado."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowConteoModal(true)}>
              Nuevo conteo
            </Button>
            <Button variant="secondary" onClick={() => setShowAjusteModal(true)}>
              Ajuste manual
            </Button>
            <Button variant="danger" onClick={() => setShowMermaModal(true)}>
              Registrar merma
            </Button>
            <Button variant="ghost" onClick={refreshInventoryData} disabled={loading}>
              Recargar
            </Button>
          </>
        }
      />

      {(error || catalogoError || formError) && (
        <Alert tone="error">
          {formError || error || catalogoError}
        </Alert>
      )}
      <Alert tone="info">{tabGuidance[tab]}</Alert>

      <section className="ui-kpi-summary-shell">
        <div className="mb-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Resumen de inventario</p>
            <p className="text-xs text-[var(--color-text-muted)]">Vista operacional del stock y su valorización visible.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile icon={PiWarningCircle} value={formatNumber(alertas.length)} label="Alertas" tone="warning" />
          <MetricTile icon={PiArrowsClockwise} value={formatCurrency(totalValorInventario)} label="Valor inventario" tone="info" />
          <MetricTile icon={PiPackage} value={formatNumber(disponible.length)} label="Productos" tone="primary" />
          <MetricTile icon={PiClipboardText} value={formatNumber(conteos.length)} label="Conteos" tone="success" />
          <MetricTile icon={PiWaves} value={formatNumber(mermas.length)} label="Mermas" tone="danger" />
        </div>
      </section>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            value={tab}
            onChange={(nextTab) => setTab(nextTab)}
            items={[
              { key: 'stock', label: 'Stock actual' },
              { key: 'movimientos', label: 'Movimientos / Kardex' },
              { key: 'conteos', label: 'Conteos' },
              { key: 'ajustes', label: 'Ajustes' },
              { key: 'mermas', label: 'Mermas' }
            ]}
            className="w-full"
            listClassName="flex-wrap"
          />
        </div>

        {tab === 'stock' && (
          <FiltersBar
            className="border-none bg-transparent p-0 shadow-none"
            search={(
              <Field label="Buscar">
                <Input value={searchFiltro} onChange={(e) => setSearchFiltro(e.target.value)} placeholder="Código o nombre" />
              </Field>
            )}
            actions={(
              <Button
                type="button"
                variant="neutral"
                className="w-full xl:w-auto"
                onClick={() => {
                  setCategoriaFiltro('');
                  setSearchFiltro('');
                  setAlertaFiltro('');
                  const nextParams = new URLSearchParams(searchParams);
                  nextParams.delete('alerta');
                  setSearchParams(nextParams, { replace: true });
                }}
              >
                Limpiar filtros
              </Button>
            )}
          >
            <Field label="Categoría">
              <Select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
                <option value="">Todas</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Alerta">
              <Select
                value={alertaFiltro}
                onChange={(e) => {
                  const value = e.target.value;
                  setAlertaFiltro(value);
                  const nextParams = new URLSearchParams(searchParams);
                  if (value) nextParams.set('alerta', value);
                  else nextParams.delete('alerta');
                  setSearchParams(nextParams, { replace: true });
                }}
              >
                <option value="">Todas</option>
                <option value="bajo_minimo">Bajo mínimo</option>
                <option value="sin_stock">Sin stock</option>
              </Select>
            </Field>
          </FiltersBar>
        )}

        <Tabla>
          <TablaCabecera>
            <tr>
              {tab === 'stock' && (
                <>
                  <TablaCelda as="th" className="w-3 px-0" aria-hidden />
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th" className="text-right">Stock visible</TablaCelda>
                  <TablaCelda as="th" className="text-right">Costo visible</TablaCelda>
                  <TablaCelda as="th" className="text-right">Valor visible</TablaCelda>
                  <TablaCelda as="th">Estado Alerta</TablaCelda>
                  <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
                </>
              )}
              {tab === 'movimientos' && (
                <>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Tipo</TablaCelda>
                  <TablaCelda as="th">Origen</TablaCelda>
                  <TablaCelda as="th" className="text-right">Cantidad</TablaCelda>
                  <TablaCelda as="th" className="text-right">Saldo resultante</TablaCelda>
                  <TablaCelda as="th" className="text-right">Costo visible</TablaCelda>
                  <TablaCelda as="th" className="text-right">Total visible</TablaCelda>
                </>
              )}
              {tab === 'conteos' && (
                <>
                  <TablaCelda as="th">ID</TablaCelda>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Estado</TablaCelda>
                  <TablaCelda as="th">Usuario</TablaCelda>
                  <TablaCelda as="th" className="text-right">Items</TablaCelda>
                  <TablaCelda as="th" className="text-right">Dif. total</TablaCelda>
                  <TablaCelda as="th">Observación</TablaCelda>
                  <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
                </>
              )}
              {tab === 'ajustes' && (
                <>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Referencia</TablaCelda>
                  <TablaCelda as="th" className="text-right">Cantidad</TablaCelda>
                  <TablaCelda as="th" className="text-right">Costo visible</TablaCelda>
                  <TablaCelda as="th" className="text-right">Total visible</TablaCelda>
                </>
              )}
              {tab === 'mermas' && (
                <>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th" className="text-right">Cantidad</TablaCelda>
                  <TablaCelda as="th">Motivo</TablaCelda>
                </>
              )}
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {pagedRows.length === 0 && (
              <TablaFila>
                <TablaCelda colSpan={tab === 'stock' ? 7 : tab === 'movimientos' ? 8 : tab === 'conteos' ? 8 : tab === 'ajustes' ? 6 : 4}>
                  <EmptyState title="Sin registros" description="No hay datos para la vista actual." />
                </TablaCelda>
              </TablaFila>
            )}

            {pagedRows.map((row) => {
              const alertaLabel = tab === 'stock' ? resolveAlertLabel(row) : '';
              const stockStatus = tab === 'stock' ? getInventoryStatus(row) : null;
              const statusAccentClass = stockStatus?.tone === 'danger'
                ? 'bg-[#d72c0d]'
                : stockStatus?.tone === 'warning'
                  ? 'bg-[#b98900]'
                  : 'bg-[#c4cdd5]';
              return (
              <TablaFila key={`${tab}-${row.id}`} className="hover:!bg-[#fafafa] hover:outline hover:outline-1 hover:outline-[#dfe3e8]">
                {tab === 'stock' && (
                  <>
                    <TablaCelda className="w-3 px-0">
                      <span className={`block h-14 w-[3px] rounded-r ${statusAccentClass}`} aria-hidden />
                    </TablaCelda>
                    <TablaCelda className="font-semibold text-[var(--color-text)]">
                      <div>
                        <p>{row.nombre}</p>
                        <p className="text-xs font-normal text-[var(--color-text-muted)]">{row.categoria_nombre || 'Sin categoría'}</p>
                      </div>
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      <div className="font-semibold text-[var(--color-text)]">{formatInventoryQty(row.stock_actual, row.unidad_medida || row.unidad, { appendUnit: true })}</div>
                      <p className="text-[11px] text-[var(--color-text-muted)]">Mín: {formatInventoryQty(row.stock_minimo, row.unidad_medida || row.unidad, { appendUnit: true })}</p>
                    </TablaCelda>
                    <TablaCelda className="text-right">{formatCurrency(row.costo_promedio)}</TablaCelda>
                    <TablaCelda className="text-right">{formatCurrency(getInventoryValue(row))}</TablaCelda>
                    <TablaCelda>{alertaLabel}</TablaCelda>
                    <TablaCelda>
                      <TableActions>
                        <TableActionButton
                          variant="neutral"
                          className="border-[#dfe3e8] bg-white hover:bg-[#f6f6f7]"
                          icon={<PiPencilSimple />}
                          aria-label={`Editar ${row.nombre}`}
                          title="Editar producto"
                          onClick={() => {
                            setProductoEdit(row);
                            setEditForm({
                              nombre: row.nombre || '',
                              stock_minimo: String(row.stock_minimo ?? ''),
                              activo: Boolean(row.activo),
                              categoria_id: String(row.categoria_id || '')
                            });
                          }}
                        >
                          Editar
                        </TableActionButton>
                      </TableActions>
                    </TablaCelda>
                  </>
                )}

                {tab === 'movimientos' && (
                  <>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda>{row.producto_codigo} - {row.producto_nombre}</TablaCelda>
                    <TablaCelda><TipoBadge tipo={row.tipo} /></TablaCelda>
                    <TablaCelda>{resolveOrigenLabel(row)}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                      {formatInventoryQty(Number(row.cantidad || 0) * Number(row.signo || 1), row.unidad_medida, { appendUnit: true })}
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      {row.saldo_resultante === null || row.saldo_resultante === undefined
                        ? '-'
                        : formatInventoryQty(row.saldo_resultante, row.unidad_medida, { appendUnit: true })}
                    </TablaCelda>
                    <TablaCelda className="text-right">{row.costo_unitario == null ? '-' : formatCurrency(row.costo_unitario)}</TablaCelda>
                    <TablaCelda className="text-right">{row.costo_total == null ? '-' : formatCurrency(row.costo_total)}</TablaCelda>
                  </>
                )}

                {tab === 'conteos' && (
                  <>
                    <TablaCelda className="font-semibold text-[var(--color-text)]">#{row.id}</TablaCelda>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda>{row.estado}</TablaCelda>
                    <TablaCelda>{row.usuario_nombre || '-'}</TablaCelda>
                    <TablaCelda className="text-right">{formatNumber(row.items_count)}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatNumber(row.diferencia_total)}</TablaCelda>
                    <TablaCelda>{row.observacion || '-'}</TablaCelda>
                    <TablaCelda>
                      <TableActions>
                        {row.estado === 'BORRADOR' ? (
                          <TableActionButton
                            variant="primary"
                            icon={<PiCheckCircle />}
                            aria-label={`Aplicar conteo ${row.id}`}
                            title="Aplicar conteo"
                            onClick={() => setConteoPendiente(row)}
                          >
                            Aplicar
                          </TableActionButton>
                        ) : (
                          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Aplicado</span>
                        )}
                      </TableActions>
                    </TablaCelda>
                  </>
                )}

                {tab === 'ajustes' && (
                  <>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda>{row.producto_codigo} - {row.producto_nombre}</TablaCelda>
                    <TablaCelda>{row.referencia || resolveOrigenLabel(row)}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                      {formatInventoryQty(Number(row.cantidad || 0) * Number(row.signo || 1), row.unidad_medida, { appendUnit: true })}
                    </TablaCelda>
                    <TablaCelda className="text-right">{row.costo_unitario == null ? '-' : formatCurrency(row.costo_unitario)}</TablaCelda>
                    <TablaCelda className="text-right">{row.costo_total == null ? '-' : formatCurrency(row.costo_total)}</TablaCelda>
                  </>
                )}

                {tab === 'mermas' && (
                  <>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda>{row.producto_codigo} - {row.producto_nombre}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                      {formatInventoryQty(row.cantidad, row.unidad_medida, { appendUnit: true })}
                    </TablaCelda>
                    <TablaCelda>{row.motivo}</TablaCelda>
                  </>
                )}
              </TablaFila>
            );})}
          </TablaCuerpo>
        </Tabla>

        <Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={filteredRows.length} mostrarSiempre onPageChange={setPagina} />
      </Card>

      {loading && <LoadingState label="Actualizando inventario..." />}

      <InventoryActionModal
        open={showConteoModal}
        onClose={resetConteoModal}
        title="Nuevo conteo"
        description="Registra un conteo puntual. Si la diferencia es positiva, debes elegir la política de costo."
        onConfirm={onCrearConteo}
        confirmLabel="Crear conteo"
        loading={loading}
      >
        <InventoryProductPickerTable
          search={conteoSearch}
          onSearchChange={setConteoSearch}
          rows={conteoProductosPaginados}
          page={conteoPickerPage}
          totalPages={conteoPickerTotal}
          totalRecords={conteoProductosFiltrados.length}
          selectedId={conteoForm.producto_id}
          onSelect={(producto) => setConteoForm((state) => ({ ...state, producto_id: String(producto.id) }))}
          onPageChange={setConteoPickerPage}
        />
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Stock contado</label>
          <Input
            className="mt-2"
            value={conteoForm.stock_conteo}
            onChange={(e) =>
              setConteoForm((state) => ({
                ...state,
                stock_conteo: sanitizeQtyInput(e.target.value, conteoProducto?.unidad_medida || conteoProducto?.unidad || 'UND')
              }))
            }
            placeholder={conteoProducto ? `Cantidad en ${getUnidad(conteoProducto.unidad_medida || conteoProducto.unidad)}` : 'Cantidad'}
          />
        </div>
        {conteoProducto && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-sm">
            <p className="font-semibold text-[var(--color-text)]">
              Stock sistema: {formatInventoryQty(conteoProducto.stock_actual, conteoProducto.unidad_medida || conteoProducto.unidad, { appendUnit: true })}
            </p>
            <p className="text-[var(--color-text-muted)]">
              Diferencia proyectada: {formatInventoryQty(conteoDelta, conteoProducto.unidad_medida || conteoProducto.unidad, { appendUnit: true })}
            </p>
          </div>
        )}
        {isConteoPositivo && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Política de costo</label>
              <Select className="mt-2" value={conteoForm.costo_origen_tipo} onChange={(e) => setConteoForm((state) => ({ ...state, costo_origen_tipo: e.target.value }))}>
                <option value="PROMEDIO_ACTUAL">PROMEDIO_ACTUAL</option>
                <option value="MANUAL">MANUAL</option>
              </Select>
            </div>
            {conteoForm.costo_origen_tipo === 'MANUAL' && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Costo manual</label>
                <Input
                  className="mt-2"
                  value={conteoForm.costo_unitario_manual}
                  onChange={(e) => setConteoForm((state) => ({ ...state, costo_unitario_manual: sanitizeCostInput(e.target.value) }))}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>
        )}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observación</label>
          <Input className="mt-2" value={conteoForm.observacion} onChange={(e) => setConteoForm((state) => ({ ...state, observacion: e.target.value }))} placeholder="Opcional" />
        </div>
      </InventoryActionModal>

      <InventoryActionModal
        open={showAjusteModal}
        onClose={resetAjusteModal}
        title="Ajuste manual"
        description="Los ajustes positivos requieren política de costo. Los negativos consumen promedio actual."
        onConfirm={onAplicarAjuste}
        confirmLabel="Aplicar ajuste"
        loading={loading}
      >
        <InventoryProductPickerTable
          search={ajusteSearch}
          onSearchChange={setAjusteSearch}
          rows={ajusteProductosPaginados}
          page={ajustePickerPage}
          totalPages={ajustePickerTotal}
          totalRecords={ajusteProductosFiltrados.length}
          selectedId={ajusteForm.producto_id}
          onSelect={(producto) => setAjusteForm((state) => ({ ...state, producto_id: String(producto.id) }))}
          onPageChange={setAjustePickerPage}
        />
        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Tipo</label>
            <Select className="mt-2" value={ajusteForm.tipo} onChange={(e) => setAjusteForm((state) => ({ ...state, tipo: e.target.value }))}>
              <option value="ENTRADA">Entrada</option>
              <option value="SALIDA">Salida</option>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cantidad</label>
            <Input
              className="mt-2"
              value={ajusteForm.cantidad}
              onChange={(e) =>
                setAjusteForm((state) => ({
                  ...state,
                  cantidad: sanitizeQtyInput(e.target.value, ajusteProducto?.unidad_medida || ajusteProducto?.unidad || 'UND')
                }))
              }
              placeholder={ajusteProducto ? `Cantidad en ${getUnidad(ajusteProducto.unidad_medida || ajusteProducto.unidad)}` : 'Cantidad'}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Referencia</label>
            <Input className="mt-2" value={ajusteForm.referencia} onChange={(e) => setAjusteForm((state) => ({ ...state, referencia: e.target.value }))} placeholder="AJUSTE_MANUAL" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observación</label>
            <Input className="mt-2" value={ajusteForm.observacion} onChange={(e) => setAjusteForm((state) => ({ ...state, observacion: e.target.value }))} placeholder="Opcional" />
          </div>
        </div>
        {isAjustePositivo && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Política de costo</label>
              <Select className="mt-2" value={ajusteForm.costo_origen_tipo} onChange={(e) => setAjusteForm((state) => ({ ...state, costo_origen_tipo: e.target.value }))}>
                <option value="PROMEDIO_ACTUAL">PROMEDIO_ACTUAL</option>
                <option value="MANUAL">MANUAL</option>
              </Select>
            </div>
            {ajusteForm.costo_origen_tipo === 'MANUAL' && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Costo manual</label>
                <Input
                  className="mt-2"
                  value={ajusteForm.costo_unitario_manual}
                  onChange={(e) => setAjusteForm((state) => ({ ...state, costo_unitario_manual: sanitizeCostInput(e.target.value) }))}
                  placeholder="0.00"
                />
              </div>
            )}
          </div>
        )}
      </InventoryActionModal>

      <InventoryActionModal
        open={showMermaModal}
        onClose={resetMermaModal}
        title="Registrar merma"
        description="La merma descuenta stock y valor del inventario."
        onConfirm={onCrearMerma}
        confirmLabel="Guardar merma"
        confirmVariant="danger"
        loading={loading}
      >
        <InventoryProductPickerTable
          search={mermaSearch}
          onSearchChange={setMermaSearch}
          rows={mermaProductosPaginados}
          page={mermaPickerPage}
          totalPages={mermaPickerTotal}
          totalRecords={mermaProductosFiltrados.length}
          selectedId={mermaForm.producto_id}
          onSelect={(producto) => setMermaForm((state) => ({ ...state, producto_id: String(producto.id) }))}
          onPageChange={setMermaPickerPage}
        />
        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cantidad</label>
            <Input
              className="mt-2"
              value={mermaForm.cantidad}
              onChange={(e) =>
                setMermaForm((state) => ({
                  ...state,
                  cantidad: sanitizeQtyInput(e.target.value, mermaProducto?.unidad_medida || mermaProducto?.unidad || 'UND')
                }))
              }
              placeholder={mermaProducto ? `Cantidad en ${getUnidad(mermaProducto.unidad_medida || mermaProducto.unidad)}` : 'Cantidad'}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Motivo</label>
            <Input className="mt-2" value={mermaForm.motivo} onChange={(e) => setMermaForm((state) => ({ ...state, motivo: e.target.value }))} placeholder="Motivo" />
          </div>
        </div>
      </InventoryActionModal>

      <ConfirmDialog
        open={Boolean(conteoPendiente)}
        onClose={() => setConteoPendiente(null)}
        onConfirm={onConfirmarAplicarConteo}
        title={`Aplicar conteo #${conteoPendiente?.id || ''}`}
        description="El conteo ajustará stock y generará movimientos de inventario. Esta acción no se puede deshacer."
        confirmLabel="Aplicar conteo"
        confirmVariant="primary"
      />

      <Modal open={Boolean(productoEdit)} onClose={resetProductEdit} maxWidthClass="max-w-xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Editar producto</h3>
            <p className="text-sm text-[var(--color-text-muted)]">{productoEdit?.codigo} - {productoEdit?.nombre}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={resetProductEdit}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]">Nombre</label>
            <Input className="mt-2" value={editForm.nombre} onChange={(e) => setEditForm((state) => ({ ...state, nombre: e.target.value }))} placeholder="Nombre" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]">Stock mínimo</label>
              <Input className="mt-2" value={editForm.stock_minimo} onChange={(e) => setEditForm((state) => ({ ...state, stock_minimo: e.target.value }))} placeholder="Stock mínimo" />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]">Categoría</label>
              <Select className="mt-2" value={editForm.categoria_id} onChange={(e) => setEditForm((state) => ({ ...state, categoria_id: e.target.value }))}>
                <option value="">Sin categoría</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nombre}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 text-sm font-medium text-[var(--color-text)]">
            <input type="checkbox" checked={editForm.activo} onChange={(e) => setEditForm((state) => ({ ...state, activo: e.target.checked }))} />
            Activo
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={resetProductEdit}>
            Cancelar
          </Button>
          <Button onClick={onGuardarProducto} disabled={loading}>
            Guardar cambios
          </Button>
        </div>
      </Modal>
    </div>
  );
}
