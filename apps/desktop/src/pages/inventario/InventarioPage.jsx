import { useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiCheckCircle, PiClipboardText, PiPackage, PiPencilSimple, PiWarningCircle, PiWaves } from 'react-icons/pi';
import { parseApiError } from '../../lib/apiClient';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  LoadingState,
  MetricTile,
  Modal,
  PageHeader,
  Paginador,
  Select,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  TipoBadge
} from '../../ui';
import { useInventarioStore } from '../../stores/inventarioStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit, getUnidad, sanitizeQtyInput } from '../../lib/formatQty';
import { fetchCategorias } from '../../services/catalogoService';

const PAGE_SIZE = 10;

function ProductoSelect({ value, onChange, productos, placeholder = 'Selecciona producto' }) {
  return (
    <Select className="w-full" value={value} onChange={onChange}>
      <option value="">{placeholder}</option>
      {productos.map((producto) => (
        <option key={producto.id} value={producto.id}>
          {producto.codigo} - {producto.nombre}
        </option>
      ))}
    </Select>
  );
}

function formatInventoryQty(value, unidad, options = {}) {
  const unit = getUnidad(unidad);
  if (options.appendUnit) {
    return `${formatQtyByUnit(value, unit)} ${unit}`;
  }
  return formatQtyByUnit(value, unit, { fixedLB: unit !== 'UND' });
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
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-xl" panelClassName="p-5">
      <div className="space-y-4">
        <div>
          <h3 className="ui-panel-title">{title}</h3>
          <p className="ui-panel-description">{description}</p>
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
    actualizarStockMinimo,
    crearConteo,
    aplicarConteo,
    ajustesMasivo,
    crearMerma,
    actualizarProducto
  } = useInventarioStore();

  const [categorias, setCategorias] = useState([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [searchFiltro, setSearchFiltro] = useState('');
  const [tab, setTab] = useState('stock');
  const [pagina, setPagina] = useState(1);

  const [productoEdit, setProductoEdit] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', stock_minimo: '', activo: true, categoria_id: '' });

  const [showConteoModal, setShowConteoModal] = useState(false);
  const [showAjusteModal, setShowAjusteModal] = useState(false);
  const [showMermaModal, setShowMermaModal] = useState(false);
  const [conteoPendiente, setConteoPendiente] = useState(null);

  const [conteoForm, setConteoForm] = useState({ producto_id: '', stock_conteo: '', observacion: '' });
  const [ajusteForm, setAjusteForm] = useState({ producto_id: '', tipo: 'ENTRADA', cantidad: '', referencia: '', observacion: '' });
  const [mermaForm, setMermaForm] = useState({ producto_id: '', cantidad: '', motivo: 'Merma operativa' });

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
  }, [tab, categoriaFiltro, searchFiltro, disponible.length, alertas.length, conteos.length, mermas.length, movimientos.length]);

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

  const rowsByTab = {
    stock: disponible,
    alertas,
    conteos,
    mermas,
    movimientos
  };

  const filteredRows = useMemo(() => {
    const rows = rowsByTab[tab] || [];
    if (!['stock', 'alertas'].includes(tab)) return rows;

    const q = searchFiltro.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoriaFiltro && String(row.categoria_id) !== String(categoriaFiltro)) return false;
      if (!q) return true;
      return [row.codigo, row.nombre].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [rowsByTab, tab, categoriaFiltro, searchFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => filteredRows.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE),
    [filteredRows, pagina]
  );

  const resetProductEdit = () => {
    setProductoEdit(null);
    setEditForm({ nombre: '', stock_minimo: '', activo: true, categoria_id: '' });
  };

  const resetConteoModal = () => {
    setShowConteoModal(false);
    setConteoForm({ producto_id: '', stock_conteo: '', observacion: '' });
  };

  const resetAjusteModal = () => {
    setShowAjusteModal(false);
    setAjusteForm({ producto_id: '', tipo: 'ENTRADA', cantidad: '', referencia: '', observacion: '' });
  };

  const resetMermaModal = () => {
    setShowMermaModal(false);
    setMermaForm({ producto_id: '', cantidad: '', motivo: 'Merma operativa' });
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

    await crearConteo({
      observacion: conteoForm.observacion.trim() || undefined,
      items: [
        {
          producto_id: Number(conteoForm.producto_id),
          stock_conteo: Number(String(conteoForm.stock_conteo).replace(',', '.'))
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

    const cantidad = Number(String(ajusteForm.cantidad).replace(',', '.'));
    const signedCantidad = ajusteForm.tipo === 'SALIDA' ? -cantidad : cantidad;

    await ajustesMasivo({
      observacion: ajusteForm.observacion.trim() || undefined,
      items: [
        {
          producto_id: Number(ajusteForm.producto_id),
          cantidad: signedCantidad,
          referencia: ajusteForm.referencia.trim() || 'AJUSTE_MANUAL'
        }
      ]
    });

    resetAjusteModal();
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
        description="Stock actual, conteos, ajustes manuales, mermas y trazabilidad completa de movimientos."
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

      <section className="ui-kpi-summary-shell">
        <div className="mb-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Resumen de inventario</p>
            <p className="text-xs text-[var(--color-text-muted)]">Métricas rápidas con el mismo diseño compacto usado en Caja.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile
            icon={PiPackage}
            value={disponible.length}
            label="Stock actual"
            iconBg="color-mix(in oklab, #bfdbfe 72%, white 28%)"
          />
          <MetricTile
            icon={PiWarningCircle}
            value={alertas.length}
            label="Alertas"
            iconBg="color-mix(in oklab, #fde68a 72%, white 28%)"
          />
          <MetricTile
            icon={PiClipboardText}
            value={conteos.length}
            label="Conteos"
            iconBg="color-mix(in oklab, #a7f3d0 78%, white 22%)"
          />
          <MetricTile
            icon={PiWaves}
            value={mermas.length}
            label="Mermas"
            iconBg="color-mix(in oklab, #fecdd3 72%, white 28%)"
          />
          <MetricTile
            icon={PiArrowsClockwise}
            value={movimientos.length}
            label="Movimientos"
            iconBg="color-mix(in oklab, #ddd6fe 74%, white 26%)"
          />
        </div>
      </section>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'stock', label: 'Stock actual' },
              { key: 'movimientos', label: 'Movimientos' },
              { key: 'conteos', label: 'Conteos' },
              { key: 'alertas', label: 'Alertas' },
              { key: 'mermas', label: 'Mermas' }
            ].map((item) => (
              <Button
                key={item.key}
                type="button"
                variant={tab === item.key ? 'primary' : 'secondary'}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {(tab === 'stock' || tab === 'alertas') && (
          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Categoría</label>
              <Select className="mt-2" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
                <option value="">Todas</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nombre}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Buscar</label>
              <Input
                className="mt-2"
                value={searchFiltro}
                onChange={(e) => setSearchFiltro(e.target.value)}
                placeholder="Código o nombre"
              />
            </div>
          </div>
        )}

        <Tabla>
          <TablaCabecera>
            <tr>
              {['stock', 'alertas'].includes(tab) && (
                <>
                  <TablaCelda as="th">Código</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Categoría</TablaCelda>
                  <TablaCelda as="th">Unidad</TablaCelda>
                  <TablaCelda as="th" className="text-right">Stock</TablaCelda>
                  <TablaCelda as="th" className="text-right">Mínimo</TablaCelda>
                  {tab === 'stock' && <TablaCelda as="th" className="text-right">Acciones</TablaCelda>}
                </>
              )}
              {tab === 'movimientos' && (
                <>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Tipo</TablaCelda>
                  <TablaCelda as="th">Referencia</TablaCelda>
                  <TablaCelda as="th" className="text-right">Cantidad</TablaCelda>
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
                <TablaCelda colSpan={tab === 'stock' ? 7 : tab === 'alertas' ? 6 : tab === 'conteos' ? 8 : tab === 'movimientos' ? 5 : 4}>
                  <EmptyState title="Sin registros" description="No hay datos para la vista actual." />
                </TablaCelda>
              </TablaFila>
            )}

            {pagedRows.map((row) => (
              <TablaFila key={`${tab}-${row.id}`}>
                {['stock', 'alertas'].includes(tab) && (
                  <>
                    <TablaCelda className="font-semibold text-[var(--color-text)]">{row.codigo}</TablaCelda>
                    <TablaCelda>{row.nombre}</TablaCelda>
                    <TablaCelda>{row.categoria_nombre || '-'}</TablaCelda>
                    <TablaCelda>{getUnidad(row.unidad_medida || row.unidad || 'UND')}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                      {formatInventoryQty(row.stock_actual, row.unidad_medida || row.unidad)}
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      {formatInventoryQty(row.stock_minimo, row.unidad_medida || row.unidad)}
                    </TablaCelda>
                    {tab === 'stock' && (
                      <TablaCelda>
                        <div className="flex justify-end">
                          <IconButton
                            variant="iconEdit"
                            size="sm"
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
                            <PiPencilSimple className="text-lg" />
                          </IconButton>
                        </div>
                      </TablaCelda>
                    )}
                  </>
                )}

                {tab === 'movimientos' && (
                  <>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda>{row.producto_codigo} - {row.producto_nombre}</TablaCelda>
                    <TablaCelda>
                      <TipoBadge tipo={row.tipo} />
                    </TablaCelda>
                    <TablaCelda>{row.referencia}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                      {formatInventoryQty(Number(row.cantidad || 0) * Number(row.signo || 1), row.unidad_medida, { appendUnit: true })}
                    </TablaCelda>
                  </>
                )}

                {tab === 'conteos' && (
                  <>
                    <TablaCelda className="font-semibold text-[var(--color-text)]">#{row.id}</TablaCelda>
                    <TablaCelda>{formatDateQuito(row.created_at || row.fecha || row.updated_at)}</TablaCelda>
                    <TablaCelda>{row.estado}</TablaCelda>
                    <TablaCelda>{row.usuario_nombre || '-'}</TablaCelda>
                    <TablaCelda className="text-right">{row.items_count}</TablaCelda>
                    <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{Number(row.diferencia_total || 0).toFixed(3)}</TablaCelda>
                    <TablaCelda>{row.observacion || '-'}</TablaCelda>
                    <TablaCelda>
                      <div className="flex justify-end">
                        {row.estado === 'BORRADOR' ? (
                          <IconButton
                            variant="iconSuccess"
                            size="sm"
                            aria-label={`Aplicar conteo ${row.id}`}
                            title="Aplicar conteo"
                            onClick={() => setConteoPendiente(row)}
                          >
                            <PiCheckCircle className="text-lg" />
                          </IconButton>
                        ) : (
                          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Aplicado</span>
                        )}
                      </div>
                    </TablaCelda>
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
            ))}
          </TablaCuerpo>
        </Tabla>

        <Paginador
          paginaActual={pagina}
          totalPaginas={totalPaginas}
          totalRegistros={filteredRows.length}
          mostrarSiempre
          onPageChange={setPagina}
        />
      </Card>

      {loading && <LoadingState label="Actualizando inventario..." />}

      <InventoryActionModal
        open={showConteoModal}
        onClose={resetConteoModal}
        title="Nuevo conteo"
        description="Registra un conteo puntual de inventario. Luego podrá aplicarse desde la tabla de conteos."
        onConfirm={onCrearConteo}
        confirmLabel="Crear conteo"
        loading={loading}
      >
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Producto</label>
          <div className="mt-2">
            <ProductoSelect
              value={conteoForm.producto_id}
              onChange={(e) => setConteoForm((state) => ({ ...state, producto_id: e.target.value }))}
              productos={productoOpciones}
            />
          </div>
        </div>
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
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observación</label>
          <Input
            className="mt-2"
            value={conteoForm.observacion}
            onChange={(e) => setConteoForm((state) => ({ ...state, observacion: e.target.value }))}
            placeholder="Opcional"
          />
        </div>
      </InventoryActionModal>

      <InventoryActionModal
        open={showAjusteModal}
        onClose={resetAjusteModal}
        title="Ajuste manual"
        description="Usa entrada o salida manual para corregir stock con referencia operativa."
        onConfirm={onAplicarAjuste}
        confirmLabel="Aplicar ajuste"
        loading={loading}
      >
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Producto</label>
          <div className="mt-2">
            <ProductoSelect
              value={ajusteForm.producto_id}
              onChange={(e) => setAjusteForm((state) => ({ ...state, producto_id: e.target.value }))}
              productos={productoOpciones}
            />
          </div>
        </div>
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
            <Input
              className="mt-2"
              value={ajusteForm.referencia}
              onChange={(e) => setAjusteForm((state) => ({ ...state, referencia: e.target.value }))}
              placeholder="AJUSTE_MANUAL"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observación</label>
            <Input
              className="mt-2"
              value={ajusteForm.observacion}
              onChange={(e) => setAjusteForm((state) => ({ ...state, observacion: e.target.value }))}
              placeholder="Opcional"
            />
          </div>
        </div>
      </InventoryActionModal>

      <InventoryActionModal
        open={showMermaModal}
        onClose={resetMermaModal}
        title="Registrar merma"
        description="Descuenta inventario por daño, desperdicio o pérdida operativa."
        onConfirm={onCrearMerma}
        confirmLabel="Guardar merma"
        confirmVariant="danger"
        loading={loading}
      >
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Producto</label>
          <div className="mt-2">
            <ProductoSelect
              value={mermaForm.producto_id}
              onChange={(e) => setMermaForm((state) => ({ ...state, producto_id: e.target.value }))}
              productos={productoOpciones}
            />
          </div>
        </div>
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
            <Input
              className="mt-2"
              value={mermaForm.motivo}
              onChange={(e) => setMermaForm((state) => ({ ...state, motivo: e.target.value }))}
              placeholder="Motivo"
            />
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Editar producto</h3>
            <p className="text-sm text-[var(--color-text-muted)]">{productoEdit?.codigo} - {productoEdit?.nombre}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={resetProductEdit}>
            X
          </Button>
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]">Nombre</label>
            <Input
              className="mt-2"
              value={editForm.nombre}
              onChange={(e) => setEditForm((state) => ({ ...state, nombre: e.target.value }))}
              placeholder="Nombre"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]">Stock mínimo</label>
              <Input
                className="mt-2"
                value={editForm.stock_minimo}
                onChange={(e) => setEditForm((state) => ({ ...state, stock_minimo: e.target.value }))}
                placeholder="Stock mínimo"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]">Categoría</label>
              <Select
                className="mt-2"
                value={editForm.categoria_id}
                onChange={(e) => setEditForm((state) => ({ ...state, categoria_id: e.target.value }))}
              >
                <option value="">Sin categoría</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nombre}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 text-sm font-medium text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={editForm.activo}
              onChange={(e) => setEditForm((state) => ({ ...state, activo: e.target.checked }))}
            />
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
