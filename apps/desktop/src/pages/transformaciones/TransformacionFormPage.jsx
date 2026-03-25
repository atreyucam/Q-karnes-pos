import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Input,
  Modal,
  Paginador,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '../../ui';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit, getUnidad, sanitizeQtyInput } from '../../lib/formatQty';
import { fetchCategorias, fetchProductosActivos } from '../../services/catalogoService';
import { useAuthStore } from '../../stores/authStore';
import { useTransformacionesStore } from '../../stores/transformacionesStore';

const BALANCE_TOLERANCE = 0.01;
const MODAL_PAGE_SIZE = 10;

function nowLocalDateInput() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function qtyRound(value) {
  return Number(Number(value || 0).toFixed(3));
}

function parseQtyByUnit(raw, unidad) {
  const unit = getUnidad(unidad);
  if (unit === 'UND') {
    const parsed = Number.parseInt(String(raw || '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  const parsed = Number(String(raw || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function summarize(parentQty, resultados, mermas) {
  const entrada = Number((parentQty || 0).toFixed(3));
  const salida = Number(resultados.reduce((acc, row) => acc + Number(row.qty || 0), 0).toFixed(3));
  const merma = Number(mermas.reduce((acc, row) => acc + Number(row.qty || 0), 0).toFixed(3));
  const diff = Number((entrada - salida - merma).toFixed(3));
  return { entrada, salida, merma, diff };
}

function ApplyConfirmModal({
  open,
  auth,
  setAuth,
  onClose,
  onConfirm,
  loading,
  needsAuth,
  parentName,
  parentQty,
  parentUnit,
  remainingQty,
  mermaQty
}) {
  if (!open) return null;
  const safeRemainingQty = qtyRound(Math.max(Number(remainingQty || 0), 0));
  const safeMermaQty = qtyRound(Math.max(Number(mermaQty || 0), 0));
  const usesAllParent = safeRemainingQty <= BALANCE_TOLERANCE;

  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-2xl" panelClassName="p-0">
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Confirmar aplicación de despiece</h3>
            <p className="text-sm text-slate-500">
              Revisa el impacto operativo antes de registrar movimientos reales en inventario.
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="px-6 pt-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm text-slate-700">
              {`Se procesarán ${formatQtyByUnit(parentQty, parentUnit, { fixedLB: true })} ${parentUnit} de "${parentName}".`}
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {usesAllParent
                ? 'Se utilizará la totalidad del producto padre.'
                : `Quedarán ${formatQtyByUnit(safeRemainingQty, parentUnit, { fixedLB: true })} ${parentUnit} disponibles en inventario como producto padre.`}
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {`Merma registrada: ${formatQtyByUnit(safeMermaQty, parentUnit, { fixedLB: true })} ${parentUnit}.`}
            </p>
          </div>
        </div>

        {needsAuth && (
          <div className="px-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">Autorización ADMIN</p>
              <p className="mt-1 text-sm text-amber-800">
                Ingresa credenciales de administrador para continuar con la aplicación del despiece.
              </p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Usuario admin</label>
                <Input
                  value={auth.usuario}
                  onChange={(e) => setAuth((s) => ({ ...s, usuario: e.target.value }))}
                  placeholder="Ingresa usuario autorizado"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Clave admin</label>
                <Input
                  type="password"
                  value={auth.password}
                  onChange={(e) => setAuth((s) => ({ ...s, password: e.target.value }))}
                  placeholder="Ingresa clave autorizada"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? 'Aplicando...' : 'Confirmar y aplicar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ProductSearchModal({
  open,
  title,
  search,
  onSearchChange,
  filters,
  rows,
  page,
  totalPages,
  totalRecords,
  onPageChange,
  onClose,
  onSelect,
  renderExtraFilters,
  getStockLabel
}) {
  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-5xl" panelClassName="p-0">
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500">Busca y selecciona un producto del inventario activo.</p>
          </div>
          <button type="button" className="text-sm text-slate-500" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Buscar</label>
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Código o nombre"
            />
          </div>
          {renderExtraFilters?.()}
          {filters}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Producto</TableCell>
                <TableCell>Unidad</TableCell>
                <TableCell>Stock</TableCell>
                <TableCell>Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length ? rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">{row.nombre}</p>
                      <p className="text-xs text-slate-500">{row.codigo || `#${row.id}`}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getUnidad(row.unidad_medida || row.unidad)}</TableCell>
                  <TableCell>{getStockLabel(row)}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => onSelect(row)}>
                      Seleccionar
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell className="py-6 text-slate-500" colSpan={4}>
                    No hay productos disponibles con esos filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <Paginador
          paginaActual={page}
          totalPaginas={totalPages}
          totalRegistros={totalRecords}
          onPageChange={onPageChange}
        />
      </div>
    </Modal>
  );
}

export default function TransformacionFormPage() {
  const { id } = useParams();
  const editId = Number(id);
  const isEdit = Number.isFinite(editId) && editId > 0;
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const { actual, loading, saving, error, obtener, crear, editar, eliminar, aplicar, limpiarActual } = useTransformacionesStore();
  const isReadOnlyMode = isEdit && !location.pathname.endsWith('/editar');
  const isAdminUser = String(currentUser?.rol?.nombre || currentUser?.rol || '').trim().toUpperCase() === 'ADMIN';

  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [catalogError, setCatalogError] = useState('');
  const [localError, setLocalError] = useState('');
  const [savedInfo, setSavedInfo] = useState(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showBaseModal, setShowBaseModal] = useState(false);
  const [showChildModal, setShowChildModal] = useState(false);
  const [auth, setAuth] = useState({ usuario: '', password: '' });
  const [baseSearch, setBaseSearch] = useState('');
  const [baseStockFilter, setBaseStockFilter] = useState('CON_STOCK');
  const [basePage, setBasePage] = useState(1);
  const [childSearch, setChildSearch] = useState('');
  const [childCategory, setChildCategory] = useState('ALL');
  const [childPage, setChildPage] = useState(1);

  const [header, setHeader] = useState({
    fecha: nowLocalDateInput(),
    observacion: ''
  });
  const [parent, setParent] = useState({
    producto_id: '',
    cantidadInput: ''
  });
  const [resultados, setResultados] = useState([]);
  const [merma, setMerma] = useState({
    producto_id: '',
    cantidadInput: '',
    motivo: 'Merma de despiece'
  });

  useEffect(() => {
    Promise.all([fetchProductosActivos(), fetchCategorias()])
      .then(([rows, categories]) => {
        setProductos(rows || []);
        setCategorias(categories || []);
        setCatalogError('');
      })
      .catch((e) => {
        setCatalogError(e.message || 'No se pudo cargar catálogo de productos');
      });
  }, []);

  useEffect(() => {
    if (!isEdit) {
      limpiarActual();
      return;
    }
    obtener(editId).catch((e) => setLocalError(e.message));
    return () => limpiarActual();
  }, [editId, isEdit, limpiarActual, obtener]);

  useEffect(() => {
    if (!isEdit || !actual?.id || actual.id !== editId) return;

    const totalMerma = (actual.mermas || []).reduce((acc, row) => acc + Number(row.cantidad || 0), 0);
    const firstMerma = actual.mermas?.[0];

    setHeader({
      fecha: actual.fecha ? String(actual.fecha).slice(0, 10) : nowLocalDateInput(),
      observacion: actual.observacion || ''
    });
    setParent({
      producto_id: String(actual.insumo?.producto_id || ''),
      cantidadInput: String(actual.insumo?.cantidad ?? '')
    });
    setResultados(
      (actual.resultados || []).map((row) => ({
        producto_id: String(row.producto_id),
        cantidadInput: String(row.cantidad)
      }))
    );
    setMerma({
      producto_id: String(firstMerma?.producto_id || ''),
      cantidadInput: totalMerma ? String(totalMerma) : '',
      motivo: firstMerma?.motivo || 'Merma de despiece'
    });
    setSavedInfo(actual);
  }, [actual, editId, isEdit]);

  const productsMap = useMemo(
    () => new Map((productos || []).map((product) => [String(product.id), product])),
    [productos]
  );

  const parentCategoryId = useMemo(() => {
    const categoriaPadre = categorias.find((category) => String(category.nombre || '').trim().toLowerCase() === 'producto padre');
    return categoriaPadre ? String(categoriaPadre.id) : null;
  }, [categorias]);

  const lbProducts = useMemo(
    () => (productos || []).filter((product) => getUnidad(product.unidad_medida || product.unidad) === 'LB'),
    [productos]
  );

  const categoryOptions = useMemo(() => {
    if (categorias.length) {
      return categorias.map((category) => ({
        value: String(category.id),
        label: category.nombre
      }));
    }

    const seen = new Map();
    for (const product of productos) {
      const key = product.categoria_id ? String(product.categoria_id) : String(product.categoria_nombre || '');
      const label = product.categoria_nombre || 'Sin categoría';
      if (!key || seen.has(key)) continue;
      seen.set(key, { value: key, label });
    }
    return [...seen.values()];
  }, [categorias, productos]);

  const parentProduct = productsMap.get(parent.producto_id);
  const parentUnit = getUnidad(parentProduct?.unidad_medida || parentProduct?.unidad || 'LB');
  const parentQty = parseQtyByUnit(parent.cantidadInput, parentUnit);
  const isEditableDraft = !isReadOnlyMode && (!isEdit || actual?.estado === 'BORRADOR');
  const parentAvailableStock = qtyRound(
    isEdit
      ? Number(actual?.insumo?.stock_disponible_snapshot || parentProduct?.stock_actual || 0)
      : Number(parentProduct?.stock_actual || 0)
  );
  const parentRemainingEstimate = Number.isFinite(parentQty)
    ? qtyRound(parentAvailableStock - parentQty)
    : qtyRound(
      isEdit
        ? Number(actual?.insumo?.stock_restante_snapshot || parentAvailableStock)
        : parentAvailableStock
    );

  function formatSummaryValue(value, unit) {
    return `${formatQtyByUnit(value, unit, { fixedLB: true })} ${unit}`;
  }

  const resultadosView = useMemo(
    () =>
      resultados.map((row) => {
        const product = productsMap.get(row.producto_id);
        const unit = getUnidad(product?.unidad_medida || product?.unidad || 'LB');
        return {
          ...row,
          product,
          unit,
          qty: parseQtyByUnit(row.cantidadInput, unit)
        };
      }),
    [productsMap, resultados]
  );

  const mermaView = useMemo(() => {
    const product = productsMap.get(merma.producto_id);
    const qty = parseQtyByUnit(merma.cantidadInput, parentUnit);
    return {
      ...merma,
      product,
      qty
    };
  }, [merma, parentUnit, productsMap]);
  const effectiveMermaQty = Number.isFinite(mermaView.qty) && mermaView.qty >= 0 ? qtyRound(mermaView.qty) : 0;

  const summary = useMemo(
    () =>
      summarize(
        Number.isFinite(parentQty) ? parentQty : 0,
        resultadosView,
        effectiveMermaQty > 0 ? [{ ...mermaView, qty: effectiveMermaQty }] : []
      ),
    [effectiveMermaQty, mermaView, parentQty, resultadosView]
  );

  const baseCandidates = useMemo(() => {
    const q = baseSearch.trim().toLowerCase();
    return lbProducts.filter((product) => {
      if (parentCategoryId && String(product.categoria_id || '') !== parentCategoryId) return false;
      if (baseStockFilter === 'CON_STOCK' && Number(product.stock_actual || 0) <= 0) return false;
      if (!q) return true;
      return String(product.codigo || '').toLowerCase().includes(q)
        || String(product.nombre || '').toLowerCase().includes(q);
    });
  }, [baseSearch, baseStockFilter, lbProducts, parentCategoryId]);

  const childCandidates = useMemo(() => {
    const q = childSearch.trim().toLowerCase();
    const usedIds = new Set(resultados.map((row) => row.producto_id).filter(Boolean));

    return lbProducts.filter((product) => {
      if (String(product.id) === String(parent.producto_id)) return false;
      if (parentCategoryId && String(product.categoria_id || '') === parentCategoryId) return false;
      if (usedIds.has(String(product.id))) return false;

      if (childCategory !== 'ALL') {
        const productCategoryId = product.categoria_id ? String(product.categoria_id) : String(product.categoria_nombre || '');
        if (productCategoryId !== childCategory) return false;
      }

      if (!q) return true;
      return String(product.codigo || '').toLowerCase().includes(q)
        || String(product.nombre || '').toLowerCase().includes(q);
    });
  }, [childCategory, childSearch, lbProducts, parent.producto_id, parentCategoryId, resultados]);

  const baseTotalPages = Math.max(1, Math.ceil(baseCandidates.length / MODAL_PAGE_SIZE));
  const childTotalPages = Math.max(1, Math.ceil(childCandidates.length / MODAL_PAGE_SIZE));

  const pagedBaseRows = baseCandidates.slice((basePage - 1) * MODAL_PAGE_SIZE, basePage * MODAL_PAGE_SIZE);
  const pagedChildRows = childCandidates.slice((childPage - 1) * MODAL_PAGE_SIZE, childPage * MODAL_PAGE_SIZE);

  useEffect(() => {
    setBasePage(1);
  }, [baseSearch, baseStockFilter]);

  useEffect(() => {
    setChildPage(1);
  }, [childCategory, childSearch]);

  const balanceOk = Math.abs(summary.diff) <= BALANCE_TOLERANCE;

  const validateForm = ({ strictBalance = false } = {}) => {
    if (!parent.producto_id) return 'Selecciona un producto base.';
    if (parentUnit !== 'LB') return 'El producto base debe manejarse en LB.';
    if (parentCategoryId && String(parentProduct?.categoria_id || '') !== parentCategoryId) {
      return 'El producto base debe pertenecer a la categoría Producto padre.';
    }
    if (!Number.isFinite(parentQty) || parentQty <= 0) return 'La cantidad a despiezar debe ser válida.';
    if (parentQty > parentAvailableStock) {
      return `La cantidad a despiezar no puede superar el stock disponible (${formatQtyByUnit(parentAvailableStock, parentUnit, { fixedLB: true })} ${parentUnit}).`;
    }

    for (const row of resultadosView) {
      if (!row.producto_id) return 'Cada hijo debe tener producto seleccionado.';
      if (String(row.producto_id) === String(parent.producto_id)) return 'El producto base no puede registrarse como producto hijo.';
      if (parentCategoryId && String(row.product?.categoria_id || '') === parentCategoryId) {
        return 'Los productos de la categoría Producto padre no pueden registrarse como hijos.';
      }
      if (row.unit !== 'LB') return `El hijo ${row.product?.nombre || row.producto_id} debe manejarse en LB.`;
      if (!Number.isFinite(row.qty) || row.qty <= 0) return `La cantidad del hijo ${row.product?.nombre || row.producto_id} es inválida.`;
    }

    if (merma.cantidadInput !== '' || merma.producto_id) {
      if (!Number.isFinite(mermaView.qty)) return 'La cantidad de merma debe ser válida.';
      if (mermaView.qty < 0) return 'La cantidad de merma no puede ser negativa.';
      if (mermaView.qty > 0 && !merma.producto_id) return 'Selecciona el producto de merma.';
    }

    if (!resultadosView.length && effectiveMermaQty <= 0) {
      return 'Agrega al menos un producto hijo o una merma.';
    }

    if (strictBalance && !balanceOk) {
      return `Para aplicar el despiece, la suma de hijos + merma debe igualar la cantidad a despiezar. Diferencia actual: ${formatQtyByUnit(summary.diff, parentUnit, { fixedLB: true })} ${parentUnit}.`;
    }

    return '';
  };

  const buildPayload = () => ({
    fecha: header.fecha ? new Date(`${header.fecha}T12:00:00`).toISOString() : undefined,
    tipo_proceso: 'DESPIECE',
    observacion: header.observacion || undefined,
    insumo: {
      producto_id: Number(parent.producto_id),
      cantidad: Number(parentQty)
    },
    resultados: resultadosView.map((row) => ({
      producto_id: Number(row.producto_id),
      cantidad: Number(row.qty)
    })),
    mermas: effectiveMermaQty > 0 ? [{
      tipo_merma: 'RECORTE',
      producto_id: merma.producto_id ? Number(merma.producto_id) : null,
      cantidad: Number(effectiveMermaQty),
      motivo: (merma.motivo || 'Merma de despiece').trim()
    }] : []
  });

  const handleSelectBase = (product) => {
    setParent({
      producto_id: String(product.id),
      cantidadInput: ''
    });
    setShowBaseModal(false);
  };

  const handleAddChild = (product) => {
    setResultados((current) => [...current, { producto_id: String(product.id), cantidadInput: '1.00' }]);
    setShowChildModal(false);
  };

  const handleSave = async () => {
    if (!isEditableDraft) return;
    setLocalError('');
    const validation = validateForm({ strictBalance: false });
    if (validation) {
      setLocalError(validation);
      return;
    }

    try {
      const saved = isEdit ? await editar(editId, buildPayload()) : await crear(buildPayload());
      setSavedInfo(saved);
      if (!isEdit) {
        navigate(`/transformaciones/${saved.id}/editar`);
      }
    } catch (e) {
      setLocalError(e.message);
    }
  };

  const handleOpenApply = () => {
    if (!isEditableDraft) return;
    setLocalError('');
    const validation = validateForm({ strictBalance: true });
    if (validation) {
      setLocalError(validation);
      return;
    }

    const targetId = isEdit ? editId : savedInfo?.id;
    if (!targetId) {
      setLocalError('Primero guarda el borrador antes de aplicar el despiece.');
      return;
    }

    setShowApplyModal(true);
  };

  const handleApply = async () => {
    setLocalError('');
    if (!isAdminUser && (!auth.usuario.trim() || !auth.password)) {
      setLocalError('Debes ingresar autorización ADMIN para aplicar.');
      return;
    }

    try {
      const targetId = isEdit ? editId : savedInfo?.id;
      const applied = await aplicar(
        targetId,
        isAdminUser
          ? {}
          : {
            autorizacion: {
              usuario: auth.usuario.trim(),
              password: auth.password
            }
          }
      );
      setShowApplyModal(false);
      navigate(`/transformaciones/${applied.id}`);
    } catch (e) {
      setLocalError(e.message);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !actual || actual.estado !== 'BORRADOR') return;
    if (!window.confirm(`¿Eliminar borrador ${actual.numero}?`)) return;
    setLocalError('');
    try {
      await eliminar(editId);
      navigate('/transformaciones');
    } catch (e) {
      setLocalError(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="w-full">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-muted)] transition hover:text-[var(--color-text)]"
          onClick={() => navigate('/transformaciones')}
        >
          <span aria-hidden="true">←</span>
          Volver a despieces
        </button>

        <div className="mt-5 space-y-1">
          <h1 className="text-[2rem] font-bold tracking-[-0.02em] text-[var(--color-text)]">
            {isReadOnlyMode
              ? `Detalle despiece ${actual?.numero || `#${editId}`}`
              : isEdit
                ? `Editar despiece ${actual?.numero || `#${editId}`}`
                : 'Nuevo despiece'}
          </h1>
          <p className="text-base text-[var(--color-text-muted)]">
            Selecciona el producto base, define la cantidad a despiezar, registra hijos y merma. El resto del stock quedará en inventario para futuros despieces.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {(error || localError || catalogError) && (
            <Alert tone="error">
              {localError || catalogError || error}
            </Alert>
          )}
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-5 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7 lg:p-8">
            <div className="space-y-4 border-b border-[var(--color-border)] pb-6">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_220px]">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Producto base</label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      readOnly
                      className="flex-1"
                      value={parentProduct ? `${parentProduct.codigo || `#${parentProduct.id}`} - ${parentProduct.nombre}` : ''}
                      placeholder="Seleccionar producto base"
                      onClick={() => setShowBaseModal(true)}
                      disabled={!isEditableDraft}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => setShowBaseModal(true)}
                      disabled={!isEditableDraft}
                    >
                      Buscar
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    {parentProduct
                      ? `Stock disponible: ${formatQtyByUnit(parentAvailableStock, parentUnit, { fixedLB: true })} ${parentUnit}. El resto quedará en inventario para futuros despieces.`
                      : parentCategoryId
                        ? 'Selecciona un producto base activo de la categoría Producto padre.'
                        : 'Selecciona un producto base activo para el despiece.'}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cantidad a despiezar</label>
                  <Input
                    className="mt-2"
                    value={parent.cantidadInput}
                    onChange={(e) => setParent((current) => ({
                      ...current,
                      cantidadInput: sanitizeQtyInput(e.target.value, parentUnit)
                    }))}
                    disabled={!isEditableDraft || !parent.producto_id}
                    placeholder="0.00"
                  />
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    Solo esta cantidad se consumirá del producto padre.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Puedes hacer un despiece parcial. No es obligatorio procesar todo el stock disponible.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fecha</label>
                  <Input
                    className="mt-2"
                    type="date"
                    value={header.fecha}
                    onChange={(e) => setHeader((current) => ({ ...current, fecha: e.target.value }))}
                    disabled={!isEditableDraft}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Observación</label>
                <Input
                  className="mt-2"
                  value={header.observacion}
                  onChange={(e) => setHeader((current) => ({ ...current, observacion: e.target.value }))}
                  disabled={!isEditableDraft}
                  placeholder="Opcional"
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Entrada base</h3>
              <div className="mt-4 grid gap-4 xl:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Producto base</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{parentProduct?.nombre || 'Sin seleccionar'}</p>
                  <p className="text-sm text-slate-500">{parentProduct?.codigo || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Stock disponible</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {formatQtyByUnit(parentAvailableStock, parentUnit, { fixedLB: true })} {parentUnit}
                  </p>
                  <p className="text-sm text-slate-500">Cantidad total actualmente disponible antes del proceso.</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cantidad a despiezar</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {Number.isFinite(parentQty) ? `${formatQtyByUnit(parentQty, parentUnit, { fixedLB: true })} ${parentUnit}` : `0.00 ${parentUnit}`}
                  </p>
                  <p className="text-sm text-slate-500">Cantidad base que se procesará en esta operación.</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Stock restante estimado</p>
                  <p className={`mt-2 text-lg font-semibold ${parentRemainingEstimate < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                    {formatQtyByUnit(Math.max(parentRemainingEstimate, 0), parentUnit, { fixedLB: true })} {parentUnit}
                  </p>
                  <p className="text-sm text-slate-500">Saldo del padre que quedará disponible tras el despiece.</p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Productos hijo</h3>
                  <p className="text-sm text-slate-500">Agrega los cortes o productos resultantes del despiece.</p>
                </div>
                <Button onClick={() => setShowChildModal(true)} disabled={!isEditableDraft || !parent.producto_id}>
                  Agregar hijo
                </Button>
              </div>

              <div className="px-5 py-5">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Producto hijo</TableCell>
                        <TableCell>Unidad</TableCell>
                        <TableCell>Cantidad</TableCell>
                        <TableCell>Costo ref</TableCell>
                        <TableCell>Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {resultadosView.length ? resultadosView.map((row, index) => (
                        <TableRow key={`child-${row.producto_id}-${index}`}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-900">{row.product?.nombre || 'Producto sin seleccionar'}</p>
                              <p className="text-xs text-slate-500">{row.product?.codigo || '-'}</p>
                            </div>
                          </TableCell>
                          <TableCell>{row.unit}</TableCell>
                          <TableCell>
                            <div className="w-32">
                              <Input
                                value={row.cantidadInput}
                                onChange={(e) =>
                                  setResultados((current) => current.map((item, currentIndex) => (
                                    currentIndex === index
                                      ? { ...item, cantidadInput: sanitizeQtyInput(e.target.value, row.unit) }
                                      : item
                                  )))
                                }
                                disabled={!isEditableDraft}
                              />
                            </div>
                          </TableCell>
                          <TableCell>{formatMoney(Number(row.product?.costo_promedio || 0))}</TableCell>
                          <TableCell>
                            <Button
                              variant="iconDanger"
                              size="sm"
                              className="font-bold"
                              aria-label={`Quitar ${row.product?.nombre || 'producto'}`}
                              title="Quitar"
                              onClick={() => setResultados((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                              disabled={!isEditableDraft}
                            >
                              <span className="text-lg font-extrabold leading-none text-current">×</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell className="py-6 text-slate-500" colSpan={5}>
                            No has agregado productos hijo.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
              <div className="rounded-2xl border border-slate-200 p-5">
                <h3 className="text-base font-semibold text-slate-900">Merma</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Producto merma</label>
                    <Select
                      value={merma.producto_id}
                      onChange={(e) => setMerma((current) => ({ ...current, producto_id: e.target.value }))}
                      disabled={!isEditableDraft}
                    >
                      <option value="">Seleccionar producto</option>
                      {lbProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.codigo} - {product.nombre}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cantidad merma</label>
                    <Input
                      value={merma.cantidadInput}
                      onChange={(e) => setMerma((current) => ({
                        ...current,
                        cantidadInput: sanitizeQtyInput(e.target.value, parentUnit)
                      }))}
                      placeholder="0.00"
                      disabled={!isEditableDraft}
                    />
                    <p className="mt-1 text-xs text-slate-500">Unidad: {parentUnit}. Puede ser 0.00.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                <h3 className="text-base font-semibold text-slate-900">Resumen</h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Entrada base</span>
                    <strong className="text-slate-900">{formatSummaryValue(summary.entrada, parentUnit)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Salida hijos</span>
                    <strong className="text-slate-900">{formatSummaryValue(summary.salida, parentUnit)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Merma</span>
                    <strong className="text-slate-900">{formatSummaryValue(effectiveMermaQty, parentUnit)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Stock restante estimado</span>
                    <strong className={parentRemainingEstimate < 0 ? 'text-rose-600' : 'text-slate-900'}>
                      {formatSummaryValue(Math.max(parentRemainingEstimate, 0), parentUnit)}
                    </strong>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Saldo</span>
                      <strong className={balanceOk ? 'text-emerald-600' : summary.diff < 0 ? 'text-rose-600' : 'text-amber-600'}>
                        {formatSummaryValue(summary.diff, parentUnit)}
                      </strong>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Balance</span>
                      <strong className={balanceOk ? 'text-emerald-600' : 'text-amber-600'}>
                        {balanceOk ? 'OK' : 'Revisar'}
                      </strong>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Para aplicar el despiece, hijos + merma deben cerrar contra la cantidad a despiezar, con tolerancia {BALANCE_TOLERANCE}.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
              <div className="flex items-center gap-3">
                {!isReadOnlyMode && isEdit && actual?.estado === 'BORRADOR' && (
                  <Button variant="danger" onClick={handleDelete} disabled={saving}>
                    Eliminar borrador
                  </Button>
                )}
              </div>
              {!isReadOnlyMode && (
                <div className="flex items-center gap-3">
                  <Button variant="secondary" onClick={handleSave} disabled={saving || !isEditableDraft || loading}>
                    {saving ? 'Guardando...' : 'Guardar borrador'}
                  </Button>
                  <Button onClick={handleOpenApply} disabled={saving || loading || !isEditableDraft}>
                    Aplicar despiece
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ProductSearchModal
        open={showBaseModal}
        title="Seleccionar producto base"
        search={baseSearch}
        onSearchChange={setBaseSearch}
        filters={(
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Stock</label>
            <Select value={baseStockFilter} onChange={(e) => setBaseStockFilter(e.target.value)}>
              <option value="CON_STOCK">Con stock</option>
              <option value="TODOS">Todos</option>
            </Select>
          </div>
        )}
        rows={pagedBaseRows}
        page={basePage}
        totalPages={baseTotalPages}
        totalRecords={baseCandidates.length}
        onPageChange={setBasePage}
        onClose={() => setShowBaseModal(false)}
        onSelect={handleSelectBase}
        getStockLabel={(row) => formatQtyByUnit(row.stock_actual || 0, row.unidad_medida || row.unidad, { fixedLB: true })}
      />

      <ProductSearchModal
        open={showChildModal}
        title="Agregar producto hijo"
        search={childSearch}
        onSearchChange={setChildSearch}
        filters={(
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Categoría</label>
            <Select value={childCategory} onChange={(e) => setChildCategory(e.target.value)}>
              <option value="ALL">Todas las categorías</option>
              {categoryOptions.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        rows={pagedChildRows}
        page={childPage}
        totalPages={childTotalPages}
        totalRecords={childCandidates.length}
        onPageChange={setChildPage}
        onClose={() => setShowChildModal(false)}
        onSelect={handleAddChild}
        getStockLabel={(row) => formatQtyByUnit(row.stock_actual || 0, row.unidad_medida || row.unidad, { fixedLB: true })}
      />

      <ApplyConfirmModal
        open={showApplyModal}
        auth={auth}
        setAuth={setAuth}
        onClose={() => setShowApplyModal(false)}
        onConfirm={handleApply}
        loading={saving}
        needsAuth={!isAdminUser}
        parentName={parentProduct?.nombre || 'Producto padre'}
        parentQty={Number.isFinite(parentQty) ? parentQty : 0}
        parentUnit={parentUnit}
        remainingQty={parentRemainingEstimate}
        mermaQty={effectiveMermaQty}
      />
    </div>
  );
}
