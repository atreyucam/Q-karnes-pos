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
import { getTransformacionStatusHelp, getTransformacionStatusLabel } from './transformacionesUi';

const MODAL_PAGE_SIZE = 10;
const WEIGHT_UNITS = new Set(['KG', 'LB']);
const UNIT_TO_BASE_PER_MILLI = { KG: 100_000_000, LB: 45_359_237 };
const UNIT_TO_BASE_PER_UNIT = { KG: 100_000_000_000, LB: 45_359_237_000 };
const WIZARD_STEPS = [
  { id: 1, label: '1 Padre', title: 'Padre' },
  { id: 2, label: '2 Resultados', title: 'Resultados' },
  { id: 3, label: '3 Merma', title: 'Merma' },
  { id: 4, label: '4 Distribución de costo', title: 'Distribución de costo' },
  { id: 5, label: '5 Confirmar', title: 'Confirmar' }
];

function nowLocalDateInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function toDateInputValue(value) {
  if (value === null || value === undefined || value === '') return '';

  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  let date;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    const millis = numeric < 1e12 ? numeric * 1000 : numeric;
    date = new Date(millis);
  } else {
    date = new Date(raw);
  }

  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  return normalizedParent === normalizedRow || (isWeightUnit(normalizedParent) && isWeightUnit(normalizedRow));
}

function parseScaledInteger(value, scale) {
  const normalizedRaw = String(value ?? '').trim().replace(',', '.');
  if (!normalizedRaw) return null;
  const unsigned = normalizedRaw.replace(/^[+-]/, '');
  if (!/^\d+(\.\d+)?$/.test(unsigned)) return null;
  const sign = normalizedRaw.startsWith('-') ? -1 : 1;
  const [wholePartRaw, fractionRaw = ''] = unsigned.split('.');
  if (fractionRaw.length > scale) return null;
  const wholePart = Number(wholePartRaw || '0');
  const fractionPart = Number(scale > 0 ? fractionRaw.padEnd(scale, '0') : '0');
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
  if (normalizeUnit(unit) === 'UND') return Number((Number(cents || 0) / 100 / quantityBase).toFixed(6));
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
  if (!normalizedRaw || !/^\d+(\.\d+)?$/.test(normalizedRaw)) return null;
  const [wholePartRaw, fractionRaw = ''] = normalizedRaw.split('.');
  const wholePart = Number(wholePartRaw || '0');
  if (!Number.isSafeInteger(wholePart)) return null;
  const centsDigits = (fractionRaw + '00').slice(0, 2);
  const roundingDigit = Number((fractionRaw + '000').charAt(2) || '0');
  let cents = Number(centsDigits || '0');
  let carry = 0;
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
  if (product.stock_actual_base !== undefined && product.stock_actual_base !== null) return Number(product.stock_actual_base || 0);
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
  if (totalWeight <= 0) return rows.map((row, index) => ({ ...row, allocatedCents: index === 0 ? total : 0 }));
  const provisional = rows.map((row, index) => {
    const raw = total * weights[index];
    return { ...row, allocatedCents: Math.floor(raw / totalWeight), __remainder: raw % totalWeight, __index: index };
  });
  let pending = total - provisional.reduce((acc, row) => acc + row.allocatedCents, 0);
  provisional.sort((a, b) => (b.__remainder - a.__remainder) || (a.__index - b.__index)).forEach((row) => {
    if (pending > 0) {
      row.allocatedCents += 1;
      pending -= 1;
    }
  });
  return provisional.sort((a, b) => a.__index - b.__index).map(({ __remainder, __index, ...row }) => row);
}

function defaultQtyInput(unit) {
  return normalizeUnit(unit) === 'UND' ? '1' : '1.000';
}

function formatSummaryValue(value, unit) {
  return `${formatQtyByUnit(value, unit, { fixedWeight: true })} ${normalizeUnit(unit)}`;
}

function resolveRow(row, productsMap, parentUnit) {
  const product = row.producto_id ? productsMap.get(String(row.producto_id)) : null;
  const unit = normalizeUnit(row.forceUnit || product?.unidad_medida || product?.unidad || parentUnit || 'UND');
  const cantidadBase = quantityToBase(row.cantidadInput, unit);
  return {
    ...row,
    product,
    unit,
    cantidad: cantidadBase === null ? null : baseToVisible(cantidadBase, unit),
    cantidadBase,
    manualCents: row.costoTotalInput ? moneyToCents(row.costoTotalInput) : null,
    compatibleWithParent: parentUnit ? areUnitsCompatible(parentUnit, unit) : true
  };
}

function FieldCallout({ message }) {
  if (!message) return null;
  return (
    <div className="relative mt-2 inline-flex max-w-full rounded-2xl border border-danger/25 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
      <span className="absolute -top-1.5 left-4 h-3 w-3 rotate-45 border-l border-t border-danger/25 bg-danger-soft" />
      <span className="relative">{message}</span>
    </div>
  );
}

function SecondarySlot({ children }) {
  return <div className="min-h-[3.25rem] pt-2 text-xs">{children}</div>;
}

function ProductSearchModal({ open, title, search, onSearchChange, filters, rows, page, totalPages, totalRecords, onPageChange, onClose, onSelect, getStockLabel, getCutTypeLabel = null }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-5xl" panelClassName="p-0">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text">{title}</h3>
            <p className="text-sm text-text-muted">Busca y selecciona un producto activo.</p>
          </div>
          <button type="button" aria-label="Cerrar modal" className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-xl leading-none text-text-muted transition hover:border-primary hover:text-text" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Buscar</label>
            <Input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Código o nombre" />
          </div>
          {filters}
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-white">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Producto</TableCell>
                {getCutTypeLabel && <TableCell>Tipo Corte</TableCell>}
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
                  {getCutTypeLabel && <TableCell>{getCutTypeLabel(row)}</TableCell>}
                  <TableCell>{normalizeUnit(row.unidad_medida || row.unidad)}</TableCell>
                  <TableCell>{getStockLabel(row)}</TableCell>
                  <TableCell><Button size="sm" onClick={() => onSelect(row)}>Seleccionar</Button></TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell className="py-6 text-text-muted" colSpan={getCutTypeLabel ? 5 : 4}>No hay productos disponibles con esos filtros.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <Paginador paginaActual={page} totalPaginas={totalPages} totalRegistros={totalRecords} onPageChange={onPageChange} />
      </div>
    </Modal>
  );
}

function WizardStepper({ currentStep, onStepChange, canReachStep, invalidSteps = [] }) {
  return (
    <div className="sticky top-0 z-10 rounded-[24px] border border-border bg-white/95 p-3 shadow-sm backdrop-blur">
      <div className="grid gap-2 md:grid-cols-5">
        {WIZARD_STEPS.map((step) => {
          const active = step.id === currentStep;
          const enabled = canReachStep(step.id);
          const completed = step.id < currentStep;
          const invalid = invalidSteps.includes(step.id);
          const displayLabel = invalid ? '⚠ Resultados' : step.label;
          const displayTitle = invalid ? 'Corrige el exceso' : step.title;
          const classes = active
            ? 'border-primary bg-primary text-white'
            : completed
              ? 'border-success bg-success-soft text-success'
              : 'border-border bg-background text-text';
          const resolvedClasses = invalid && !active
            ? 'border-danger bg-danger-soft text-danger'
            : classes;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => enabled && onStepChange(step.id)}
              disabled={!enabled}
              className={`rounded-2xl border px-4 py-3 text-left transition ${resolvedClasses} ${!enabled ? 'cursor-not-allowed opacity-60' : 'hover:border-primary'}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">{displayLabel}</p>
              <p className="mt-1 text-sm font-medium">{displayTitle}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryPanel({ parentProduct, parentUnit, parentAvailableStock, totalChildren, totalMerma, totalConsumed, remainingStock, remainingStockBase, parentCostCents, distribution, currentStep }) {
  return (
    <div className="space-y-4 lg:sticky lg:top-28">
      <div className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">Resumen dinámico</h3>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-text-muted">Disponible inicial</span><strong className="text-text">{formatSummaryValue(parentAvailableStock, parentUnit)}</strong></div>
          <div className="flex items-center justify-between"><span className="text-text-muted">Total hijos</span><strong className="text-text">{formatSummaryValue(totalChildren, parentUnit)}</strong></div>
          <div className="flex items-center justify-between"><span className="text-text-muted">Total merma</span><strong className="text-text">{formatSummaryValue(totalMerma, parentUnit)}</strong></div>
          <div className="flex items-center justify-between"><span className="text-text-muted">Consumido total</span><strong className="text-text">{formatSummaryValue(totalConsumed, parentUnit)}</strong></div>
          <div className="flex items-center justify-between"><span className="text-text-muted">Saldo sin transformar</span><strong className={remainingStockBase < 0 ? 'text-danger' : 'text-success'}>{formatSummaryValue(Math.max(remainingStock, 0), parentUnit)}</strong></div>
          {remainingStockBase === 0 && currentStep !== 1 && <div className="rounded-2xl border border-success bg-success-soft px-3 py-2 text-center text-sm font-semibold text-success">✅ Consumo completo del padre</div>}
          <div className="flex items-center justify-between"><span className="text-text-muted">Estado de balance</span><strong className={remainingStockBase < 0 ? 'text-danger' : 'text-success'}>{remainingStockBase < 0 ? 'Excede disponible' : 'Dentro del disponible'}</strong></div>
        </div>
      </div>
      <div className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">Costo consumido</h3>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-text-muted">Padre</span><strong className="text-text">{parentProduct?.nombre || 'Sin seleccionar'}</strong></div>
          <div className="flex items-center justify-between"><span className="text-text-muted">Costo total consumido</span><strong className="text-text">{formatMoney(centsToMoney(parentCostCents))}</strong></div>
          <div className="flex items-center justify-between"><span className="text-text-muted">Costo distribuido</span><strong className="text-text">{formatMoney(centsToMoney(distribution.distributedCents))}</strong></div>
          <div className="flex items-center justify-between"><span className="text-text-muted">Costo OK</span><strong className={distribution.costOk ? 'text-success' : 'text-danger'}>{distribution.costOk ? 'OK' : 'Revisar'}</strong></div>
        </div>
      </div>
      {(currentStep === 2 || currentStep === 3) && remainingStockBase > 0 && (
        <div className="rounded-[24px] border border-warning bg-warning-soft p-5 text-sm text-warning shadow-sm">
          <p className="font-semibold">Nota operativa</p>
          <p className="mt-2">El material restante no se pierde. Quedará disponible para una futura transformación.</p>
        </div>
      )}
    </div>
  );
}

function ApplyConfirmModal({ open, auth, setAuth, onClose, onConfirm, loading, needsAuth, parentName, parentUnit, initialQty, totalConsumido, remainingQty, mermaQty }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-2xl" panelClassName="p-0">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-text">Confirmar aplicación</h3>
            <p className="text-sm text-text-muted">Esta transformación ya está completa y lista para aplicar. Al confirmar se registrarán movimientos reales de inventario y costo.</p>
          </div>
          <button type="button" aria-label="Cerrar modal" className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-xl leading-none text-text-muted transition hover:border-primary hover:text-text" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="space-y-4 px-6 py-5">
        <div className="rounded-2xl border border-border bg-background p-4 text-sm text-text-muted">
          <p>{`Producto padre: "${parentName}"`}</p>
          <p className="mt-2">{`Disponible inicial: ${formatQtyByUnit(initialQty, parentUnit, { fixedWeight: true })} ${parentUnit}.`}</p>
          <p className="mt-2">{`Consumido total: ${formatQtyByUnit(totalConsumido, parentUnit, { fixedWeight: true })} ${parentUnit}.`}</p>
          <p className="mt-2">{`Merma registrada: ${formatQtyByUnit(mermaQty, parentUnit, { fixedWeight: true })} ${parentUnit}.`}</p>
          <p className="mt-2">{`Disponible final: ${formatQtyByUnit(Math.max(remainingQty, 0), parentUnit, { fixedWeight: true })} ${parentUnit}.`}</p>
        </div>
        {needsAuth && (
          <div className="rounded-2xl border border-warning bg-warning-soft px-4 py-3">
            <p className="text-sm font-semibold text-warning">Autorización ADMIN</p>
            <p className="mt-1 text-sm text-warning">Ingresa credenciales de administrador para aplicar la transformación.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Input value={auth.usuario} onChange={(e) => setAuth((current) => ({ ...current, usuario: e.target.value }))} placeholder="Usuario admin" />
              <Input type="password" value={auth.password} onChange={(e) => setAuth((current) => ({ ...current, password: e.target.value }))} placeholder="Clave admin" />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={onConfirm} disabled={loading}>{loading ? 'Aplicando...' : 'Confirmar y aplicar'}</Button>
        </div>
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
  const [currentStep, setCurrentStep] = useState(1);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showBaseModal, setShowBaseModal] = useState(false);
  const [showChildModal, setShowChildModal] = useState(false);
  const [auth, setAuth] = useState({ usuario: '', password: '' });
  const [header, setHeader] = useState({ fecha: nowLocalDateInput(), tipo_proceso: 'DESPIECE', referencia_lote: '', observacion: '' });
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
      .catch((requestError) => setCatalogError(requestError.message || 'No se pudo cargar el catálogo'));
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
      fecha: toDateInputValue(actual.fecha) || nowLocalDateInput(),
      tipo_proceso: actual.tipo_proceso || 'DESPIECE',
      referencia_lote: actual.referencia_lote || '',
      observacion: actual.observacion || ''
    });
    setParent({ producto_id: String(actual.insumo?.producto_id || '') });
    setChildren((actual.resultados || []).map((row) => ({ id: createRowId('child'), producto_id: String(row.producto_id), cantidadInput: String(row.cantidad ?? ''), costoTotalInput: row.costo_asignado != null ? String(row.costo_asignado) : '' })));
    setMermas((actual.mermas || []).map((row) => ({ id: createRowId('merma'), tipoMerma: row.tipo_merma || '', cantidadInput: String(row.cantidad ?? ''), costoTotalInput: row.costo_total != null ? String(row.costo_total) : '', motivo: row.motivo || '' })));
    setCostMode(actual.distribucion_costo?.modo || actual.modo_distribucion_costo || 'AUTOMATICA');
    setSavedInfo(actual);
    setCurrentStep(1);
  }, [actual, editId, isEdit]);

  const productsMap = useMemo(() => new Map((productos || []).map((product) => [String(product.id), product])), [productos]);
  const categoryOptions = useMemo(() => {
    if (categorias.length) return categorias.map((category) => ({ value: String(category.id), label: category.nombre }));
    const seen = new Map();
    for (const product of productos) {
      const key = product.categoria_id ? String(product.categoria_id) : String(product.categoria_nombre || '');
      if (!key || seen.has(key)) continue;
      seen.set(key, { value: key, label: product.categoria_nombre || 'Sin categoría' });
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
  const parentAvailableStock = useMemo(() => baseToVisible(parentAvailableStockBase, parentUnit), [parentAvailableStockBase, parentUnit]);
  const parentCurrentValueCents = parentProduct
    ? resolveProductValueCents(parentProduct)
    : (actual?.insumo?.stock_disponible_base_snapshot ? actual?.insumo?.subtotal_costo_centavos : 0);
  const parentCurrentUnitCost = parentProduct
    ? centsToUnitCost(parentCurrentValueCents, Math.max(parentAvailableStockBase, 1), parentUnit)
    : Number(actual?.insumo?.costo_unitario_snapshot || actual?.insumo?.costo_promedio_actual || 0);
  const isEditableDraft = !isEdit || actual?.estado === 'BORRADOR';

  const resolvedChildren = useMemo(() => children.map((row) => resolveRow(row, productsMap, parentUnit)), [children, parentUnit, productsMap]);
  const resolvedMermas = useMemo(() => mermas.map((row) => resolveRow({ ...row, forceUnit: parentUnit }, productsMap, parentUnit)), [mermas, parentUnit, productsMap]);
  const totalChildrenBase = resolvedChildren.reduce((acc, row) => acc + (row.cantidadBase || 0), 0);
  const totalMermaBase = resolvedMermas.reduce((acc, row) => acc + (row.cantidadBase || 0), 0);
  const totalConsumedBase = totalChildrenBase + totalMermaBase;
  const totalChildren = baseToVisible(totalChildrenBase, parentUnit);
  const totalMerma = baseToVisible(totalMermaBase, parentUnit);
  const totalConsumed = baseToVisible(totalConsumedBase, parentUnit);
  const remainingStockBase = parentAvailableStockBase - totalConsumedBase;
  const remainingStock = baseToVisible(remainingStockBase, parentUnit);
  const outgoingBaseForCost = Math.max(0, Math.min(totalConsumedBase, parentAvailableStockBase));
  const parentCostCents = useMemo(() => computeOutgoingValueCents(parentAvailableStockBase, parentCurrentValueCents, outgoingBaseForCost), [outgoingBaseForCost, parentAvailableStockBase, parentCurrentValueCents]);

  const distribution = useMemo(() => {
    const allRows = [
      ...resolvedChildren.map((row) => ({ ...row, kind: 'child' })),
      ...resolvedMermas.map((row) => ({ ...row, kind: 'merma' }))
    ];
    if (!allRows.length) return { byId: new Map(), distributedCents: 0, diffCents: parentCostCents, costOk: parentCostCents === 0 };
    if (costMode === 'AUTOMATICA') {
      const allocated = allocateCentsProRata(parentCostCents, allRows, (row) => row.cantidadBase);
      return { byId: new Map(allocated.map((row) => [row.id, row.allocatedCents])), distributedCents: parentCostCents, diffCents: 0, costOk: true };
    }
    const byId = new Map(allRows.map((row) => [row.id, row.manualCents || 0]));
    const distributedCents = allRows.reduce((acc, row) => acc + (row.manualCents || 0), 0);
    return { byId, distributedCents, diffCents: parentCostCents - distributedCents, costOk: parentCostCents - distributedCents === 0 };
  }, [costMode, parentCostCents, resolvedChildren, resolvedMermas]);

  const rowsWithCost = useMemo(() => ({
    children: resolvedChildren.map((row) => ({ ...row, resolvedCents: distribution.byId.get(row.id) || 0, resolvedCost: centsToMoney(distribution.byId.get(row.id) || 0) })),
    mermas: resolvedMermas.map((row) => ({ ...row, resolvedCents: distribution.byId.get(row.id) || 0, resolvedCost: centsToMoney(distribution.byId.get(row.id) || 0) }))
  }), [distribution.byId, resolvedChildren, resolvedMermas]);

  const baseCandidates = useMemo(() => {
    const q = baseSearch.trim().toLowerCase();
    return (productos || []).filter((product) => {
      if (!product.es_transformable) return false;
      if (baseStockFilter === 'CON_STOCK' && Number(resolveProductStockBase(product) || 0) <= 0) return false;
      return !q || String(product.codigo || '').toLowerCase().includes(q) || String(product.nombre || '').toLowerCase().includes(q);
    });
  }, [baseSearch, baseStockFilter, productos]);

  const childCandidates = useMemo(() => {
    const q = childSearch.trim().toLowerCase();
    const usedIds = new Set(children.map((row) => String(row.producto_id)).filter(Boolean));
    return (productos || []).filter((product) => {
      if (String(product.id) === String(parent.producto_id) || product.es_merma || usedIds.has(String(product.id))) return false;
      if (parent.producto_id && !areUnitsCompatible(parentUnit, product.unidad_medida || product.unidad)) return false;
      if (childCategory !== 'ALL') {
        const productCategoryId = product.categoria_id ? String(product.categoria_id) : String(product.categoria_nombre || '');
        if (productCategoryId !== childCategory) return false;
      }
      return !q || String(product.codigo || '').toLowerCase().includes(q) || String(product.nombre || '').toLowerCase().includes(q);
    });
  }, [childCategory, childSearch, children, parent.producto_id, parentUnit, productos]);

  const baseTotalPages = Math.max(1, Math.ceil(baseCandidates.length / MODAL_PAGE_SIZE));
  const childTotalPages = Math.max(1, Math.ceil(childCandidates.length / MODAL_PAGE_SIZE));
  const pagedBaseRows = baseCandidates.slice((basePage - 1) * MODAL_PAGE_SIZE, basePage * MODAL_PAGE_SIZE);
  const pagedChildRows = childCandidates.slice((childPage - 1) * MODAL_PAGE_SIZE, childPage * MODAL_PAGE_SIZE);

  useEffect(() => setBasePage(1), [baseSearch, baseStockFilter]);
  useEffect(() => setChildPage(1), [childCategory, childSearch]);

  function switchCostMode(nextMode) {
    if (nextMode === costMode) return;
    if (nextMode === 'MANUAL') {
      setChildren((current) => current.map((row) => ({ ...row, costoTotalInput: row.costoTotalInput || String(centsToMoney(distribution.byId.get(row.id) || 0)) })));
      setMermas((current) => current.map((row) => ({ ...row, costoTotalInput: row.costoTotalInput || String(centsToMoney(distribution.byId.get(row.id) || 0)) })));
    }
    setCostMode(nextMode);
  }

  const childValidationErrors = useMemo(() => resolvedChildren.map((row) => {
    if (!row.producto_id || !row.product) return { field: 'producto', message: 'Selecciona un producto hijo válido.' };
    if (String(row.producto_id) === String(parent.producto_id)) return { field: 'producto', message: 'El producto padre no puede registrarse como hijo.' };
    if (row.product.es_merma) return { field: 'producto', message: 'Los productos marcados como merma no pueden registrarse como hijos.' };
    if (!row.compatibleWithParent) return { field: 'producto', message: 'Los hijos deben usar una unidad compatible con el padre.' };
    if (row.cantidadBase === null || row.cantidadBase <= 0) return { field: 'cantidad', message: `La cantidad del hijo ${row.product.nombre || row.producto_id} es inválida.` };
    if (costMode === 'MANUAL' && row.costoTotalInput && row.manualCents === null) return { field: 'cantidad', message: `El costo del hijo ${row.product.nombre || row.producto_id} es inválido.` };
    return null;
  }), [costMode, parent.producto_id, resolvedChildren]);

  const mermaValidationErrors = useMemo(() => resolvedMermas.map((row) => {
    if (!String(row.tipoMerma || '').trim()) return { field: 'tipoMerma', message: 'El tipo de merma es obligatorio.' };
    if (row.cantidadBase === null || row.cantidadBase <= 0) return { field: 'cantidad', message: 'La merma debe ser mayor que 0.' };
    if (!String(row.motivo || '').trim()) return { field: 'motivo', message: 'El motivo de merma es obligatorio.' };
    if (costMode === 'MANUAL' && row.costoTotalInput && row.manualCents === null) return { field: 'cantidad', message: 'El costo de merma es inválido.' };
    return null;
  }), [costMode, resolvedMermas]);

  function validateStep(step) {
    if (!parent.producto_id) return 'Selecciona un producto padre.';
    if (!parentProduct?.es_transformable) return 'El producto padre no es transformable.';
    if (step >= 2) {
      if (!resolvedChildren.length) return 'Agrega al menos un producto hijo para continuar.';
      const childError = childValidationErrors.find(Boolean);
      if (childError) return childError.message;
      if (totalChildrenBase > parentAvailableStockBase) return `Los resultados exceden el disponible para transformar (${formatSummaryValue(parentAvailableStock, parentUnit)}).`;
    }
    if (step >= 3) {
      if (!resolvedMermas.length) return 'Agrega al menos una merma para continuar.';
      const mermaError = mermaValidationErrors.find(Boolean);
      if (mermaError) return mermaError.message;
      if (totalConsumedBase <= 0) return 'El consumido total debe ser mayor que 0.';
      if (totalConsumedBase > parentAvailableStockBase) return `El consumido total no puede superar el disponible para transformar (${formatSummaryValue(parentAvailableStock, parentUnit)}).`;
    }
    if (step >= 4 && !distribution.costOk) return 'La distribución de costo no cuadra.';
    return '';
  }

  function validateCompleteTransformation() {
    return validateStep(4);
  }

  function canReachStep(step) {
    return step === 1 || !validateStep(step - 1);
  }

  function buildPayload() {
    const payloadChildren = rowsWithCost.children.map((row) => ({ producto_id: Number(row.producto_id), cantidad: Number(row.cantidad), ...(costMode === 'MANUAL' ? { costo_total: row.resolvedCost } : {}) }));
    const payloadMermas = rowsWithCost.mermas.map((row) => ({ tipo_merma: String(row.tipoMerma || '').trim(), cantidad: Number(row.cantidad), motivo: String(row.motivo || '').trim(), ...(costMode === 'MANUAL' ? { costo_total: row.resolvedCost } : {}) }));
    return {
      fecha: header.fecha ? new Date(`${header.fecha}T12:00:00`).toISOString() : undefined,
      tipo_proceso: header.tipo_proceso || 'DESPIECE',
      referencia_lote: header.referencia_lote?.trim() || undefined,
      observacion: header.observacion || undefined,
      modo_distribucion_costo: costMode,
      insumo: { producto_id: Number(parent.producto_id) },
      resultados: payloadChildren,
      mermas: payloadMermas
    };
  }

  async function saveCurrentDraft() {
    const validation = validateCompleteTransformation();
    if (validation) throw new Error(validation);
    const saved = isEdit ? await editar(editId, buildPayload()) : await crear(buildPayload());
    setSavedInfo(saved);
    return saved;
  }

  function handleSelectBase(product) {
    setParent({ producto_id: String(product.id) });
    setChildren([]);
    setMermas([]);
    setCostMode('AUTOMATICA');
    setSavedInfo(null);
    setShowBaseModal(false);
  }

  function handleAddChild(product) {
    setChildren((current) => [...current, { id: createRowId('child'), producto_id: String(product.id), cantidadInput: defaultQtyInput(product.unidad_medida || product.unidad), costoTotalInput: '' }]);
    setShowChildModal(false);
  }

  function handleAddMerma() {
    setMermas((current) => [...current, { id: createRowId('merma'), tipoMerma: '', cantidadInput: '', costoTotalInput: '', motivo: '' }]);
  }

  function handleStepChange(nextStep) {
    if (nextStep <= currentStep) {
      setCurrentStep(nextStep);
      setLocalError('');
      return;
    }
    const validation = validateStep(nextStep - 1);
    if (validation) {
      const inlineHandled = currentStep === 2 || currentStep === 3;
      setLocalError(inlineHandled ? '' : validation);
      return;
    }
    setLocalError('');
    setCurrentStep(nextStep);
  }

  async function handleSave() {
    if (!isEditableDraft) return;
    setLocalError('');
    try {
      const saved = await saveCurrentDraft();
      if (!isEdit) navigate(`/transformaciones/${saved.id}/editar`);
    } catch (requestError) {
      setLocalError(requestError.message);
    }
  }

  async function handleOpenApply() {
    if (!isEditableDraft) return;
    setLocalError('');
    try {
      const saved = await saveCurrentDraft();
      if (!isEdit) navigate(`/transformaciones/${saved.id}/editar`, { replace: true });
      setSavedInfo(saved);
      setShowApplyModal(true);
    } catch (requestError) {
      setLocalError(requestError.message);
    }
  }

  async function handleApply() {
    setLocalError('');
    if (!isAdminUser && (!auth.usuario.trim() || !auth.password)) {
      setLocalError('Debes ingresar autorización ADMIN para aplicar.');
      return;
    }
    try {
      const targetId = isEdit ? editId : savedInfo?.id;
      const applied = await aplicar(targetId, isAdminUser ? {} : { autorizacion: { usuario: auth.usuario.trim(), password: auth.password } });
      setShowApplyModal(false);
      navigate(`/transformaciones/${applied.id}`);
    } catch (requestError) {
      setLocalError(requestError.message);
    }
  }

  async function handleDelete() {
    if (!isEdit || !actual || actual.estado !== 'BORRADOR') return;
    if (!window.confirm(`¿Eliminar la transformación pendiente ${actual.numero}?`)) return;
    setLocalError('');
    try {
      await eliminar(editId);
      navigate('/transformaciones');
    } catch (requestError) {
      setLocalError(requestError.message);
    }
  }

  const stepError = currentStep > 1 ? validateStep(currentStep - 1) : '';
  const childRemaining = baseToVisible(parentAvailableStockBase - totalChildrenBase, parentUnit);
  const hasConsumptionOverflow = totalConsumedBase > parentAvailableStockBase;
  const invalidSteps = hasConsumptionOverflow ? [2] : [];
  const continueDisabled = saving || loading || !isEditableDraft || ((currentStep === 2 || currentStep === 3) && hasConsumptionOverflow);

  const childRows = rowsWithCost.children.length ? rowsWithCost.children.map((row) => {
    const rowIndex = rowsWithCost.children.findIndex((item) => item.id === row.id);
    const rowError = childValidationErrors[rowIndex];
    return (
      <div key={row.id} className="grid min-h-[96px] items-center gap-4 border-t border-border px-4 py-4 md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-2">
          <p className="font-semibold text-text">{row.product?.nombre || 'Sin producto'}</p>
          <p className="text-xs text-text-muted">{row.product?.codigo || '-'}</p>
          <p className="text-xs font-medium text-text-muted">{formatMoney(row.resolvedCost)}</p>
          <FieldCallout message={rowError?.field === 'producto' ? rowError.message : ''} />
        </div>
        <div className="self-center">
          <div className="w-full"><Input value={row.cantidadInput} onChange={(e) => setChildren((current) => current.map((item) => (item.id === row.id ? { ...item, cantidadInput: sanitizeQtyInput(e.target.value, row.unit) } : item)))} disabled={!isEditableDraft} placeholder={row.unit === 'UND' ? '0' : '0.000'} /></div>
          <p className="mt-1 text-xs text-text-muted">{row.unit === 'UND' ? 'UND solo admite cantidades enteras.' : `Unidad ${row.unit}`}</p>
          <FieldCallout message={rowError?.field === 'cantidad' ? rowError.message : ''} />
        </div>
        <div className="flex items-center justify-center md:justify-end">
          <Button variant="danger" size="sm" onClick={() => setChildren((current) => current.filter((item) => item.id !== row.id))} disabled={!isEditableDraft}>Quitar</Button>
        </div>
      </div>
    );
  }) : <div className="px-4 py-8 text-text-muted">Agrega al menos un producto hijo para construir el consumo del padre.</div>;

  const mermaRows = rowsWithCost.mermas.length ? rowsWithCost.mermas.map((row) => {
    const rowIndex = rowsWithCost.mermas.findIndex((item) => item.id === row.id);
    const rowError = mermaValidationErrors[rowIndex];
    return (
      <div key={row.id} className="border-t border-border px-4 py-4">
        <div className="grid items-center gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,4fr)_minmax(0,1fr)]">
          <div>
            <Input value={row.tipoMerma || ''} onChange={(e) => setMermas((current) => current.map((item) => (item.id === row.id ? { ...item, tipoMerma: e.target.value } : item)))} disabled={!isEditableDraft} placeholder="Recorte, hueso, grasa, etc." />
          </div>
          <div>
            <Input value={row.cantidadInput} onChange={(e) => setMermas((current) => current.map((item) => (item.id === row.id ? { ...item, cantidadInput: sanitizeQtyInput(e.target.value, parentUnit) } : item)))} disabled={!isEditableDraft} placeholder={parentUnit === 'UND' ? '0' : '0.000'} />
          </div>
          <div>
            <Input value={row.motivo || ''} onChange={(e) => setMermas((current) => current.map((item) => (item.id === row.id ? { ...item, motivo: e.target.value } : item)))} disabled={!isEditableDraft} placeholder="Motivo de merma" />
          </div>
          <div className="flex h-full items-center justify-center md:justify-end">
            <Button variant="danger" size="sm" onClick={() => setMermas((current) => current.filter((item) => item.id !== row.id))} disabled={!isEditableDraft}>Quitar</Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,4fr)_minmax(0,1fr)]">
          <SecondarySlot>
            <p className="text-text-muted">Clasifica la merma del proceso. No genera stock.</p>
            <FieldCallout message={rowError?.field === 'tipoMerma' ? rowError.message : ''} />
          </SecondarySlot>
          <SecondarySlot>
            <p className="text-text-muted">{parentUnit === 'UND' ? 'UND solo admite cantidades enteras.' : `Unidad ${parentUnit}`}</p>
            <FieldCallout message={rowError?.field === 'cantidad' ? rowError.message : ''} />
          </SecondarySlot>
          <SecondarySlot>
            <FieldCallout message={rowError?.field === 'motivo' ? rowError.message : ''} />
          </SecondarySlot>
          <SecondarySlot />
        </div>
      </div>
    );
  }) : <div className="px-4 py-8 text-text-muted">Agrega al menos una merma para completar la transformación.</div>;

  const costRows = [
    ...rowsWithCost.children.map((row) => ({
      key: `child-${row.id}`,
      destino: row.product?.nombre || 'Producto hijo',
      cantidad: formatSummaryValue(row.cantidad || 0, row.unit),
      resolvedCost: row.resolvedCost,
      costValue: costMode === 'AUTOMATICA' ? String(row.resolvedCost.toFixed(2)) : (row.costoTotalInput || ''),
      update: (value) => setChildren((current) => current.map((item) => (item.id === row.id ? { ...item, costoTotalInput: parseMoneyInput(value) } : item))),
      unitCost: formatMoney(centsToUnitCost(row.resolvedCents, row.cantidadBase, row.unit))
    })),
    ...rowsWithCost.mermas.map((row) => ({
      key: `merma-${row.id}`,
      destino: row.tipoMerma || 'Merma',
      cantidad: formatSummaryValue(row.cantidad || 0, row.unit),
      resolvedCost: row.resolvedCost,
      costValue: costMode === 'AUTOMATICA' ? String(row.resolvedCost.toFixed(2)) : (row.costoTotalInput || ''),
      update: (value) => setMermas((current) => current.map((item) => (item.id === row.id ? { ...item, costoTotalInput: parseMoneyInput(value) } : item))),
      unitCost: formatMoney(centsToUnitCost(row.resolvedCents, row.cantidadBase, row.unit))
    }))
  ];

  return (
    <div className="space-y-5">
      <BackButton to="/transformaciones">Volver a transformaciones</BackButton>
      <div className="space-y-1">
        <h1 className="text-[2rem] font-bold tracking-[-0.02em] text-[var(--color-text)]">{isEdit ? `Editar transformación ${actual?.numero || `#${editId}`}` : 'Nueva transformación guiada'}</h1>
        <p className="text-base text-[var(--color-text-muted)]">Construye una transformación completa paso a paso. El consumo emerge de resultados más merma, sin declarar una cantidad inicial del padre.</p>
      </div>
      {(error || localError || catalogError || stepError) && <Alert tone="error">{localError || catalogError || error || stepError}</Alert>}
      {isEdit && actual?.estado && (
        <div className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">Estado operativo</h3>
          <p className="mt-3 text-lg font-semibold text-text">{getTransformacionStatusLabel(actual.estado)}</p>
          <p className="mt-1 text-sm text-text-muted">{getTransformacionStatusHelp(actual.estado)}</p>
        </div>
      )}
      <WizardStepper currentStep={currentStep} onStepChange={handleStepChange} canReachStep={canReachStep} invalidSteps={invalidSteps} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {currentStep === 1 && (
            <div className="space-y-5">
              <div className="rounded-[24px] border border-border bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-xl font-semibold text-text">Paso 1. Padre</h2><p className="mt-1 text-sm text-text-muted">Selecciona el producto padre y revisa cuánto hay de stock disponible del padre.</p></div>
                  <Button type="button" onClick={() => setShowBaseModal(true)} disabled={!isEditableDraft}>Seleccionar padre</Button>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div><label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Producto transformable</label><Input readOnly value={parentProduct ? `${parentProduct.codigo || `#${parentProduct.id}`} - ${parentProduct.nombre}` : ''} placeholder="Selecciona un producto transformable" onClick={() => setShowBaseModal(true)} disabled={!isEditableDraft} /></div>
                  <div><label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Unidad base</label><Input readOnly value={parentUnit} /></div>
                  <div><label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Fecha</label><Input type="date" value={header.fecha} onChange={(e) => setHeader((current) => ({ ...current, fecha: e.target.value }))} disabled={!isEditableDraft} /></div>
                  <div><label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Referencia lote</label><Input value={header.referencia_lote} onChange={(e) => setHeader((current) => ({ ...current, referencia_lote: e.target.value }))} disabled={!isEditableDraft} placeholder="Opcional" /></div>
                  <div className="lg:col-span-2"><label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Observación</label><Textarea rows={3} value={header.observacion} onChange={(e) => setHeader((current) => ({ ...current, observacion: e.target.value }))} disabled={!isEditableDraft} placeholder="Observación operativa" /></div>
                </div>
              </div>
              <div className="rounded-[24px] border border-border bg-background p-6 shadow-sm">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">Resumen del padre</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Stock disponible del padre</p><p className="mt-2 text-2xl font-semibold text-text">{formatSummaryValue(parentAvailableStock, parentUnit)}</p></div>
                  <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Costo total disponible</p><p className="mt-2 text-2xl font-semibold text-text">{formatMoney(centsToMoney(parentCurrentValueCents))}</p></div>
                  <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Costo unitario referencial</p><p className="mt-2 text-2xl font-semibold text-text">{`${formatMoney(parentCurrentUnitCost)} por ${parentUnit}`}</p></div>
                </div>
              </div>
            </div>
          )}
          {currentStep === 2 && (
            <div className="rounded-[24px] border border-border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-xl font-semibold text-text">Paso 2. Resultados</h2><p className="mt-1 text-sm text-text-muted">Agrega productos hijo. Cada cantidad consume parte del stock disponible del padre.</p></div>
                <Button onClick={() => setShowChildModal(true)} disabled={!isEditableDraft || !parent.producto_id}>+ Agregar producto hijo</Button>
              </div>
              <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-text-muted">Stock disponible del padre</span><strong className="text-text">{formatSummaryValue(parentAvailableStock, parentUnit)}</strong></div><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><span className="text-text-muted">Saldo sin transformar</span><strong className={childRemaining < 0 ? 'text-danger' : 'text-success'}>{formatSummaryValue(Math.max(childRemaining, 0), parentUnit)}</strong></div>{hasConsumptionOverflow && <div className="mt-4 rounded-2xl border border-danger bg-danger-soft px-4 py-3 text-sm font-medium text-danger">No puedes continuar: el consumo excede el disponible del padre.</div>}</div>
                <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-white">
                <div className="hidden border-b border-border bg-background px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-text-muted md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,2fr)] md:items-center md:gap-4">
                  <span className="text-left">Producto</span>
                  <span>Cantidad</span>
                  <span className="text-center md:text-right">Acción</span>
                </div>
                <div>{childRows}</div>
              </div>
            </div>
          )}
          {currentStep === 3 && (
            <div className="rounded-[24px] border border-border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-xl font-semibold text-text">Paso 3. Merma</h2><p className="mt-1 text-sm text-text-muted">Registra la merma del proceso. Cada merma también descuenta del stock disponible del padre.</p></div>
                <Button variant="secondary" onClick={handleAddMerma} disabled={!isEditableDraft || !parent.producto_id}>+ Agregar merma</Button>
              </div>
              <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><span className="text-text-muted">Stock disponible del padre</span><strong className="text-text">{formatSummaryValue(parentAvailableStock, parentUnit)}</strong></div><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><span className="text-text-muted">Saldo sin transformar</span><strong className={remainingStockBase < 0 ? 'text-danger' : 'text-success'}>{formatSummaryValue(Math.max(remainingStock, 0), parentUnit)}</strong></div>{remainingStockBase === 0 && <div className="mt-4 inline-flex rounded-full border border-success bg-success-soft px-3 py-1 text-sm font-semibold text-success">✅ Consumo completo del padre</div>}</div>
              <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-white">
                <div className="hidden border-b border-border bg-background px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-text-muted md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,4fr)_minmax(0,1fr)] md:items-center md:gap-4">
                  <span className="text-left">Clasificación de merma</span>
                  <span>Cantidad</span>
                  <span className="text-left">Motivo</span>
                  <span className="text-center md:text-right">Acción</span>
                </div>
                <div>{mermaRows}</div>
              </div>
            </div>
          )}
          {currentStep === 4 && (
            <div className="rounded-[24px] border border-border bg-white p-6 shadow-sm">
              <div><h2 className="text-xl font-semibold text-text">Paso 4. Distribución de costo</h2><p className="mt-1 text-sm text-text-muted">El costo se distribuye solo sobre lo realmente consumido: hijos más merma.</p></div>
              <div className="mt-5 rounded-2xl border border-border bg-background p-5">
                <div className="flex flex-wrap gap-3"><Button type="button" variant={costMode === 'AUTOMATICA' ? 'primary' : 'secondary'} onClick={() => switchCostMode('AUTOMATICA')} disabled={!isEditableDraft}>Automática</Button><Button type="button" variant={costMode === 'MANUAL' ? 'primary' : 'secondary'} onClick={() => switchCostMode('MANUAL')} disabled={!isEditableDraft}>Manual</Button></div>
                <div className="mt-5 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
                  <div className="rounded-2xl border border-primary/25 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Costo total consumido</p><p className="mt-3 text-4xl font-bold tracking-[-0.03em] text-text">{formatMoney(centsToMoney(parentCostCents))}</p></div>
                  <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Cálculo</p><p className="mt-2 text-sm font-semibold text-text">{`${formatQtyByUnit(totalConsumed, parentUnit, { fixedWeight: true })} ${parentUnit} × ${formatMoney(parentCurrentUnitCost)} = ${formatMoney(centsToMoney(parentCostCents))}`}</p></div>
                  <div className="rounded-2xl border border-border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Saldo sin transformar</p><p className="mt-2 text-2xl font-semibold text-success">{formatSummaryValue(Math.max(remainingStock, 0), parentUnit)}</p></div>
                </div>
              </div>
              <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-white"><Table><TableHead><TableRow><TableCell>Destino</TableCell><TableCell>Cantidad</TableCell><TableCell>Costo total</TableCell><TableCell>Costo unitario</TableCell></TableRow></TableHead><TableBody>{costRows.map((row) => <TableRow key={row.key}><TableCell>{row.destino}</TableCell><TableCell>{row.cantidad}</TableCell><TableCell>{costMode === 'AUTOMATICA' ? <span className="font-semibold text-text">{formatMoney(row.resolvedCost)}</span> : <div className="w-40"><Input value={row.costValue} onChange={(e) => row.update(e.target.value)} disabled={!isEditableDraft} placeholder="$0.00" /></div>}</TableCell><TableCell>{row.unitCost}</TableCell></TableRow>)}</TableBody></Table></div>
              <div className="mt-5 rounded-2xl border border-border bg-background p-4 text-sm"><div className="flex items-center justify-between"><span className="text-text-muted">Costo distribuido</span><strong className="text-text">{formatMoney(centsToMoney(distribution.distributedCents))}</strong></div><div className="mt-2 flex items-center justify-between"><span className="text-text-muted">Diferencia de costo</span><strong className={distribution.costOk ? 'text-success' : 'text-danger'}>{formatMoney(centsToMoney(distribution.diffCents))}</strong></div></div>
            </div>
          )}
          {currentStep === 5 && (
            <div className="rounded-[24px] border border-border bg-white p-6 shadow-sm">
              <div><h2 className="text-xl font-semibold text-text">Paso 5. Confirmar</h2><p className="mt-1 text-sm text-text-muted">Revisa la transformación completa antes de guardarla como lista para aplicar o aplicarla ahora.</p></div>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Disponible inicial</p><p className="mt-2 text-lg font-semibold text-text">{formatSummaryValue(parentAvailableStock, parentUnit)}</p></div>
                <div className="rounded-2xl border border-border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Consumido total</p><p className="mt-2 text-lg font-semibold text-text">{formatSummaryValue(totalConsumed, parentUnit)}</p></div>
                <div className="rounded-2xl border border-border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Disponible final</p><p className="mt-2 text-lg font-semibold text-success">{formatSummaryValue(Math.max(remainingStock, 0), parentUnit)}</p></div>
                <div className="rounded-2xl border border-border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Costo consumido</p><p className="mt-2 text-lg font-semibold text-text">{formatMoney(centsToMoney(parentCostCents))}</p></div>
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background p-4"><h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">Padre</h3><div className="mt-3 space-y-2 text-sm"><p><strong>{parentProduct?.codigo || '-'}</strong> {parentProduct?.nombre || 'Sin seleccionar'}</p><p className="text-text-muted">Referencia lote: <strong>{header.referencia_lote || '-'}</strong></p><p className="text-text-muted">Estado operativo: <strong>{isEdit && actual?.estado ? getTransformacionStatusLabel(actual.estado) : 'Lista para aplicar'}</strong></p></div></div>
                <div className="rounded-2xl border border-border bg-background p-4"><h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">Balance</h3><div className="mt-3 space-y-2 text-sm"><p className="text-text-muted">Total hijos: <strong>{formatSummaryValue(totalChildren, parentUnit)}</strong></p><p className="text-text-muted">Total merma: <strong>{formatSummaryValue(totalMerma, parentUnit)}</strong></p><p className="text-text-muted">Costo OK: <strong className={distribution.costOk ? 'text-success' : 'text-danger'}>{distribution.costOk ? 'Sí' : 'No'}</strong></p></div></div>
              </div>
              <div className="mt-5 rounded-2xl border border-border bg-white"><div className="border-b border-border px-4 py-3"><h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">Resultados y merma</h3></div><div className="grid gap-5 p-4 lg:grid-cols-2"><div><p className="mb-3 text-sm font-semibold text-text">Resultados</p><div className="space-y-2">{rowsWithCost.children.map((row) => <div key={`confirm-child-${row.id}`} className="rounded-xl border border-border bg-background p-4 text-sm"><div className="flex items-start justify-between gap-3"><p className="font-semibold text-text">{row.product?.nombre || 'Producto hijo'}</p><p className="text-right text-sm font-bold text-text">{formatSummaryValue(row.cantidad || 0, row.unit)}</p></div><p className="mt-2 text-xs font-medium text-text-muted">{formatMoney(row.resolvedCost)}</p></div>)}</div></div><div><p className="mb-3 text-sm font-semibold text-text">Merma</p><div className="space-y-2">{rowsWithCost.mermas.map((row) => <div key={`confirm-merma-${row.id}`} className="rounded-xl border border-border bg-background p-4 text-sm"><div className="flex items-start justify-between gap-3"><p className="font-semibold text-text">{row.tipoMerma || 'Merma'}</p><p className="text-right text-sm font-bold text-text">{formatSummaryValue(row.cantidad || 0, row.unit)}</p></div><p className="mt-2 text-xs font-medium text-text-muted">{formatMoney(row.resolvedCost)}</p><p className="mt-2 text-text-muted">{row.motivo || '-'}</p></div>)}</div></div></div></div>
              <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-text-muted"><p>Guardar lista para aplicar no mueve inventario.</p><p className="mt-2">Aplicar transformación sí impacta inventario y costo del padre e hijos.</p></div>
            </div>
          )}
          <div className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">{isEdit && actual?.estado === 'BORRADOR' && <Button variant="danger" onClick={handleDelete} disabled={saving}>Eliminar transformación pendiente</Button>}</div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={() => navigate('/transformaciones')} disabled={saving}>Cancelar</Button>
                {currentStep > 1 && <Button variant="secondary" onClick={() => handleStepChange(currentStep - 1)} disabled={saving}>Volver</Button>}
                {currentStep < 5
                  ? <Button onClick={() => handleStepChange(currentStep + 1)} disabled={continueDisabled}>Continuar</Button>
                  : <>
                    <Button variant="secondary" onClick={handleSave} disabled={saving || loading || !isEditableDraft}>{saving ? 'Guardando...' : 'Guardar lista para aplicar'}</Button>
                    <Button onClick={handleOpenApply} disabled={saving || loading || !isEditableDraft}>Aplicar ahora</Button>
                  </>}
              </div>
            </div>
          </div>
        </div>
        <SummaryPanel parentProduct={parentProduct} parentUnit={parentUnit} parentAvailableStock={parentAvailableStock} totalChildren={totalChildren} totalMerma={totalMerma} totalConsumed={totalConsumed} remainingStock={remainingStock} remainingStockBase={remainingStockBase} parentCostCents={parentCostCents} distribution={distribution} currentStep={currentStep} />
      </div>
      <ProductSearchModal open={showBaseModal} title="Seleccionar producto padre" search={baseSearch} onSearchChange={setBaseSearch} filters={<div><label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Stock</label><Select value={baseStockFilter} onChange={(e) => setBaseStockFilter(e.target.value)}><option value="CON_STOCK">Con stock</option><option value="TODOS">Todos</option></Select></div>} rows={pagedBaseRows} page={basePage} totalPages={baseTotalPages} totalRecords={baseCandidates.length} onPageChange={setBasePage} onClose={() => setShowBaseModal(false)} onSelect={handleSelectBase} getStockLabel={(row) => formatQtyByUnit(baseToVisible(resolveProductStockBase(row), row.unidad_medida || row.unidad), row.unidad_medida || row.unidad, { fixedWeight: true })} />
      <ProductSearchModal open={showChildModal} title="Agregar producto hijo" search={childSearch} onSearchChange={setChildSearch} filters={<div><label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Categoría</label><Select value={childCategory} onChange={(e) => setChildCategory(e.target.value)}><option value="ALL">Todas</option>{categoryOptions.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</Select></div>} rows={pagedChildRows} page={childPage} totalPages={childTotalPages} totalRecords={childCandidates.length} onPageChange={setChildPage} onClose={() => setShowChildModal(false)} onSelect={handleAddChild} getCutTypeLabel={(row) => row.tipo_corte || row.tipo_corte_nombre || row.categoria_nombre || '—'} getStockLabel={(row) => formatQtyByUnit(baseToVisible(resolveProductStockBase(row), row.unidad_medida || row.unidad), row.unidad_medida || row.unidad, { fixedWeight: true })} />
      <ApplyConfirmModal open={showApplyModal} auth={auth} setAuth={setAuth} onClose={() => setShowApplyModal(false)} onConfirm={handleApply} loading={saving} needsAuth={!isAdminUser} parentName={parentProduct?.nombre || 'Producto padre'} parentUnit={parentUnit} initialQty={parentAvailableStock} totalConsumido={totalConsumed} remainingQty={remainingStock} mermaQty={totalMerma} />
    </div>
  );
}
