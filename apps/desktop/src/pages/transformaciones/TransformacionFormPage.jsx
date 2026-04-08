import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  BackButton,
  Button,
  Input,
  Modal,
  Paginador,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Textarea
} from '../../ui';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit, getUnidad, sanitizeQtyInput } from '../../lib/formatQty';
import { fetchCategorias, fetchProductosActivos } from '../../services/catalogoService';
import { useAuthStore } from '../../stores/authStore';
import { useTransformacionesStore } from '../../stores/transformacionesStore';

const MODAL_PAGE_SIZE = 10;
const WEIGHT_UNITS = new Set(['KG', 'LB']);
const UNIT_TO_BASE_PER_MILLI = {
  KG: 100_000_000,
  LB: 45_359_237
};
const UNIT_TO_BASE_PER_UNIT = {
  KG: 100_000_000_000,
  LB: 45_359_237_000
};

function nowLocalDateInput() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function createRowId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeUnit(unit) {
  return getUnidad(unit || 'UND');
}

function isWeightUnit(unit) {
  return WEIGHT_UNITS.has(normalizeUnit(unit));
}

function areUnitsCompatible(parentUnit, rowUnit) {
  const normalizedParent = normalizeUnit(parentUnit);
  const normalizedRow = normalizeUnit(rowUnit);
  if (normalizedParent === normalizedRow) return true;
  return isWeightUnit(normalizedParent) && isWeightUnit(normalizedRow);
}

function parseScaledInteger(value, scale) {
  const normalizedRaw = String(value ?? '').trim().replace(',', '.');
  if (!normalizedRaw) return null;

  const sign = normalizedRaw.startsWith('-') ? -1 : 1;
  const unsigned = normalizedRaw.replace(/^[+-]/, '');
  if (!/^\d+(\.\d+)?$/.test(unsigned)) return null;

  const [wholePartRaw, fractionRaw = ''] = unsigned.split('.');
  if (fractionRaw.length > scale) return null;

  const wholePart = Number(wholePartRaw || '0');
  const paddedFraction = scale > 0 ? fractionRaw.padEnd(scale, '0') : '';
  const fractionPart = scale > 0 ? Number(paddedFraction || '0') : 0;
  if (!Number.isSafeInteger(wholePart) || !Number.isSafeInteger(fractionPart)) return null;

  const scaled = (wholePart * (10 ** scale)) + fractionPart;
  return Number.isSafeInteger(scaled) ? sign * scaled : null;
}

function quantityToBase(value, unit) {
  const normalizedUnit = normalizeUnit(unit);
  if (normalizedUnit === 'UND') return parseScaledInteger(value, 0);

  const milliQuantity = parseScaledInteger(value, 3);
  if (milliQuantity === null) return null;
  return milliQuantity * UNIT_TO_BASE_PER_MILLI[normalizedUnit];
}

function baseToVisible(baseQuantity, unit) {
  const normalizedUnit = normalizeUnit(unit);
  const base = Number(baseQuantity || 0);
  if (normalizedUnit === 'UND') return base;
  return Number((base / UNIT_TO_BASE_PER_UNIT[normalizedUnit]).toFixed(3));
}

function centsToMoney(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function centsToUnitCost(cents, baseQuantity, unit) {
  const quantityBase = Number(baseQuantity || 0);
  if (quantityBase <= 0) return 0;
  if (normalizeUnit(unit) === 'UND') {
    return Number((Number(cents || 0) / 100 / quantityBase).toFixed(6));
  }
  const visibleQuantity = baseToVisible(quantityBase, unit);
  if (visibleQuantity <= 0) return 0;
  return Number((Number(cents || 0) / 100 / visibleQuantity).toFixed(6));
}

function parseMoneyInput(raw) {
  const text = String(raw || '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const firstDot = text.indexOf('.');
  if (firstDot === -1) return text;
  return `${text.slice(0, firstDot + 1)}${text.slice(firstDot + 1).replace(/\./g, '').slice(0, 2)}`;
}

function moneyToCents(value) {
  const normalizedRaw = String(value ?? '').trim().replace(',', '.');
  if (!normalizedRaw) return null;
  if (!/^\d+(\.\d+)?$/.test(normalizedRaw)) return null;

  const [wholePartRaw, fractionRaw = ''] = normalizedRaw.split('.');
  const wholePart = Number(wholePartRaw || '0');
  if (!Number.isSafeInteger(wholePart)) return null;

  const centsDigits = (fractionRaw + '00').slice(0, 2);
  const roundingDigit = Number((fractionRaw + '000').charAt(2) || '0');
  let cents = Number(centsDigits || '0');
  let carry = 0;

  if (!Number.isSafeInteger(cents)) return null;
  if (roundingDigit >= 5) {
    cents += 1;
    if (cents >= 100) {
      cents -= 100;
      carry = 1;
    }
  }

  const total = ((wholePart + carry) * 100) + cents;
  return Number.isSafeInteger(total) ? total : null;
}

function resolveProductStockBase(product) {
  if (!product) return 0;
  if (product.stock_actual_base !== undefined && product.stock_actual_base !== null) {
    return Number(product.stock_actual_base || 0);
  }
  return quantityToBase(product.stock_actual || 0, product.unidad_medida || product.unidad) || 0;
}

function resolveProductValueCents(product) {
  if (!product) return 0;
  if (product.valor_inventario_centavos !== undefined && product.valor_inventario_centavos !== null) {
    return Number(product.valor_inventario_centavos || 0);
  }
  const stockBase = resolveProductStockBase(product);
  const stockVisible = baseToVisible(stockBase, product.unidad_medida || product.unidad);
  return moneyToCents(Number(product.costo_promedio || 0) * stockVisible) || 0;
}

function computeOutgoingValueCents(stockBase, valueCents, outgoingBase) {
  const currentStockBase = Number(stockBase || 0);
  const currentValueCents = Number(valueCents || 0);
  const qtyBase = Number(outgoingBase || 0);

  if (qtyBase <= 0 || currentStockBase <= 0) return 0;
  if (qtyBase >= currentStockBase) return currentValueCents;
  return Math.round((currentValueCents * qtyBase) / currentStockBase);
}

function allocateCentsProRata(totalCents, rows, getWeight = (row) => row.weight || 0) {
  const total = Number(totalCents || 0);
  if (!rows.length) return [];

  const weights = rows.map((row) => Number(getWeight(row) || 0));
  const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
  if (totalWeight <= 0) {
    return rows.map((row, index) => ({ ...row, allocatedCents: index === 0 ? total : 0 }));
  }

  const provisional = rows.map((row, index) => {
    const raw = total * weights[index];
    const base = Math.floor(raw / totalWeight);
    const remainder = raw % totalWeight;
    return {
      ...row,
      allocatedCents: base,
      __remainder: remainder,
      __index: index
    };
  });

  let pending = total - provisional.reduce((acc, row) => acc + row.allocatedCents, 0);
  provisional
    .sort((a, b) => {
      if (b.__remainder !== a.__remainder) return b.__remainder - a.__remainder;
      return a.__index - b.__index;
    })
    .forEach((row) => {
      if (pending <= 0) return;
      row.allocatedCents += 1;
      pending -= 1;
    });

  return provisional
    .sort((a, b) => a.__index - b.__index)
    .map(({ __remainder, __index, ...row }) => row);
}

function defaultQtyInput(unit) {
  return normalizeUnit(unit) === 'UND' ? '1' : '1.000';
}

function formatSummaryValue(value, unit) {
  return `${formatQtyByUnit(value, unit, { fixedWeight: true })} ${normalizeUnit(unit)}`;
}

function resolveRow(row, productsMap, parentUnit) {
  const product = row.producto_id ? productsMap.get(String(row.producto_id)) : null;
  const unit = normalizeUnit(product?.unidad_medida || product?.unidad || parentUnit || 'UND');
  const cantidadBase = quantityToBase(row.cantidadInput, unit);
  const cantidad = cantidadBase === null ? null : baseToVisible(cantidadBase, unit);
  const manualCents = row.costoTotalInput ? moneyToCents(row.costoTotalInput) : null;

  return {
    ...row,
    product,
    unit,
    cantidad,
    cantidadBase,
    manualCents,
    compatibleWithParent: parentUnit ? areUnitsCompatible(parentUnit, unit) : true
  };
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
  parentUnit,
  totalConsumido,
  remainingQty,
  mermaQty
}) {
  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-2xl" panelClassName="p-0">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-text">Confirmar aplicación</h3>
            <p className="text-sm text-text-muted">
              Se registrarán movimientos reales de inventario y costo para esta transformación.
            </p>
          </div>
          <button type="button" className="text-sm text-text-muted" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="rounded-2xl border border-border bg-background p-4 text-sm text-text-muted">
          <p>{`Producto padre: "${parentName}"`}</p>
          <p className="mt-2">{`Total consumido: ${formatQtyByUnit(totalConsumido, parentUnit, { fixedWeight: true })} ${parentUnit}.`}</p>
          <p className="mt-2">{`Merma registrada: ${formatQtyByUnit(mermaQty, parentUnit, { fixedWeight: true })} ${parentUnit}.`}</p>
          <p className="mt-2">{`Stock restante estimado: ${formatQtyByUnit(Math.max(remainingQty, 0), parentUnit, { fixedWeight: true })} ${parentUnit}.`}</p>
        </div>

        {needsAuth && (
          <div className="rounded-2xl border border-warning bg-warning-soft px-4 py-3">
            <p className="text-sm font-semibold text-warning">Autorización ADMIN</p>
            <p className="mt-1 text-sm text-warning">
              Ingresa credenciales de administrador para aplicar la transformación.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Input
                value={auth.usuario}
                onChange={(e) => setAuth((current) => ({ ...current, usuario: e.target.value }))}
                placeholder="Usuario admin"
              />
              <Input
                type="password"
                value={auth.password}
                onChange={(e) => setAuth((current) => ({ ...current, password: e.target.value }))}
                placeholder="Clave admin"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-border pt-4">
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
  getStockLabel
}) {
  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-5xl" panelClassName="p-0">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text">{title}</h3>
            <p className="text-sm text-text-muted">Busca y selecciona un producto activo.</p>
          </div>
          <button type="button" className="text-sm text-text-muted" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Buscar</label>
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Código o nombre"
            />
          </div>
          {filters}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-white">
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
                      <p className="font-semibold text-text">{row.nombre}</p>
                      <p className="text-xs text-text-muted">{row.codigo || `#${row.id}`}</p>
                    </div>
                  </TableCell>
                  <TableCell>{normalizeUnit(row.unidad_medida || row.unidad)}</TableCell>
                  <TableCell>{getStockLabel(row)}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => onSelect(row)}>
                      Seleccionar
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell className="py-6 text-text-muted" colSpan={4}>
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
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const { actual, loading, saving, error, obtener, crear, editar, eliminar, aplicar, limpiarActual } = useTransformacionesStore();
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
  const [header, setHeader] = useState({
    fecha: nowLocalDateInput(),
    tipo_proceso: 'DESPIECE',
    observacion: ''
  });
  const [parent, setParent] = useState({ producto_id: '' });
  const [children, setChildren] = useState([]);
  const [mermas, setMermas] = useState([]);
  const [costMode, setCostMode] = useState('AUTOMATICA');
  const [baseSearch, setBaseSearch] = useState('');
  const [baseStockFilter, setBaseStockFilter] = useState('CON_STOCK');
  const [basePage, setBasePage] = useState(1);
  const [childSearch, setChildSearch] = useState('');
  const [childCategory, setChildCategory] = useState('ALL');
  const [childPage, setChildPage] = useState(1);

  useEffect(() => {
    Promise.all([fetchProductosActivos(), fetchCategorias()])
      .then(([rows, categoryRows]) => {
        setProductos(rows || []);
        setCategorias(categoryRows || []);
        setCatalogError('');
      })
      .catch((requestError) => {
        setCatalogError(requestError.message || 'No se pudo cargar el catálogo');
      });
  }, []);

  useEffect(() => {
    if (!isEdit) {
      limpiarActual();
      return;
    }
    obtener(editId).catch((requestError) => setLocalError(requestError.message));
    return () => limpiarActual();
  }, [editId, isEdit, limpiarActual, obtener]);

  useEffect(() => {
    if (!isEdit || !actual?.id || actual.id !== editId) return;

    setHeader({
      fecha: actual.fecha ? String(actual.fecha).slice(0, 10) : nowLocalDateInput(),
      tipo_proceso: actual.tipo_proceso || 'DESPIECE',
      observacion: actual.observacion || ''
    });
    setParent({ producto_id: String(actual.insumo?.producto_id || '') });
    setChildren((actual.resultados || []).map((row) => ({
      id: createRowId('child'),
      producto_id: String(row.producto_id),
      cantidadInput: String(row.cantidad ?? ''),
      costoTotalInput: row.costo_asignado != null ? String(row.costo_asignado) : ''
    })));
    setMermas((actual.mermas || []).map((row) => ({
      id: createRowId('merma'),
      producto_id: String(row.producto_id || ''),
      cantidadInput: String(row.cantidad ?? ''),
      costoTotalInput: row.costo_total != null ? String(row.costo_total) : '',
      motivo: row.motivo || ''
    })));
    setCostMode('MANUAL');
    setSavedInfo(actual);
  }, [actual, editId, isEdit]);

  const productsMap = useMemo(
    () => new Map((productos || []).map((product) => [String(product.id), product])),
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
  const parentUnit = normalizeUnit(parentProduct?.unidad_medida || parentProduct?.unidad || actual?.insumo?.unidad_medida || 'UND');
  const parentAvailableStockBase = useMemo(() => {
    if (parentProduct) return resolveProductStockBase(parentProduct);
    if (actual?.insumo?.stock_disponible_base_snapshot !== undefined && actual?.insumo?.stock_disponible_base_snapshot !== null) {
      return Number(actual.insumo.stock_disponible_base_snapshot || 0);
    }
    return 0;
  }, [actual?.insumo?.stock_disponible_base_snapshot, parentProduct]);
  const parentAvailableStock = useMemo(
    () => baseToVisible(parentAvailableStockBase, parentUnit),
    [parentAvailableStockBase, parentUnit]
  );
  const parentCurrentValueCents = parentProduct
    ? resolveProductValueCents(parentProduct)
    : (actual?.insumo?.subtotal_costo_centavos || 0);
  const parentCurrentUnitCost = parentProduct
    ? centsToUnitCost(parentCurrentValueCents, Math.max(parentAvailableStockBase, 1), parentUnit)
    : Number(actual?.insumo?.costo_unitario_snapshot || actual?.insumo?.costo_promedio_actual || 0);
  const isEditableDraft = !isEdit || actual?.estado === 'BORRADOR';

  const resolvedChildren = useMemo(
    () => children.map((row) => resolveRow(row, productsMap, parentUnit)),
    [children, parentUnit, productsMap]
  );
  const resolvedMermas = useMemo(
    () => mermas.map((row) => resolveRow(row, productsMap, parentUnit)),
    [mermas, parentUnit, productsMap]
  );

  const totalChildrenBase = resolvedChildren.reduce((acc, row) => acc + (row.cantidadBase || 0), 0);
  const totalMermaBase = resolvedMermas.reduce((acc, row) => acc + (row.cantidadBase || 0), 0);
  const totalConsumedBase = totalChildrenBase + totalMermaBase;
  const totalChildren = baseToVisible(totalChildrenBase, parentUnit);
  const totalMerma = baseToVisible(totalMermaBase, parentUnit);
  const totalConsumed = baseToVisible(totalConsumedBase, parentUnit);
  const remainingStockBase = parentAvailableStockBase - totalConsumedBase;
  const remainingStock = baseToVisible(Math.max(remainingStockBase, 0), parentUnit);
  const outgoingBaseForCost = Math.max(0, Math.min(totalConsumedBase, parentAvailableStockBase));
  const parentCostCents = useMemo(
    () => computeOutgoingValueCents(parentAvailableStockBase, parentCurrentValueCents, outgoingBaseForCost),
    [outgoingBaseForCost, parentAvailableStockBase, parentCurrentValueCents]
  );

  const distribution = useMemo(() => {
    const allRows = [
      ...resolvedChildren.map((row) => ({ ...row, kind: 'child' })),
      ...resolvedMermas.map((row) => ({ ...row, kind: 'merma' }))
    ];

    if (!allRows.length) {
      return {
        byId: new Map(),
        distributedCents: 0,
        diffCents: parentCostCents,
        costOk: parentCostCents === 0
      };
    }

    if (costMode === 'AUTOMATICA') {
      const allocated = allocateCentsProRata(parentCostCents, allRows, (row) => row.cantidadBase);
      return {
        byId: new Map(allocated.map((row) => [row.id, row.allocatedCents])),
        distributedCents: parentCostCents,
        diffCents: 0,
        costOk: true
      };
    }

    const byId = new Map(allRows.map((row) => [row.id, row.manualCents || 0]));
    const distributedCents = allRows.reduce((acc, row) => acc + (row.manualCents || 0), 0);
    return {
      byId,
      distributedCents,
      diffCents: parentCostCents - distributedCents,
      costOk: parentCostCents - distributedCents === 0
    };
  }, [costMode, parentCostCents, resolvedChildren, resolvedMermas]);

  const rowsWithCost = useMemo(() => ({
    children: resolvedChildren.map((row) => ({
      ...row,
      resolvedCents: distribution.byId.get(row.id) || 0,
      resolvedCost: centsToMoney(distribution.byId.get(row.id) || 0)
    })),
    mermas: resolvedMermas.map((row) => ({
      ...row,
      resolvedCents: distribution.byId.get(row.id) || 0,
      resolvedCost: centsToMoney(distribution.byId.get(row.id) || 0)
    }))
  }), [distribution.byId, resolvedChildren, resolvedMermas]);

  const baseCandidates = useMemo(() => {
    const q = baseSearch.trim().toLowerCase();
    return (productos || []).filter((product) => {
      if (!product.es_transformable) return false;
      if (baseStockFilter === 'CON_STOCK' && Number(resolveProductStockBase(product) || 0) <= 0) return false;
      if (!q) return true;
      return String(product.codigo || '').toLowerCase().includes(q)
        || String(product.nombre || '').toLowerCase().includes(q);
    });
  }, [baseSearch, baseStockFilter, productos]);

  const childCandidates = useMemo(() => {
    const q = childSearch.trim().toLowerCase();
    const usedIds = new Set(children.map((row) => String(row.producto_id)).filter(Boolean));

    return (productos || []).filter((product) => {
      if (String(product.id) === String(parent.producto_id)) return false;
      if (product.es_merma) return false;
      if (usedIds.has(String(product.id))) return false;
      if (parent.producto_id && !areUnitsCompatible(parentUnit, product.unidad_medida || product.unidad)) return false;

      if (childCategory !== 'ALL') {
        const productCategoryId = product.categoria_id ? String(product.categoria_id) : String(product.categoria_nombre || '');
        if (productCategoryId !== childCategory) return false;
      }

      if (!q) return true;
      return String(product.codigo || '').toLowerCase().includes(q)
        || String(product.nombre || '').toLowerCase().includes(q);
    });
  }, [childCategory, childSearch, children, parent.producto_id, parentUnit, productos]);

  const mermaOptions = useMemo(
    () => (productos || []).filter((product) => (
      product.es_merma
      && (!parent.producto_id || areUnitsCompatible(parentUnit, product.unidad_medida || product.unidad))
    )),
    [parent.producto_id, parentUnit, productos]
  );

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

  const quantityOk = totalConsumedBase > 0 && totalConsumedBase <= parentAvailableStockBase;

  function switchCostMode(nextMode) {
    if (nextMode === costMode) return;
    if (nextMode === 'MANUAL') {
      setChildren((current) => current.map((row) => ({
        ...row,
        costoTotalInput: row.costoTotalInput || String(centsToMoney(distribution.byId.get(row.id) || 0))
      })));
      setMermas((current) => current.map((row) => ({
        ...row,
        costoTotalInput: row.costoTotalInput || String(centsToMoney(distribution.byId.get(row.id) || 0))
      })));
    }
    setCostMode(nextMode);
  }

  function validateForm() {
    if (!parent.producto_id) return 'Selecciona un producto padre.';
    if (!parentProduct?.es_transformable) return 'El producto padre no es transformable.';
    if (!resolvedChildren.length) return 'Agrega al menos un producto hijo.';
    if (!resolvedMermas.length) return 'Agrega al menos una merma.';

    for (const row of resolvedChildren) {
      if (!row.producto_id || !row.product) return 'Selecciona un producto hijo válido.';
      if (String(row.producto_id) === String(parent.producto_id)) return 'El producto padre no puede registrarse como hijo.';
      if (row.product.es_merma) return 'Los productos marcados como merma no pueden registrarse como hijos.';
      if (!row.compatibleWithParent) return 'Los hijos deben usar una unidad compatible con el padre.';
      if (row.cantidadBase === null || row.cantidadBase <= 0) {
        return `La cantidad del hijo ${row.product.nombre || row.producto_id} es inválida.`;
      }
      if (costMode === 'MANUAL' && row.costoTotalInput && row.manualCents === null) {
        return `El costo del hijo ${row.product.nombre || row.producto_id} es inválido.`;
      }
    }

    for (const row of resolvedMermas) {
      if (!row.producto_id || !row.product) return 'Selecciona un producto de merma válido.';
      if (!row.product.es_merma) return 'El producto seleccionado para merma debe estar marcado como merma.';
      if (!row.compatibleWithParent) return 'La merma debe usar una unidad compatible con el padre.';
      if (row.cantidadBase === null || row.cantidadBase <= 0) return 'La merma debe ser mayor que 0.';
      if (!String(row.motivo || '').trim()) return 'El motivo de merma es obligatorio.';
      if (costMode === 'MANUAL' && row.costoTotalInput && row.manualCents === null) return 'El costo de merma es inválido.';
    }

    if (totalConsumedBase <= 0) return 'El total consumido debe ser mayor que 0.';
    if (totalConsumedBase > parentAvailableStockBase) {
      return `El total consumido no puede superar el stock disponible (${formatSummaryValue(parentAvailableStock, parentUnit)}).`;
    }
    if (!distribution.costOk) return 'La distribución de costo no cuadra.';
    return '';
  }

  function buildPayload() {
    const payloadChildren = rowsWithCost.children.map((row) => ({
      producto_id: Number(row.producto_id),
      cantidad: Number(row.cantidad),
      ...(costMode === 'MANUAL' ? { costo_total: row.resolvedCost } : {})
    }));
    const payloadMermas = rowsWithCost.mermas.map((row) => ({
      tipo_merma: 'MERMA',
      producto_id: Number(row.producto_id),
      cantidad: Number(row.cantidad),
      motivo: String(row.motivo || '').trim(),
      ...(costMode === 'MANUAL' ? { costo_total: row.resolvedCost } : {})
    }));
    const payload = {
      fecha: header.fecha ? new Date(`${header.fecha}T12:00:00`).toISOString() : undefined,
      tipo_proceso: header.tipo_proceso || 'DESPIECE',
      observacion: header.observacion || undefined,
      producto_padre_id: Number(parent.producto_id),
      hijos: payloadChildren,
      merma: payloadMermas,
      resultados: payloadChildren,
      mermas: payloadMermas
    };

    const canSendLegacyQty = [...rowsWithCost.children, ...rowsWithCost.mermas]
      .every((row) => normalizeUnit(row.unit) === parentUnit);
    if (canSendLegacyQty) {
      payload.cantidad_padre_consumida = Number(totalConsumed);
      payload.insumo = {
        producto_id: Number(parent.producto_id),
        cantidad: Number(totalConsumed)
      };
    } else {
      payload.insumo = {
        producto_id: Number(parent.producto_id)
      };
    }

    return payload;
  }

  function handleSelectBase(product) {
    setParent({ producto_id: String(product.id) });
    setChildren([]);
    setMermas([]);
    setCostMode('AUTOMATICA');
    setShowBaseModal(false);
  }

  function handleAddChild(product) {
    setChildren((current) => [...current, {
      id: createRowId('child'),
      producto_id: String(product.id),
      cantidadInput: defaultQtyInput(product.unidad_medida || product.unidad),
      costoTotalInput: ''
    }]);
    setShowChildModal(false);
  }

  function handleAddMerma() {
    setMermas((current) => [...current, {
      id: createRowId('merma'),
      producto_id: mermaOptions[0] ? String(mermaOptions[0].id) : '',
      cantidadInput: '',
      costoTotalInput: '',
      motivo: ''
    }]);
  }

  async function handleSave() {
    if (!isEditableDraft) return;
    setLocalError('');
    const validation = validateForm();
    if (validation) {
      setLocalError(validation);
      return;
    }

    try {
      const saved = isEdit ? await editar(editId, buildPayload()) : await crear(buildPayload());
      setSavedInfo(saved);
      if (!isEdit) navigate(`/transformaciones/${saved.id}/editar`);
    } catch (requestError) {
      setLocalError(requestError.message);
    }
  }

  async function handleOpenApply() {
    if (!isEditableDraft) return;
    setLocalError('');
    const validation = validateForm();
    if (validation) {
      setLocalError(validation);
      return;
    }

    if (!isEdit && !savedInfo?.id) {
      try {
        const saved = await crear(buildPayload());
        setSavedInfo(saved);
      } catch (requestError) {
        setLocalError(requestError.message);
        return;
      }
    }

    setShowApplyModal(true);
  }

  async function handleApply() {
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
    } catch (requestError) {
      setLocalError(requestError.message);
    }
  }

  async function handleDelete() {
    if (!isEdit || !actual || actual.estado !== 'BORRADOR') return;
    if (!window.confirm(`¿Eliminar borrador ${actual.numero}?`)) return;

    setLocalError('');
    try {
      await eliminar(editId);
      navigate('/transformaciones');
    } catch (requestError) {
      setLocalError(requestError.message);
    }
  }

  return (
    <div className="space-y-5">
      <BackButton to="/transformaciones">Volver a transformaciones</BackButton>

      <div className="space-y-1">
        <h1 className="text-[2rem] font-bold tracking-[-0.02em] text-[var(--color-text)]">
          {isEdit ? `Editar transformación ${actual?.numero || `#${editId}`}` : 'Nueva transformación'}
        </h1>
        <p className="text-base text-[var(--color-text-muted)]">
          Define hijos y merma. El sistema calcula el consumo del padre, el stock restante y el costo a distribuir.
        </p>
      </div>

      {(error || localError || catalogError) && (
        <Alert tone="error">
          {localError || catalogError || error}
        </Alert>
      )}

      <div className="space-y-5 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7 lg:p-8">
        <div className="space-y-4 border-b border-[var(--color-border)] pb-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Fecha</label>
              <Input
                type="date"
                value={header.fecha}
                onChange={(e) => setHeader((current) => ({ ...current, fecha: e.target.value }))}
                disabled={!isEditableDraft}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Tipo proceso</label>
              <Input value={header.tipo_proceso} readOnly disabled />
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Observación</label>
              <Textarea
                rows={3}
                value={header.observacion}
                onChange={(e) => setHeader((current) => ({ ...current, observacion: e.target.value }))}
                disabled={!isEditableDraft}
                placeholder="Observación operativa"
              />
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-background p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">Padre</h3>
              <p className="mt-1 text-sm text-text-muted">Selecciona un producto transformable y revisa su stock y costo actual.</p>
            </div>
            <Button type="button" variant="ghost" onClick={() => setShowBaseModal(true)} disabled={!isEditableDraft}>
              Buscar padre
            </Button>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Producto padre</label>
              <Input
                readOnly
                value={parentProduct ? `${parentProduct.codigo || `#${parentProduct.id}`} - ${parentProduct.nombre}` : ''}
                placeholder="Selecciona un producto transformable"
                onClick={() => setShowBaseModal(true)}
                disabled={!isEditableDraft}
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Unidad</p>
              <p className="mt-2 text-lg font-semibold text-text">{parentUnit}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Stock disponible actual</p>
              <p className="mt-2 text-lg font-semibold text-text">{formatSummaryValue(parentAvailableStock, parentUnit)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Costo visible actual</p>
              <p className="mt-2 text-lg font-semibold text-text">{formatMoney(parentCurrentUnitCost)}</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-text">Resultados (Hijos)</h3>
              <p className="text-sm text-text-muted">Agrega los productos hijo que saldrán del proceso.</p>
            </div>
            <Button onClick={() => setShowChildModal(true)} disabled={!isEditableDraft || !parent.producto_id}>
              Agregar hijo
            </Button>
          </div>

          <div className="px-5 py-5">
            <div className="overflow-hidden rounded-2xl border border-border bg-white">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Producto</TableCell>
                    <TableCell>Cantidad</TableCell>
                    <TableCell>Costo total</TableCell>
                    <TableCell>Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rowsWithCost.children.length ? rowsWithCost.children.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="font-semibold text-text">{row.product?.nombre || 'Sin producto'}</p>
                          <p className="text-xs text-text-muted">{`${row.product?.codigo || '-'} | ${row.unit}`}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-36">
                          <Input
                            value={row.cantidadInput}
                            onChange={(e) => setChildren((current) => current.map((item) => (
                              item.id === row.id
                                ? { ...item, cantidadInput: sanitizeQtyInput(e.target.value, row.unit) }
                                : item
                            )))}
                            disabled={!isEditableDraft}
                            placeholder={row.unit === 'UND' ? '0' : '0.000'}
                          />
                        </div>
                        <p className="mt-1 text-xs text-text-muted">{row.unit === 'UND' ? 'UND entero' : `Unidad ${row.unit}`}</p>
                      </TableCell>
                      <TableCell>
                        <div className="w-36">
                          <Input
                            value={costMode === 'AUTOMATICA' ? String(row.resolvedCost.toFixed(2)) : (row.costoTotalInput || '')}
                            onChange={(e) => setChildren((current) => current.map((item) => (
                              item.id === row.id
                                ? { ...item, costoTotalInput: parseMoneyInput(e.target.value) }
                                : item
                            )))}
                            disabled={!isEditableDraft || costMode === 'AUTOMATICA'}
                            placeholder="0.00"
                          />
                        </div>
                        <p className="mt-1 text-xs text-text-muted">
                          {costMode === 'AUTOMATICA' ? 'Calculado por el sistema' : 'Editable en modo manual'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setChildren((current) => current.filter((item) => item.id !== row.id))}
                          disabled={!isEditableDraft}
                        >
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell className="py-6 text-text-muted" colSpan={4}>
                        No has agregado productos hijo.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-text">Merma</h3>
              <p className="text-sm text-text-muted">Registra la merma obligatoria del proceso.</p>
            </div>
            <Button variant="secondary" onClick={handleAddMerma} disabled={!isEditableDraft || !parent.producto_id}>
              Agregar merma
            </Button>
          </div>

          <div className="px-5 py-5">
            <div className="overflow-hidden rounded-2xl border border-border bg-white">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Producto merma</TableCell>
                    <TableCell>Cantidad</TableCell>
                    <TableCell>Costo total</TableCell>
                    <TableCell>Motivo</TableCell>
                    <TableCell>Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rowsWithCost.mermas.length ? rowsWithCost.mermas.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Select
                          value={row.producto_id}
                          onChange={(e) => setMermas((current) => current.map((item) => (
                            item.id === row.id
                              ? { ...item, producto_id: e.target.value }
                              : item
                          )))}
                          disabled={!isEditableDraft}
                        >
                          <option value="">Seleccionar producto</option>
                          {mermaOptions.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.codigo} - {product.nombre}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="w-36">
                          <Input
                            value={row.cantidadInput}
                            onChange={(e) => setMermas((current) => current.map((item) => (
                              item.id === row.id
                                ? { ...item, cantidadInput: sanitizeQtyInput(e.target.value, row.unit) }
                                : item
                            )))}
                            disabled={!isEditableDraft}
                            placeholder={row.unit === 'UND' ? '0' : '0.000'}
                          />
                        </div>
                        <p className="mt-1 text-xs text-text-muted">{row.unit === 'UND' ? 'UND entero' : `Unidad ${row.unit}`}</p>
                      </TableCell>
                      <TableCell>
                        <div className="w-36">
                          <Input
                            value={costMode === 'AUTOMATICA' ? String(row.resolvedCost.toFixed(2)) : (row.costoTotalInput || '')}
                            onChange={(e) => setMermas((current) => current.map((item) => (
                              item.id === row.id
                                ? { ...item, costoTotalInput: parseMoneyInput(e.target.value) }
                                : item
                            )))}
                            disabled={!isEditableDraft || costMode === 'AUTOMATICA'}
                            placeholder="0.00"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.motivo || ''}
                          onChange={(e) => setMermas((current) => current.map((item) => (
                            item.id === row.id
                              ? { ...item, motivo: e.target.value }
                              : item
                          )))}
                          disabled={!isEditableDraft}
                          placeholder="Motivo de merma"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setMermas((current) => current.filter((item) => item.id !== row.id))}
                          disabled={!isEditableDraft}
                        >
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell className="py-6 text-text-muted" colSpan={5}>
                        No has agregado merma. Debe existir al menos una merma mayor que 0.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-background p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">Distribución de costo</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              variant={costMode === 'AUTOMATICA' ? 'primary' : 'secondary'}
              onClick={() => switchCostMode('AUTOMATICA')}
              disabled={!isEditableDraft}
            >
              Automática
            </Button>
            <Button
              type="button"
              variant={costMode === 'MANUAL' ? 'primary' : 'secondary'}
              onClick={() => switchCostMode('MANUAL')}
              disabled={!isEditableDraft}
            >
              Manual
            </Button>
          </div>
          <p className="mt-3 text-sm text-text-muted">
            {costMode === 'AUTOMATICA'
              ? 'El sistema distribuye el costo total del padre consumido en función de las cantidades registradas.'
              : 'Puedes editar costos manualmente, pero la suma exacta debe coincidir con el costo total del padre consumido.'}
          </p>
        </div>

        <div className="rounded-[24px] border border-border bg-background p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">Resumen dinámico</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-border bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Total hijos</span>
                <strong className="text-text">{formatSummaryValue(totalChildren, parentUnit)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Total merma</span>
                <strong className="text-text">{formatSummaryValue(totalMerma, parentUnit)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Total consumido</span>
                <strong className="text-text">{formatSummaryValue(totalConsumed, parentUnit)}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Stock restante estimado</span>
                <strong className={remainingStockBase < 0 ? 'text-danger' : 'text-text'}>
                  {formatSummaryValue(remainingStock, parentUnit)}
                </strong>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Costo padre consumido</span>
                <strong className="text-text">{formatMoney(centsToMoney(parentCostCents))}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Costo distribuido</span>
                <strong className="text-text">{formatMoney(centsToMoney(distribution.distributedCents))}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Diferencia de costo</span>
                <strong className={distribution.costOk ? 'text-success' : 'text-danger'}>
                  {formatMoney(centsToMoney(distribution.diffCents))}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Cantidad OK</span>
                <strong className={quantityOk ? 'text-success' : 'text-danger'}>
                  {quantityOk ? 'OK' : 'Revisar'}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Costo OK</span>
                <strong className={distribution.costOk ? 'text-success' : 'text-danger'}>
                  {distribution.costOk ? 'OK' : 'Revisar'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <div className="flex items-center gap-3">
            {isEdit && actual?.estado === 'BORRADOR' && (
              <Button variant="danger" onClick={handleDelete} disabled={saving}>
                Eliminar borrador
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => navigate('/transformaciones')} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={handleSave} disabled={saving || loading || !isEditableDraft}>
              {saving ? 'Guardando...' : 'Guardar borrador'}
            </Button>
            <Button onClick={handleOpenApply} disabled={saving || loading || !isEditableDraft}>
              Aplicar transformación
            </Button>
          </div>
        </div>
      </div>

      <ProductSearchModal
        open={showBaseModal}
        title="Seleccionar producto padre"
        search={baseSearch}
        onSearchChange={setBaseSearch}
        filters={(
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Stock</label>
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
        getStockLabel={(row) => formatQtyByUnit(baseToVisible(resolveProductStockBase(row), row.unidad_medida || row.unidad), row.unidad_medida || row.unidad, { fixedWeight: true })}
      />

      <ProductSearchModal
        open={showChildModal}
        title="Agregar producto hijo"
        search={childSearch}
        onSearchChange={setChildSearch}
        filters={(
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Categoría</label>
            <Select value={childCategory} onChange={(e) => setChildCategory(e.target.value)}>
              <option value="ALL">Todas</option>
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
        getStockLabel={(row) => formatQtyByUnit(baseToVisible(resolveProductStockBase(row), row.unidad_medida || row.unidad), row.unidad_medida || row.unidad, { fixedWeight: true })}
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
        parentUnit={parentUnit}
        totalConsumido={totalConsumed}
        remainingQty={remainingStock}
        mermaQty={totalMerma}
      />
    </div>
  );
}
