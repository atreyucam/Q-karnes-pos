import { useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiCheckCircle, PiClipboardText, PiPackage, PiWarningCircle, PiWaves } from 'react-icons/pi';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  StatusBadge,
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
const MODAL_PAGE_SIZE = 10;

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

function formatSignedCurrency(value) {
  const amount = Number(value || 0);
  if (amount > 0) return `+${formatCurrency(amount)}`;
  if (amount < 0) return `-${formatCurrency(Math.abs(amount))}`;
  return formatCurrency(0);
}

function formatSignedQty(value, unidad) {
  const amount = Number(value || 0);
  const formatted = formatInventoryQty(Math.abs(amount), unidad, { appendUnit: true });
  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `-${formatted}`;
  return `0 ${getUnidad(unidad)}`;
}

function getSignedTextClass(value, { money = false } = {}) {
  const amount = Number(value || 0);
  if (amount > 0) return 'text-emerald-700 font-semibold';
  if (amount < 0) return 'text-red-700 font-semibold';
  return money ? 'text-slate-700 font-medium' : 'text-slate-700 font-medium';
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
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-5xl" panelClassName="p-5 sm:max-h-[calc(100dvh-2rem)]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="ui-panel-title">{title}</h3>
            <p className="ui-panel-description">{description}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            X
          </Button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-4 pb-2">{children}</div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
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
    cancelarConteo,
    obtenerConteoDetalle,
    ajustesMasivo,
    crearMerma,
    actualizarStockMinimo
  } = useInventarioStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
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

  const [productoDetalle, setProductoDetalle] = useState(null);
  const [stockMinimoDraft, setStockMinimoDraft] = useState('');

  const [showConteoModal, setShowConteoModal] = useState(false);
  const [showAjusteModal, setShowAjusteModal] = useState(false);
  const [showMermaModal, setShowMermaModal] = useState(false);
  const [conteoPendiente, setConteoPendiente] = useState(null);
  const [conteoCancelPendiente, setConteoCancelPendiente] = useState(null);
  const [conteoDetalle, setConteoDetalle] = useState(null);

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
  const hasConteoIngresado = conteoForm.stock_conteo !== '';
  const isAjustePositivo = ajusteForm.tipo === 'ENTRADA';
  const conteoCostoUsado = useMemo(() => {
    if (!conteoProducto || !hasConteoIngresado) return null;
    const promedio = Number(conteoProducto.costo_promedio || 0);
    if (conteoDelta > 0 && conteoForm.costo_origen_tipo === 'MANUAL') {
      const manual = Number(String(conteoForm.costo_unitario_manual || '').replace(',', '.'));
      return Number.isFinite(manual) && manual > 0 ? manual : null;
    }
    return promedio;
  }, [conteoProducto, conteoDelta, conteoForm.costo_origen_tipo, conteoForm.costo_unitario_manual, hasConteoIngresado]);
  const conteoImpactoProyectado = useMemo(() => {
    if (!conteoProducto || !hasConteoIngresado || conteoCostoUsado == null) return null;
    return Number(conteoDelta || 0) * Number(conteoCostoUsado || 0);
  }, [conteoProducto, hasConteoIngresado, conteoCostoUsado, conteoDelta]);

  const conteoProductosFiltrados = useMemo(() => filterProductosCatalogo(productoOpciones, conteoSearch), [productoOpciones, conteoSearch]);
  const ajusteProductosFiltrados = useMemo(() => filterProductosCatalogo(productoOpciones, ajusteSearch), [productoOpciones, ajusteSearch]);
  const mermaProductosFiltrados = useMemo(() => filterProductosCatalogo(productoOpciones, mermaSearch), [productoOpciones, mermaSearch]);
  const conteoProductosPaginados = useMemo(() => conteoProductosFiltrados.slice((conteoPickerPage - 1) * MODAL_PAGE_SIZE, conteoPickerPage * MODAL_PAGE_SIZE), [conteoPickerPage, conteoProductosFiltrados]);
  const ajusteProductosPaginados = useMemo(() => ajusteProductosFiltrados.slice((ajustePickerPage - 1) * MODAL_PAGE_SIZE, ajustePickerPage * MODAL_PAGE_SIZE), [ajustePickerPage, ajusteProductosFiltrados]);
  const mermaProductosPaginados = useMemo(() => mermaProductosFiltrados.slice((mermaPickerPage - 1) * MODAL_PAGE_SIZE, mermaPickerPage * MODAL_PAGE_SIZE), [mermaPickerPage, mermaProductosFiltrados]);
  const conteoPickerTotal = Math.max(1, Math.ceil(conteoProductosFiltrados.length / MODAL_PAGE_SIZE));
  const ajustePickerTotal = Math.max(1, Math.ceil(ajusteProductosFiltrados.length / MODAL_PAGE_SIZE));
  const mermaPickerTotal = Math.max(1, Math.ceil(mermaProductosFiltrados.length / MODAL_PAGE_SIZE));

  useEffect(() => {
    if (conteoPickerPage > conteoPickerTotal) {
      setConteoPickerPage(conteoPickerTotal);
    }
  }, [conteoPickerPage, conteoPickerTotal]);

  useEffect(() => {
    if (ajustePickerPage > ajustePickerTotal) {
      setAjustePickerPage(ajustePickerTotal);
    }
  }, [ajustePickerPage, ajustePickerTotal]);

  useEffect(() => {
    if (mermaPickerPage > mermaPickerTotal) {
      setMermaPickerPage(mermaPickerTotal);
    }
  }, [mermaPickerPage, mermaPickerTotal]);

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

  const resetProductoDetalle = () => {
    setProductoDetalle(null);
    setStockMinimoDraft('');
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

  const onGuardarStockMinimo = async () => {
    setFormError('');
    if (!productoDetalle) return;
    if (stockMinimoDraft === '' || Number(stockMinimoDraft) < 0) {
      setFormError('El stock mínimo debe ser mayor o igual a 0.');
      return;
    }

    await actualizarStockMinimo(productoDetalle.id, Number(stockMinimoDraft || 0));

    resetProductoDetalle();
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

  const onVerConteo = async (row) => {
    setFormError('');
    const response = await obtenerConteoDetalle(Number(row.id));
    setConteoDetalle(response);
  };

  const onAplicarDesdeDetalle = async () => {
    if (!conteoDetalle?.conteo?.id) return;
    setFormError('');
    await aplicarConteo(Number(conteoDetalle.conteo.id));
    setConteoDetalle(null);
    await Promise.all([cargarConteos(), cargarDisponible(), cargarMovimientos(), cargarAlertas()]);
  };

  const onConfirmarCancelarConteo = async () => {
    if (!conteoCancelPendiente?.id) return;
    setFormError('');
    await cancelarConteo(Number(conteoCancelPendiente.id));
    setConteoCancelPendiente(null);
    if (conteoDetalle?.conteo?.id && Number(conteoDetalle.conteo.id) === Number(conteoCancelPendiente.id)) {
      setConteoDetalle(null);
    }
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
                  <TablaCelda as="th" className="text-right">Costo usado</TablaCelda>
                  <TablaCelda as="th" className="text-right">Total visible</TablaCelda>
                </>
              )}
              {tab === 'conteos' && (
                <>
                  <TablaCelda as="th">ID</TablaCelda>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Estado</TablaCelda>
                  <TablaCelda as="th">Usuario</TablaCelda>
                  <TablaCelda as="th">Item</TablaCelda>
                  <TablaCelda as="th" className="text-right">Diferencia</TablaCelda>
                  <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
                </>
              )}
              {tab === 'ajustes' && (
                <>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Referencia</TablaCelda>
                  <TablaCelda as="th" className="text-right">Cantidad</TablaCelda>
                  <TablaCelda as="th" className="text-right">Costo usado</TablaCelda>
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
                <TablaCelda colSpan={tab === 'stock' ? 7 : tab === 'movimientos' ? 8 : tab === 'conteos' ? 7 : tab === 'ajustes' ? 6 : 4}>
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
                          variant="secondary"
                          aria-label={`Ver detalle de ${row.nombre}`}
                          title="Ver detalle"
                          onClick={() => {
                            setProductoDetalle(row);
                            setStockMinimoDraft(String(row.stock_minimo ?? '0'));
                          }}
                        >
                          Ver detalle
                        </TableActionButton>
                      </TableActions>
                    </TablaCelda>
                  </>
                )}

                {tab === 'movimientos' && (
                  <>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda> {row.producto_nombre}</TablaCelda>
                    <TablaCelda><TipoBadge tipo={row.tipo} /></TablaCelda>
                    <TablaCelda>{resolveOrigenLabel(row)}</TablaCelda>
                    <TablaCelda className="text-right">
                      <span className={getSignedTextClass(Number(row.cantidad || 0) * Number(row.signo || 1))}>
                        {formatSignedQty(Number(row.cantidad || 0) * Number(row.signo || 1), row.unidad_medida)}
                      </span>
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      {row.saldo_resultante === null || row.saldo_resultante === undefined
                        ? '-'
                        : formatInventoryQty(row.saldo_resultante, row.unidad_medida, { appendUnit: true })}
                    </TablaCelda>
                    <TablaCelda className="text-right">{row.costo_unitario == null ? '-' : formatCurrency(row.costo_unitario)}</TablaCelda>
                    <TablaCelda className="text-right">
                      {row.costo_total == null
                        ? '-'
                        : (
                          <span className={getSignedTextClass(Number(row.costo_total || 0) * Number(row.signo || 1), { money: true })}>
                            {formatSignedCurrency(Number(row.costo_total || 0) * Number(row.signo || 1))}
                          </span>
                        )}
                    </TablaCelda>
                  </>
                )}

                {tab === 'conteos' && (
                  <>
                    <TablaCelda className="font-semibold text-[var(--color-text)]">#{row.id}</TablaCelda>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda>
                      <StatusBadge status={row.estado} />
                    </TablaCelda>
                    <TablaCelda>{row.usuario_nombre || '-'}</TablaCelda>
                    <TablaCelda>
                      {row.item_nombre || '-'}
                      {Number(row.items_count || 0) > 1 ? ` (+${Number(row.items_count) - 1})` : ''}
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      <span className={getSignedTextClass(row.diferencia_neta)}>
                        {formatSignedQty(row.diferencia_neta, row.item_unidad || 'UND')}
                      </span>
                    </TablaCelda>
                    <TablaCelda>
                      <TableActions>
                        <TableActionButton
                          variant="secondary"
                          icon={<PiClipboardText />}
                          aria-label={`Ver conteo ${row.id}`}
                          title="Ver detalle"
                          onClick={() => onVerConteo(row)}
                        >
                          Ver
                        </TableActionButton>
                        {row.estado === 'BORRADOR' ? (
                          <>
                            <TableActionButton
                              variant="primary"
                              icon={<PiCheckCircle />}
                              aria-label={`Aplicar conteo ${row.id}`}
                              title="Aplicar conteo"
                              onClick={() => setConteoPendiente(row)}
                            >
                              Aplicar
                            </TableActionButton>
                            <TableActionButton
                              variant="danger"
                              aria-label={`Cancelar conteo ${row.id}`}
                              title="Cancelar conteo"
                              onClick={() => setConteoCancelPendiente(row)}
                            >
                              Cancelar
                            </TableActionButton>
                          </>
                        ) : null}
                      </TableActions>
                    </TablaCelda>
                  </>
                )}

                {tab === 'ajustes' && (
                  <>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda> {row.producto_nombre}</TablaCelda>
                    <TablaCelda>{row.referencia || resolveOrigenLabel(row)}</TablaCelda>
                    <TablaCelda className="text-right">
                      <span className={getSignedTextClass(Number(row.cantidad || 0) * Number(row.signo || 1))}>
                        {formatSignedQty(Number(row.cantidad || 0) * Number(row.signo || 1), row.unidad_medida)}
                      </span>
                    </TablaCelda>
                    <TablaCelda className="text-right">{row.costo_unitario == null ? '-' : formatCurrency(row.costo_unitario)}</TablaCelda>
                    <TablaCelda className="text-right">
                      {row.costo_total == null
                        ? '-'
                        : (
                          <span className={getSignedTextClass(Number(row.costo_total || 0) * Number(row.signo || 1), { money: true })}>
                            {formatSignedCurrency(Number(row.costo_total || 0) * Number(row.signo || 1))}
                          </span>
                        )}
                    </TablaCelda>
                  </>
                )}

                {tab === 'mermas' && (
                  <>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda>{row.producto_codigo} - {row.producto_nombre}</TablaCelda>
                    <TablaCelda className="text-right">
                      <span className={getSignedTextClass(-Math.abs(Number(row.cantidad || 0)))}>
                        {formatSignedQty(-Math.abs(Number(row.cantidad || 0)), row.unidad_medida)}
                      </span>
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
            {!hasConteoIngresado ? (
              <p className="text-[var(--color-text-muted)]">Ingrese el stock contado para calcular la diferencia.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                <p className="text-[var(--color-text-muted)]">
                  Stock sistema: <span className="font-semibold text-[var(--color-text)]">{formatInventoryQty(conteoProducto.stock_actual, conteoProducto.unidad_medida || conteoProducto.unidad, { appendUnit: true })}</span>
                </p>
                <p className="text-[var(--color-text-muted)]">
                  Stock contado: <span className="font-semibold text-[var(--color-text)]">{formatInventoryQty(conteoForm.stock_conteo, conteoProducto.unidad_medida || conteoProducto.unidad, { appendUnit: true })}</span>
                </p>
                <p className="text-[var(--color-text-muted)]">
                  Diferencia proyectada:{' '}
                  <span className={getSignedTextClass(conteoDelta)}>
                    {formatSignedQty(conteoDelta, conteoProducto.unidad_medida || conteoProducto.unidad)}
                  </span>
                </p>
                <p className="text-[var(--color-text-muted)]">
                  Costo usado: <span className="font-semibold text-[var(--color-text)]">{conteoCostoUsado == null ? '-' : formatCurrency(conteoCostoUsado)}</span>
                </p>
                <p className="text-[var(--color-text-muted)]">
                  Impacto estimado en valor:{' '}
                  {conteoImpactoProyectado == null
                    ? <span className="text-slate-700 font-medium">-</span>
                    : <span className={getSignedTextClass(conteoImpactoProyectado, { money: true })}>{formatSignedCurrency(conteoImpactoProyectado)}</span>}
                </p>
                <p className="text-[var(--color-text-muted)]">
                  Nuevo stock estimado: <span className="font-semibold text-[var(--color-text)]">{formatInventoryQty(conteoProducto.stock_actual + conteoDelta, conteoProducto.unidad_medida || conteoProducto.unidad, { appendUnit: true })}</span>
                </p>
                {Number(conteoDelta || 0) === 0 && (
                  <p className="md:col-span-2 text-[var(--color-text-muted)]">No habrá impacto en inventario para este conteo.</p>
                )}
              </div>
            )}
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

      <Modal open={Boolean(conteoDetalle)} onClose={() => setConteoDetalle(null)} maxWidthClass="max-w-5xl" panelClassName="p-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="ui-panel-title">Detalle de conteo #{conteoDetalle?.conteo?.id || ''}</h3>
              <p className="ui-panel-description">
                Estado: {conteoDetalle?.conteo?.estado || '-'}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConteoDetalle(null)}>
              X
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th" className="text-right">Stock sistema</TablaCelda>
                  <TablaCelda as="th" className="text-right">Stock conteo</TablaCelda>
                  <TablaCelda as="th" className="text-right">Diferencia</TablaCelda>
                  <TablaCelda as="th" className="text-right">Costo usado</TablaCelda>
                  <TablaCelda as="th" className="text-right">Impacto valor</TablaCelda>
                  <TablaCelda as="th" className="text-right">Valor antes</TablaCelda>
                  <TablaCelda as="th" className="text-right">Valor después</TablaCelda>
                  <TablaCelda as="th">Política</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {(conteoDetalle?.detalle || []).map((item) => (
                  <TablaFila key={item.id}>
                    <TablaCelda>{item.producto_codigo} - {item.producto_nombre}</TablaCelda>
                    <TablaCelda className="text-right">{formatInventoryQty(item.stock_sistema, item.unidad_medida, { appendUnit: true })}</TablaCelda>
                    <TablaCelda className="text-right">{formatInventoryQty(item.stock_conteo, item.unidad_medida, { appendUnit: true })}</TablaCelda>
                    <TablaCelda className="text-right">
                      <span className={getSignedTextClass(item.diferencia)}>
                        {formatSignedQty(item.diferencia, item.unidad_medida)}
                      </span>
                    </TablaCelda>
                    <TablaCelda className="text-right">{item.costo_usado == null ? '-' : formatCurrency(item.costo_usado)}</TablaCelda>
                    <TablaCelda className="text-right">
                      {item.impacto_valor == null
                        ? '-'
                        : (
                          <span className={getSignedTextClass(item.impacto_valor, { money: true })}>
                            {formatSignedCurrency(item.impacto_valor)}
                          </span>
                        )}
                    </TablaCelda>
                    <TablaCelda className="text-right">{item.valor_antes == null ? '-' : formatCurrency(item.valor_antes)}</TablaCelda>
                    <TablaCelda className="text-right">{item.valor_despues == null ? '-' : formatCurrency(item.valor_despues)}</TablaCelda>
                    <TablaCelda>
                      {item.costo_origen_tipo}
                      {item.costo_origen_tipo === 'MANUAL' && Number(item.costo_unitario_manual || 0) > 0
                        ? ` (${formatCurrency(item.costo_unitario_manual)})`
                        : ''}
                    </TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-sm">
            <p className="font-semibold text-[var(--color-text)]">Observación</p>
            <p className="text-[var(--color-text-muted)]">{conteoDetalle?.conteo?.observacion || 'Sin observación'}</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConteoDetalle(null)} disabled={loading}>
              Cerrar
            </Button>
            {conteoDetalle?.conteo?.estado === 'BORRADOR' && (
              <Button variant="primary" onClick={onAplicarDesdeDetalle} disabled={loading}>
                {loading ? 'Procesando...' : 'Aplicar conteo'}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(conteoPendiente)}
        onClose={() => setConteoPendiente(null)}
        onConfirm={onConfirmarAplicarConteo}
        title={`Aplicar conteo #${conteoPendiente?.id || ''}`}
        description="El conteo ajustará stock y generará movimientos de inventario. Esta acción no se puede deshacer."
        confirmLabel="Aplicar conteo"
        confirmVariant="primary"
      />
      <ConfirmDialog
        open={Boolean(conteoCancelPendiente)}
        onClose={() => setConteoCancelPendiente(null)}
        onConfirm={onConfirmarCancelarConteo}
        title={`Cancelar conteo #${conteoCancelPendiente?.id || ''}`}
        description="El conteo quedará en estado CANCELADO y ya no se podrá aplicar."
        confirmLabel="Cancelar conteo"
        confirmVariant="danger"
      />

      <Modal open={Boolean(productoDetalle)} onClose={resetProductoDetalle} maxWidthClass="max-w-xl" panelClassName="p-5">
        <div className="ui-modal-header">
          <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Detalle de inventario</h3>
            <p className="text-sm text-[var(--color-text-muted)]">{productoDetalle?.codigo} - {productoDetalle?.nombre}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="ui-modal-close-plain" onClick={resetProductoDetalle}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm">
            <p className="font-semibold text-[var(--color-text)]">Stock actual</p>
            <p className="text-[var(--color-text-muted)]">
              {formatInventoryQty(productoDetalle?.stock_actual || 0, productoDetalle?.unidad_medida || productoDetalle?.unidad, { appendUnit: true })}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm">
            <p className="font-semibold text-[var(--color-text)]">Costo promedio</p>
            <p className="text-[var(--color-text-muted)]">{formatCurrency(productoDetalle?.costo_promedio || 0)}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm">
            <p className="font-semibold text-[var(--color-text)]">Valor inventario</p>
            <p className="text-[var(--color-text-muted)]">{formatCurrency(getInventoryValue(productoDetalle || {}))}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]">Stock mínimo</label>
            <Input className="mt-2" value={stockMinimoDraft} onChange={(e) => setStockMinimoDraft(e.target.value)} placeholder="Stock mínimo" />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={resetProductoDetalle}>
            Cancelar
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const targetId = productoDetalle?.id;
              resetProductoDetalle();
              navigate(`/productos?edit=${targetId || ''}`);
            }}
          >
            Abrir en Productos
          </Button>
          <Button onClick={onGuardarStockMinimo} disabled={loading}>
            Guardar mínimo
          </Button>
        </div>
      </Modal>
    </div>
  );
}
