import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { PiTrash, PiX } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useVentasStore } from '../../stores/ventasStore';
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Toast
} from '../../ui';
import { getUnidad, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';
import { formatMoney } from '../../lib/formatMoney';
import { useVentaCatalogo } from './hooks/useVentaCatalogo';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { useCajaStore } from '../../stores/cajaStore';
import {
  PAYMENT_CODES,
  buildVentaCreatePayload,
  centsToMoney,
  moneyToCents,
  normalizeRoundingConfig,
  normalizePaymentMethods,
  paymentAffectsCash,
  paymentRequiresClient,
  redondearPrecioVenta
} from './ventaUtils';

const FacturaModal = lazy(() => import('./FacturaModal'));

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function round3(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function defaultQtyInput(unidad) {
  return getUnidad(unidad) === 'UND' ? '1' : '1.000';
}

function parseDecimal(value) {
  const text = String(value || '').replace(',', '.');
  if (text === '' || text === '.') return NaN;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseQtyByUnidad(value, unidad) {
  if (getUnidad(unidad) === 'UND') {
    const n = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }
  return parseDecimal(value);
}

function formatStock(value, unidad) {
  const n = Number(value || 0);
  return getUnidad(unidad) === 'UND'
    ? String(Math.trunc(n))
    : n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function formatQtyWithUnit(value, unidad) {
  const unit = getUnidad(unidad);
  const qty = Number(value || 0);
  if (unit === 'UND') return `${Math.trunc(qty)} ${unit}`;
  return `${qty.toFixed(3)} ${unit}`;
}

const PRODUCT_ROW_HEIGHT = 90;
const PRODUCT_OVERSCAN = 6;

export default function NuevaVentaPage() {
  const navigate = useNavigate();
  const { crearVenta, imprimirTicketVenta, errorVenta } = useVentasStore(useShallow((s) => ({
    crearVenta: s.crear,
    imprimirTicketVenta: s.imprimirTicketVenta,
    errorVenta: s.error
  })));
  const { configuracion, metodosPago, cargarConfiguracionTodo } = useConfiguracionStore(useShallow((s) => ({
    configuracion: s.configuracion,
    metodosPago: s.metodosPago,
    cargarConfiguracionTodo: s.cargarTodo
  })));
  const { turnoActual, fetchTurnoActual } = useCajaStore(useShallow((s) => ({
    turnoActual: s.turnoActual,
    fetchTurnoActual: s.fetchTurnoActual
  })));
  const {
    categorias,
    categoriaActiva,
    setCategoriaActiva,
    productosMostrados,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    loadingCatalogo,
    catalogError
  } = useVentaCatalogo();

  const [carrito, setCarrito] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [modalFacturaOpen, setModalFacturaOpen] = useState(false);
  const [descuento, setDescuento] = useState('0');
  const [selectedPaymentCode, setSelectedPaymentCode] = useState(PAYMENT_CODES.EFECTIVO);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [successToast, setSuccessToast] = useState({ open: false, total: 0 });
  const [printToast, setPrintToast] = useState({ open: false, tone: 'success', text: '' });
  const [selectedProductoIndex, setSelectedProductoIndex] = useState(-1);
  const [cajaRequiredModalOpen, setCajaRequiredModalOpen] = useState(false);
  const [stockIssue, setStockIssue] = useState(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutMethodCode, setCheckoutMethodCode] = useState(PAYMENT_CODES.EFECTIVO);
  const [checkoutError, setCheckoutError] = useState('');
  const [cashReceivedInput, setCashReceivedInput] = useState('');
  const [transferBank, setTransferBank] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [transferObservation, setTransferObservation] = useState('');
  const [creditType, setCreditType] = useState('PENDIENTE_TOTAL');
  const [creditAbonoInput, setCreditAbonoInput] = useState('');
  const [checkoutSubmitPhase, setCheckoutSubmitPhase] = useState('confirm');
  const [checkoutConfirmPromptVisible, setCheckoutConfirmPromptVisible] = useState(false);

  const productListViewportRef = useRef(null);
  const cashReceivedInputRef = useRef(null);
  const [productScrollTop, setProductScrollTop] = useState(0);
  const [productViewportHeight, setProductViewportHeight] = useState(520);

  const enabledPaymentMethods = useMemo(() => {
    const methods = normalizePaymentMethods(metodosPago);
    return methods.filter((method) => {
      if (method.codigo === PAYMENT_CODES.CREDITO_CLIENTE) {
        return Boolean(configuracion?.permitir_ventas_credito);
      }
      return true;
    });
  }, [configuracion?.permitir_ventas_credito, metodosPago]);
  const effectiveConfig = configuracion;
  const roundingConfig = useMemo(() => normalizeRoundingConfig(effectiveConfig), [effectiveConfig]);
  const roundingActive = Boolean(roundingConfig?.activo);

  const defaultCashPaymentCode = useMemo(
    () => enabledPaymentMethods.find((method) => method.codigo === PAYMENT_CODES.EFECTIVO)?.codigo
      || enabledPaymentMethods.find((method) => !paymentRequiresClient(method.codigo))?.codigo
      || enabledPaymentMethods[0]?.codigo
      || PAYMENT_CODES.EFECTIVO,
    [enabledPaymentMethods]
  );

  const paymentOptions = useMemo(
    () => enabledPaymentMethods.map((method) => ({
      codigo: method.codigo,
      nombre: method.nombre,
      es_efectivo: Boolean(method.es_efectivo),
      requiere_cliente: paymentRequiresClient(method.codigo)
    })),
    [enabledPaymentMethods]
  );

  const selectedPaymentOption = useMemo(
    () => paymentOptions.find((option) => option.codigo === selectedPaymentCode) || null,
    [paymentOptions, selectedPaymentCode]
  );

  const cajaAbierta = Boolean(turnoActual?.id);
  const paymentImpactsCash = useMemo(
    () => paymentAffectsCash(selectedPaymentCode, enabledPaymentMethods),
    [enabledPaymentMethods, selectedPaymentCode]
  );
  const requiresOpenCashShift = paymentImpactsCash && (configuracion?.exigir_caja_abierta_para_cobros ?? true);

  useEffect(() => {
    cargarConfiguracionTodo().catch(() => {});
  }, [cargarConfiguracionTodo]);

  useEffect(() => {
    fetchTurnoActual({ silent: true }).catch(() => {});
  }, [fetchTurnoActual]);

  useEffect(() => {
    if (!paymentOptions.length) return;
    if (!paymentOptions.some((option) => option.codigo === selectedPaymentCode)) {
      setSelectedPaymentCode(paymentOptions[0].codigo);
    }
  }, [paymentOptions, selectedPaymentCode]);

  useEffect(() => {
    if (!productosMostrados.length) {
      setSelectedProductoIndex(-1);
      return;
    }

    setSelectedProductoIndex((current) => {
      if (current < 0 || current >= productosMostrados.length) return 0;
      return current;
    });
  }, [productosMostrados]);

  useEffect(() => {
    const container = productListViewportRef.current;
    if (!container || selectedProductoIndex < 0) return;
    const rowTop = selectedProductoIndex * PRODUCT_ROW_HEIGHT;
    const rowBottom = rowTop + PRODUCT_ROW_HEIGHT;
    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;
    if (rowTop < viewportTop) {
      container.scrollTop = rowTop;
    } else if (rowBottom > viewportBottom) {
      container.scrollTop = Math.max(0, rowBottom - container.clientHeight);
    }
  }, [selectedProductoIndex]);

  useEffect(() => {
    const container = productListViewportRef.current;
    if (!container) return undefined;
    const syncHeight = () => setProductViewportHeight(container.clientHeight || 520);
    syncHeight();
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, []);

  useEffect(() => {
    if (!successToast.open) return undefined;
    const timer = window.setTimeout(() => {
      setSuccessToast((current) => (current.open ? { ...current, open: false } : current));
    }, 5600);
    return () => window.clearTimeout(timer);
  }, [successToast.open]);

  useEffect(() => {
    if (!printToast.open) return undefined;
    const timer = window.setTimeout(() => setPrintToast({ open: false, tone: 'success', text: '' }), 4000);
    return () => window.clearTimeout(timer);
  }, [printToast.open]);

  const carritoConEstado = useMemo(
    () => carrito.map((item) => {
      const unidad = getUnidad(item.unidad_medida);
      const qtyValue = parseQtyByUnidad(item.cantidadInput, unidad);

      let cantidadError = '';
      if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
        cantidadError = 'Cantidad invalida';
      } else if (unidad === 'UND' && !Number.isInteger(qtyValue)) {
        cantidadError = 'UND solo permite enteros';
      } else if (qtyValue > Number(item.stock_actual || 0)) {
        cantidadError = 'Stock insuficiente';
      }

      const cantidad = !cantidadError
        ? (unidad === 'UND' ? Math.trunc(qtyValue) : round3(qtyValue))
        : 0;
      const precio = round2(redondearPrecioVenta(item.precio_venta, roundingConfig));
      const subtotalCentavos = moneyToCents(cantidad * precio);

      return {
        ...item,
        cantidad,
        precio,
        subtotal_centavos: subtotalCentavos,
        subtotal: centsToMoney(subtotalCentavos),
        cantidadError,
        invalido: Boolean(cantidadError)
      };
    }),
    [carrito, roundingConfig]
  );

  const hasInvalidItems = carritoConEstado.some((item) => item.invalido);
  const subtotalCentavos = useMemo(
    () => carritoConEstado.reduce((acc, item) => acc + Number(item.subtotal_centavos || 0), 0),
    [carritoConEstado]
  );
  const subtotal = useMemo(() => centsToMoney(subtotalCentavos), [subtotalCentavos]);
  const descuentoValue = useMemo(() => {
    const value = parseDecimal(descuento);
    if (!Number.isFinite(value) || value < 0) return 0;
    return round2(value);
  }, [descuento]);
  const descuentoCentavos = useMemo(() => moneyToCents(descuentoValue), [descuentoValue]);
  const totalCentavos = useMemo(
    () => Math.max(0, subtotalCentavos - descuentoCentavos),
    [descuentoCentavos, subtotalCentavos]
  );
  const total = useMemo(
    () => centsToMoney(totalCentavos),
    [totalCentavos]
  );
  const creditAbonoValue = useMemo(() => {
    const value = parseDecimal(creditAbonoInput);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return round2(value);
  }, [creditAbonoInput]);
  const creditSaldoPendiente = useMemo(
    () => centsToMoney(Math.max(0, totalCentavos - moneyToCents(creditAbonoValue))),
    [creditAbonoValue, totalCentavos]
  );
  const cashReceivedValue = useMemo(() => {
    const value = parseDecimal(cashReceivedInput);
    if (!Number.isFinite(value) || value < 0) return 0;
    return round2(value);
  }, [cashReceivedInput]);
  const cashChangeValue = useMemo(
    () => centsToMoney(Math.max(0, moneyToCents(cashReceivedValue) - totalCentavos)),
    [cashReceivedValue, totalCentavos]
  );
  const checkoutMethodIsEfectivo = checkoutMethodCode === PAYMENT_CODES.EFECTIVO;
  const checkoutMethodIsTransfer = checkoutMethodCode === PAYMENT_CODES.TRANSFERENCIA;
  const checkoutMethodIsCredito = checkoutMethodCode === PAYMENT_CODES.CREDITO_CLIENTE;
  const checkoutClienteEsConsumidorFinal = !clienteSeleccionado?.id;
  const checkoutCanConfirm = useMemo(() => {
    if (submitting || !checkoutModalOpen || !carritoConEstado.length || hasInvalidItems || total <= 0) return false;
    if (!paymentOptions.some((option) => option.codigo === checkoutMethodCode)) return false;

    if (checkoutMethodIsEfectivo) {
      return cashReceivedValue >= total;
    }
    if (checkoutMethodIsTransfer) return Boolean(transferBank.trim());
    if (checkoutMethodIsCredito) {
      if (checkoutClienteEsConsumidorFinal) return false;
      if (creditType === 'ABONO_PARCIAL') return creditAbonoValue > 0 && creditAbonoValue < total;
      return true;
    }
    return false;
  }, [
    submitting,
    checkoutModalOpen,
    carritoConEstado.length,
    hasInvalidItems,
    total,
    paymentOptions,
    checkoutMethodCode,
    checkoutMethodIsEfectivo,
    checkoutMethodIsTransfer,
    checkoutMethodIsCredito,
    cashReceivedValue,
    transferBank,
    checkoutClienteEsConsumidorFinal,
    creditType,
    creditAbonoValue
  ]);
  const checkoutPrimaryLabel = useMemo(() => {
    if (checkoutMethodIsTransfer) return `Confirmar transferencia ${formatMoney(total)}`;
    if (checkoutMethodIsCredito) return `Confirmar crédito ${formatMoney(total)}`;
    return `Cobrar ${formatMoney(total)}`;
  }, [checkoutMethodIsCredito, checkoutMethodIsTransfer, total]);
  const checkoutPrimaryLoadingLabel = checkoutSubmitPhase === 'register'
    ? 'Registrando venta...'
    : 'Confirmando pago...';
  const cashQuickAmounts = useMemo(() => [10, 15, 20, 50], []);

  useEffect(() => {
    if (!checkoutModalOpen || !checkoutMethodIsEfectivo) return;
    const timer = window.setTimeout(() => {
      cashReceivedInputRef.current?.focus();
      cashReceivedInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkoutMethodIsEfectivo, checkoutModalOpen]);

  const ventaActionDisabled = submitting
    || !carritoConEstado.length
    || hasInvalidItems
    || !paymentOptions.length
    || (selectedPaymentOption?.requiere_cliente && !clienteSeleccionado);

  const virtualProductWindow = useMemo(() => {
    const total = productosMostrados.length;
    if (!total) return { totalHeight: 0, topPad: 0, bottomPad: 0, start: 0, end: 0 };
    const visibleCount = Math.max(1, Math.ceil(productViewportHeight / PRODUCT_ROW_HEIGHT));
    const start = Math.max(0, Math.floor(productScrollTop / PRODUCT_ROW_HEIGHT) - PRODUCT_OVERSCAN);
    const end = Math.min(total, start + visibleCount + PRODUCT_OVERSCAN * 2);
    const topPad = start * PRODUCT_ROW_HEIGHT;
    const totalHeight = total * PRODUCT_ROW_HEIGHT;
    const bottomPad = Math.max(0, totalHeight - topPad - (end - start) * PRODUCT_ROW_HEIGHT);
    return { totalHeight, topPad, bottomPad, start, end };
  }, [productosMostrados.length, productViewportHeight, productScrollTop]);

  const renderedProductRows = useMemo(() => (
    productosMostrados.slice(virtualProductWindow.start, virtualProductWindow.end).map((producto, offsetIndex) => {
      const index = virtualProductWindow.start + offsetIndex;
      const unidad = getUnidad(producto.unidad_medida || producto.unidad);
      const selected = index === selectedProductoIndex;
      const stockActual = Number(producto.stock_actual || 0);
      const stockMinimo = Number(producto.stock_minimo || 0);
      const isOut = stockActual <= 0;
      const isLow = !isOut && ((stockMinimo > 0 && stockActual <= stockMinimo) || stockActual <= 5);
      const stockBadgeLabel = isOut ? 'SIN STOCK' : (isLow ? 'BAJO STOCK' : null);
      const stockBadgeClass = isOut
        ? 'bg-[color-mix(in_oklab,var(--color-danger-soft)_74%,white_26%)] text-[var(--color-danger)]'
        : isLow
          ? 'bg-[color-mix(in_oklab,var(--color-warning-soft)_83%,white_17%)] text-[var(--color-warning)]'
          : '';
      const stateTintClass = isOut
        ? 'bg-[color-mix(in_oklab,var(--color-danger-soft)_35%,white_65%)]'
        : isLow
          ? 'bg-[color-mix(in_oklab,var(--color-warning-soft)_40%,white_60%)]'
          : 'bg-[var(--color-surface)]';
      const precioBase = round2(producto.precio_venta || producto.precio_referencia || 0);
      const precioFinal = round2(redondearPrecioVenta(precioBase, roundingConfig));
      const priceText = `${formatMoney(precioBase)} / ${unidad}`;
      const roundedText = `${formatMoney(precioFinal)} / ${unidad}`;
      const stockText = `${formatStock(producto.stock_actual, unidad)} ${unidad} disponibles`;

      return (
        <div
          key={producto.id}
          role="button"
          tabIndex={0}
          onMouseEnter={() => setSelectedProductoIndex(index)}
          onClick={() => addProductoToCarrito(producto)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              addProductoToCarrito(producto);
            }
          }}
          className={`w-full rounded-lg border px-3 py-2 text-left ${stateTintClass} ${
            selected
              ? 'border-[var(--color-border-strong)]'
              : 'border-[var(--color-border)]'
          } ${isOut ? 'opacity-90' : ''}`}
          style={{ minHeight: `${PRODUCT_ROW_HEIGHT - 6}px` }}
        >
          <div className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold leading-tight text-[var(--color-text)]">
                {producto.nombre}
              </p>
              <div className="shrink-0 flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-bold leading-none text-[var(--color-text)]">
                    {isOut ? 'AGOTADO' : priceText}
                  </p>
                  {!isOut && roundingActive ? (
                    <p className="mt-0.5 text-xs font-semibold text-[var(--color-brand)]">
                      Cobro: {roundedText}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant={isOut ? 'secondary' : 'primary'}
                  size="sm"
                  className="min-h-7 px-2 py-0 text-[11px] font-semibold leading-none"
                  disabled={isOut}
                  onClick={(event) => {
                    event.stopPropagation();
                    addProductoToCarrito(producto);
                  }}
                >
                  {isOut ? 'No vender' : 'Agregar'}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-sm text-[var(--color-text-muted)]">{stockText}</p>
              {stockBadgeLabel ? (
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stockBadgeClass}`}>
                  {stockBadgeLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      );
    })
  ), [productosMostrados, virtualProductWindow.start, virtualProductWindow.end, selectedProductoIndex, roundingConfig, roundingActive]);

  const renderedCarritoRows = useMemo(() => (
    carritoConEstado.map((item) => (
      <article
        key={item.producto_id}
        className={`rounded-lg border px-3 py-2 ${
          item.cantidadError
            ? 'border-[var(--color-danger)] bg-[color-mix(in_oklab,var(--color-danger-soft)_52%,white_48%)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface-alt)]'
        }`}
      >
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text)]">{item.nombre}</p>

          <div className="flex shrink-0 items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
            <input
              type="text"
              inputMode={item.unidad_medida === 'UND' ? 'numeric' : 'decimal'}
              className="h-8 w-[78px] shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0 text-right text-sm font-semibold text-[var(--color-text)] outline-none"
              value={item.cantidadInput}
              onChange={(e) => updateItemCantidadInput(item.producto_id, item.unidad_medida, e.target.value)}
            />
            <span className="shrink-0 font-semibold uppercase">{getUnidad(item.unidad_medida)}</span>
            <span className="shrink-0">x</span>
            <span className="shrink-0 font-semibold text-[var(--color-text)]">{formatMoney(item.precio)}</span>
          </div>

          <p className="w-[74px] shrink-0 text-right text-sm font-bold text-[var(--color-text)]">{formatMoney(item.subtotal)}</p>

          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color-mix(in_oklab,var(--color-danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-soft)_35%,white_65%)] text-[var(--color-danger)]"
            aria-label={`Quitar ${item.nombre}`}
            title="Quitar"
            onClick={() => removeItem(item.producto_id)}
          >
            <PiTrash className="text-base" />
          </button>
        </div>

        {item.cantidadError ? (
          <p className="mt-1.5 text-xs font-semibold text-[var(--color-danger)]">{item.cantidadError}</p>
        ) : null}
        {!item.cantidadError && roundingActive && round2(item.precio_venta) !== round2(item.precio) ? (
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">Redondeado desde {formatMoney(item.precio_venta)}</p>
        ) : null}
      </article>
    ))
  ), [carritoConEstado, roundingActive]);

  const handleSearchKeyDown = (event) => {
    if (!productosMostrados.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedProductoIndex((current) => Math.min(productosMostrados.length - 1, Math.max(current, 0) + 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedProductoIndex((current) => Math.max(0, (current < 0 ? 0 : current) - 1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const producto = productosMostrados[selectedProductoIndex >= 0 ? selectedProductoIndex : 0];
      if (producto) addProductoToCarrito(producto);
    }
  };

  function addProductoToCarrito(producto) {
    const unidad = getUnidad(producto.unidad_medida || producto.unidad);
    const qtyToAdd = unidad === 'UND' ? 1 : 1;
    const stockActual = Number(producto.stock_actual || 0);

    setLocalError('');
    setCarrito((prev) => {
      const existing = prev.find((item) => item.producto_id === producto.id);

      if (existing) {
        const existingQty = parseQtyByUnidad(existing.cantidadInput, unidad);
        const newQty = unidad === 'UND'
          ? round2((Number.isFinite(existingQty) ? existingQty : 0) + qtyToAdd)
          : round3((Number.isFinite(existingQty) ? existingQty : 0) + qtyToAdd);

        if (newQty > stockActual) {
          setStockIssue({
            producto: producto.nombre,
            disponible: formatStock(stockActual, unidad),
            unidad
          });
          return prev;
        }

        return prev.map((item) => (
          item.producto_id === producto.id
            ? { ...item, cantidadInput: unidad === 'UND' ? String(newQty) : Number(newQty).toFixed(3) }
            : item
        ));
      }

      if (qtyToAdd > stockActual) {
        setStockIssue({
          producto: producto.nombre,
          disponible: formatStock(stockActual, unidad),
          unidad
        });
        return prev;
      }

      return [
        ...prev,
        {
          producto_id: producto.id,
          codigo: producto.codigo,
          nombre: producto.nombre,
          unidad_medida: unidad,
          stock_actual: stockActual,
          cantidadInput: defaultQtyInput(unidad),
          precio_venta: round2(producto.precio_venta || producto.precio_referencia || 0)
        }
      ];
    });
  }

  const updateItemCantidadInput = (productoId, unidad, rawValue) => {
    const normalized = sanitizeQtyInput(rawValue, unidad);
    setCarrito((prev) => prev.map((item) => (
      item.producto_id === productoId
        ? { ...item, cantidadInput: normalized }
        : item
    )));
  };

  const removeItem = (productoId) => {
    setCarrito((prev) => prev.filter((item) => item.producto_id !== productoId));
  };

  const resetVentaDraft = () => {
    setCarrito([]);
    setClienteSeleccionado(null);
    setDescuento('0');
    setSelectedPaymentCode(defaultCashPaymentCode);
    setLocalError('');
    setCheckoutModalOpen(false);
    setCheckoutConfirmPromptVisible(false);
    setCheckoutError('');
    setCashReceivedInput('');
    setTransferBank('');
    setTransferReference('');
    setTransferObservation('');
    setCreditType('PENDIENTE_TOTAL');
    setCreditAbonoInput('');
  };

  const closeSuccessToast = () => {
    setSuccessToast((current) => ({ ...current, open: false }));
  };

  const handleClearCliente = () => {
    setClienteSeleccionado(null);
    if (paymentRequiresClient(selectedPaymentCode)) {
      setSelectedPaymentCode(defaultCashPaymentCode);
    }
  };

  const openCheckoutModal = () => {
    setLocalError('');
    setCheckoutError('');

    if (!carritoConEstado.length) {
      setLocalError('Agrega al menos un producto al carrito');
      return;
    }

    if (hasInvalidItems) {
      const stockItem = carritoConEstado.find((item) => item.cantidadError === 'Stock insuficiente');
      if (stockItem) {
        setStockIssue({
          producto: stockItem.nombre,
          disponible: formatStock(stockItem.stock_actual, stockItem.unidad_medida),
          unidad: stockItem.unidad_medida
        });
        return;
      }
      setLocalError('Corrige cantidades invalidas en el carrito');
      return;
    }

    if (!selectedPaymentOption) {
      setLocalError('Selecciona un metodo de pago');
      return;
    }

    setCheckoutMethodCode(selectedPaymentCode);
    setCheckoutSubmitPhase('confirm');
    setCreditType('PENDIENTE_TOTAL');
    setCreditAbonoInput('');
    setCashReceivedInput('');
    setTransferBank('');
    setTransferReference('');
    setTransferObservation('');
    setCheckoutModalOpen(true);
    setCheckoutConfirmPromptVisible(false);
  };

  const clearMethodSpecificFields = (methodCode) => {
    if (methodCode === PAYMENT_CODES.EFECTIVO) {
      setCashReceivedInput('');
      return;
    }
    if (methodCode === PAYMENT_CODES.TRANSFERENCIA) {
      setTransferBank('');
      setTransferReference('');
      setTransferObservation('');
      return;
    }
    if (methodCode === PAYMENT_CODES.CREDITO_CLIENTE) {
      setCreditType('PENDIENTE_TOTAL');
      setCreditAbonoInput('');
    }
  };

  const handleCheckoutMethodChange = (nextMethodCode) => {
    if (nextMethodCode === checkoutMethodCode) return;
    clearMethodSpecificFields(checkoutMethodCode);
    setCheckoutMethodCode(nextMethodCode);
    setCheckoutError('');
    setCheckoutConfirmPromptVisible(false);
  };

  const applyCashQuickAmount = (amount) => {
    setCashReceivedInput(Number(amount || 0).toFixed(2));
    setCheckoutError('');
    setCheckoutConfirmPromptVisible(false);
  };

  const closeCheckoutModal = () => {
    if (submitting) return;
    setCheckoutModalOpen(false);
    setCheckoutError('');
    setCheckoutSubmitPhase('confirm');
    setCheckoutConfirmPromptVisible(false);
  };

  const closeCheckoutConfirmModal = () => {
    if (submitting) return;
    setCheckoutConfirmPromptVisible(false);
  };

  const handleCheckoutPrimaryAction = () => {
    if (!checkoutCanConfirm) return;
    setCheckoutConfirmPromptVisible(true);
  };

  const handleCheckoutKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) return;
      event.preventDefault();
      if (checkoutCanConfirm) handleCheckoutPrimaryAction();
    }
  };

  const submitVenta = async () => {
    if (!checkoutCanConfirm) return;
    setCheckoutError('');
    setCheckoutSubmitPhase('confirm');

    const freshRuntime = await cargarConfiguracionTodo().catch(() => null);
    const effectiveConfig = freshRuntime?.config || configuracion;
    const effectiveRounding = normalizeRoundingConfig(effectiveConfig);
    const recalculatedSubtotalCentavos = carritoConEstado.reduce((acc, item) => {
      const precioUnitFinal = round2(redondearPrecioVenta(item.precio_venta, effectiveRounding));
      return acc + moneyToCents(Number(item.cantidad || 0) * precioUnitFinal);
    }, 0);
    const recalculatedTotalCentavos = Math.max(0, recalculatedSubtotalCentavos - moneyToCents(descuentoValue));
    const effectiveTotal = centsToMoney(recalculatedTotalCentavos);

    const methodCode = checkoutMethodCode;
    setSelectedPaymentCode(methodCode);
    const isCredito = methodCode === PAYMENT_CODES.CREDITO_CLIENTE;
    const isTransfer = methodCode === PAYMENT_CODES.TRANSFERENCIA;
    const isEfectivo = methodCode === PAYMENT_CODES.EFECTIVO;

    if (!paymentOptions.some((option) => option.codigo === methodCode)) {
      setCheckoutError('Selecciona un metodo de pago valido');
      return;
    }

    if (isCredito && !clienteSeleccionado) {
      setCheckoutError('Se requiere un cliente para vender a credito');
      return;
    }

    if (isCredito && !clienteSeleccionado?.id) {
      setCheckoutError('No se puede usar credito con Consumidor final');
      return;
    }

    const checkoutRequiresCashShift = isEfectivo || (isCredito && creditType === 'ABONO_PARCIAL');
    if (configuracion?.exigir_caja_abierta_para_cobros && checkoutRequiresCashShift && !cajaAbierta) {
      setCheckoutModalOpen(false);
      setCajaRequiredModalOpen(true);
      return;
    }

    const pagos = { contado: 0, transferencia: 0, credito: 0 };
    const cobro = {};
    let referencia = undefined;
    let observacion = undefined;

    if (isEfectivo) {
      if (cashReceivedValue <= 0) {
        setCheckoutError('Ingresa el monto recibido');
        return;
      }
      if (cashReceivedValue < effectiveTotal) {
        setCheckoutError('El monto recibido debe ser mayor o igual al total');
        return;
      }
      pagos.contado = effectiveTotal;
      cobro.efectivo = {
        monto_recibido: round2(cashReceivedValue),
        cambio: round2(centsToMoney(Math.max(0, moneyToCents(cashReceivedValue) - recalculatedTotalCentavos)))
      };
    } else if (isTransfer) {
      if (!transferBank.trim()) {
        setCheckoutError('Ingresa el banco o metodo de transferencia');
        return;
      }
      pagos.transferencia = effectiveTotal;
      referencia = transferReference.trim() || undefined;
      observacion = [
        `Banco: ${transferBank.trim()}`,
        transferObservation.trim() ? `Obs: ${transferObservation.trim()}` : ''
      ].filter(Boolean).join(' | ');
      cobro.transferencia = {
        banco: transferBank.trim(),
        referencia: transferReference.trim() || undefined,
        observacion: transferObservation.trim() || undefined
      };
    } else {
      if (creditType === 'ABONO_PARCIAL') {
        if (creditAbonoValue <= 0) {
          setCheckoutError('Ingresa un monto abonado mayor a 0');
          return;
        }
        if (creditAbonoValue >= effectiveTotal) {
          setCheckoutError('El abono parcial debe ser menor al total');
          return;
        }
        pagos.contado = creditAbonoValue;
        pagos.credito = centsToMoney(Math.max(0, recalculatedTotalCentavos - moneyToCents(creditAbonoValue)));
        cobro.credito = {
          tipo_credito: 'ABONO_PARCIAL',
          monto_abonado: round2(creditAbonoValue),
          saldo_pendiente: round2(centsToMoney(Math.max(0, recalculatedTotalCentavos - moneyToCents(creditAbonoValue))))
        };
      } else {
        pagos.credito = effectiveTotal;
        cobro.credito = {
          tipo_credito: 'PENDIENTE_TOTAL',
          monto_abonado: 0,
          saldo_pendiente: round2(effectiveTotal)
        };
      }
    }

    const payload = buildVentaCreatePayload({
      clienteId: clienteSeleccionado?.id ?? null,
      items: carritoConEstado.map((item) => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad
      })),
      descuentoTotal: descuentoValue,
      paymentCode: methodCode,
      total: effectiveTotal,
      pagosInput: pagos,
      cobro,
      referencia,
      observacion
    });

    setSubmitting(true);
    try {
      setCheckoutSubmitPhase('register');
      const totalVenta = effectiveTotal;
      const result = await crearVenta(payload);
      const ventaId = result?.venta?.id;
      if (ventaId && (effectiveConfig?.ticket_impresion_activa ?? true)) {
        try {
          await imprimirTicketVenta(ventaId);
          setPrintToast({ open: true, tone: 'success', text: 'Ticket enviado a impresion' });
        } catch (_) {
          setPrintToast({ open: true, tone: 'danger', text: 'No se pudo imprimir el ticket' });
        }
      }
      resetVentaDraft();
      await fetchTurnoActual({ silent: true }).catch(() => {});
      setSuccessToast({ open: true, total: totalVenta });
    } catch (error) {
      setCheckoutError(error?.message || 'No se pudo registrar la venta. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
      setCheckoutSubmitPhase('confirm');
    }
  };

  const clienteLabel = clienteSeleccionado?.nombre || 'Consumidor final';
  const metodoPagoLabel = (codigo, nombre) => (codigo === PAYMENT_CODES.CREDITO_CLIENTE ? 'Crédito' : nombre);

  return (
    <div className="sales-page-layout sales-page-shell flex h-full min-h-0 flex-col gap-1 overflow-hidden p-1 sm:p-1.5 lg:p-2">
      <PageHeader className="mb-2"
        title="Nueva venta"
        description="Busca productos, agrega al carrito y cobra la venta."
      />

      {(localError || errorVenta || catalogError) && (
        <Alert tone="error" className="shrink-0">
          {localError || errorVenta || catalogError}
        </Alert>
      )}

      {!paymentOptions.length && (
        <Alert tone="warning" className="shrink-0">
          No hay metodos de pago habilitados para ventas en la configuracion actual.
        </Alert>
      )}

      <div className="flex-1 min-h-0 grid gap-1.5 lg:grid-cols-[1fr_1.35fr]">
        <Card className="min-h-0 border-[color-mix(in_oklab,var(--color-border)_65%,transparent)] p-2 shadow-none">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-2">
              <p className="font-semibold text-[var(--color-text)]">Buscar producto</p>

              <div className="flex items-center gap-2">
                <Input
                  className="min-w-0 flex-1"
                  placeholder="Buscar por nombre, codigo o SKU"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => setSearchTerm('')}
                >
                  Limpiar
                </Button>
              </div>

              <div className="overflow-x-auto">
                <div className="inline-flex min-h-10 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1 mt-2 mb-1">
                  {categorias.map((categoria) => (
                    <button
                      key={categoria.id}
                      type="button"
                      className={`min-h-8 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                        categoriaActiva === categoria.id
                          ? 'bg-[var(--color-text)] text-white shadow-sm'
                          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
                      }`}
                      onClick={() => setCategoriaActiva(categoria.id)}
                    >
                      {categoria.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="font-semibold text-[var(--color-text)]">Productos</p>
                {debouncedSearch && (
                  <p className="text-xs text-[var(--color-text-muted)]">Resultados: {productosMostrados.length}</p>
                )}
              </div>

              {loadingCatalogo && <p className="text-sm text-[var(--color-text-muted)]">Cargando productos...</p>}
            </div>

            <div
              ref={productListViewportRef}
              onScroll={(event) => setProductScrollTop(event.currentTarget.scrollTop)}
              className="flex-1 min-h-0 overflow-auto pt-1.5 pr-1 pb-1"
            >
              {!loadingCatalogo && productosMostrados.length === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] px-4 py-6 text-center">
                  <p className="text-sm font-semibold text-[var(--color-text)]">No se encontraron productos.</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Prueba con otro nombre, codigo o categoria.
                  </p>
                </div>
              )}

              <div style={{ height: `${virtualProductWindow.totalHeight}px`, position: 'relative' }}>
                <div style={{ paddingTop: `${virtualProductWindow.topPad}px`, paddingBottom: `${virtualProductWindow.bottomPad}px` }} className="space-y-1.5">
                  {renderedProductRows}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="relative min-h-0 overflow-hidden border-[color-mix(in_oklab,var(--color-border)_65%,transparent)] p-0 shadow-none">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-[color-mix(in_oklab,var(--color-border)_75%,transparent)] bg-[var(--color-surface-alt)] px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-lg font-medium text-[var(--color-text)]">Cliente: {clienteLabel}</p>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-[var(--color-text)]">Carrito:</h3>
                    <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-sm font-semibold text-[var(--color-text-muted)]">
                      {carrito.length} items
                    </span>
                  </div>
                </div>

                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  {clienteSeleccionado ? (
                    <Button type="button" variant="ghost" size="sm" onClick={handleClearCliente}>
                      Quitar cliente
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" size="sm" onClick={() => setModalFacturaOpen(true)}>
                    Buscar cliente
                  </Button>
                </div>
              </div>
            </div>

            <div className={`flex-[0.88] min-h-0 overflow-auto bg-[var(--color-surface)] px-2 py-2 ${
              carritoConEstado.length === 0 ? 'pb-2' : 'pb-24'
            }`}>
              {carritoConEstado.length === 0 ? (
                <div className="flex h-full min-h-full flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] px-6 text-center">
                  <p className="text-base font-semibold text-[var(--color-text)]">El carrito esta vacio.</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Agrega productos para iniciar la venta.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {renderedCarritoRows}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 flex-[0.12] shrink-0 border-t border-[color-mix(in_oklab,var(--color-border)_75%,transparent)] bg-[var(--color-surface-alt)] p-3">
              <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,290px)]">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Descuento</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-9"
                      value={descuento}
                      onChange={(e) => setDescuento(sanitizeDecimalInput(e.target.value, 2))}
                    />
                  </div>
                </div>

                <div className="ml-auto w-full max-w-[300px] rounded-lg border border-[color-mix(in_oklab,var(--color-border)_70%,transparent)] bg-[var(--color-surface)] px-3 py-2.5 text-right">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                      <span>Subtotal</span>
                      <span className="font-semibold text-[var(--color-text)]">{formatMoney(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                      <span>Descuento</span>
                      <span className="font-semibold text-[var(--color-text)]">{formatMoney(descuentoValue)}</span>
                    </div>
                    <div className="mt-1 border-t border-[var(--color-border)] pt-2">
                      <p className="text-[10px] font-semibold tracking-wider text-[var(--color-text-muted)]">TOTAL</p>
                      <p className="text-3xl font-black leading-none text-[var(--color-text)]">{formatMoney(total)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
                <Button type="button" size="sm" variant="secondary" onClick={resetVentaDraft}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  className="min-w-[150px] px-4 py-1.5 text-sm font-semibold"
                  disabled={ventaActionDisabled}
                  onClick={openCheckoutModal}
                >
                  {submitting ? 'Procesando...' : 'Cobrar'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
      
      <Modal open={checkoutModalOpen} onClose={() => {}} maxWidthClass="max-w-2xl" panelClassName="p-0">
        <div className="max-h-[86vh] overflow-y-auto" onKeyDown={handleCheckoutKeyDown}>
          <div className="space-y-3 p-4 sm:p-5">
          <div className="ui-modal-header">
            <div className="relative w-full flex justify-between">
              <div className="ui-modal-header-copy pr-10">
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Cobrar venta</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                onClick={closeCheckoutModal}
                aria-label="Cerrar modal de cobro"
                icon={<PiX className="text-lg" />}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-[var(--color-text-muted)]">
                Cliente: <span className="font-semibold text-[var(--color-text)]">{clienteLabel}</span>
              </p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setModalFacturaOpen(true)}>
                Cambiar
              </Button>
            </div>
            <div className="mt-3 border-t border-[var(--color-border)] pt-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Total a pagar</p>
              <p className="mt-1 text-4xl font-black leading-none text-[var(--color-text)]">{formatMoney(total)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Metodo de pago</p>
            <div className="flex flex-wrap gap-2">
              {paymentOptions.map((option) => (
                <Button
                  key={option.codigo}
                  type="button"
                  size="sm"
                  variant={checkoutMethodCode === option.codigo ? 'primary' : 'secondary'}
                  onClick={() => handleCheckoutMethodChange(option.codigo)}
                >
                  {metodoPagoLabel(option.codigo, option.nombre)}
                </Button>
              ))}
            </div>
          </div>

          {checkoutMethodIsEfectivo ? (
            <section className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
              <p className="text-sm font-semibold text-[var(--color-text)]">Pago en efectivo</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Monto recibido</label>
                  <Input
                    ref={cashReceivedInputRef}
                    type="text"
                    inputMode="decimal"
                    value={cashReceivedInput}
                    onChange={(e) => setCashReceivedInput(sanitizeDecimalInput(e.target.value, 2))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Cambio</label>
                  <div className="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-right">
                    <p className="text-2xl font-black leading-none text-[var(--color-text)]">{formatMoney(cashChangeValue)}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => applyCashQuickAmount(total)}>
                  Exacto
                </Button>
                {cashQuickAmounts.map((amount) => (
                  <Button key={amount} type="button" size="sm" variant="secondary" onClick={() => applyCashQuickAmount(amount)}>
                    {formatMoney(amount)}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}

          {checkoutMethodIsTransfer ? (
            <section className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
              <p className="text-sm font-semibold text-[var(--color-text)]">Pago por transferencia</p>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Banco o metodo</label>
                <select
                  className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--color-brand)_25%,transparent)]"
                  value={transferBank}
                  onChange={(e) => setTransferBank(e.target.value)}
                >
                  <option value="">Selecciona banco</option>
                  <option value="Banco del Pichincha">Banco del Pichincha</option>
                  <option value="Banco del Pacifico">Banco del Pacifico</option>
                  <option value="Banco del Austro">Banco del Austro</option>
                  <option value="Banco de Guayaquil">Banco de Guayaquil</option>
                  <option value="Produbanco">Produbanco</option>
                  <option value="Banco Bolivariano">Banco Bolivariano</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Numero de referencia (opcional)</label>
                <Input value={transferReference} onChange={(e) => setTransferReference(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Observacion (opcional)</label>
                <Input value={transferObservation} onChange={(e) => setTransferObservation(e.target.value)} />
              </div>
            </section>
          ) : null}

          {checkoutMethodIsCredito ? (
            <section className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
              <p className="text-sm font-semibold text-[var(--color-text)]">Venta a credito</p>
              <p className="text-sm text-[var(--color-text-muted)]">
                Cliente: <span className="font-semibold text-[var(--color-text)]">{clienteLabel}</span>
              </p>
              {!clienteSeleccionado?.id ? (
                <p className="text-sm font-semibold text-[var(--color-danger)]">Se requiere un cliente para vender a credito.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={creditType === 'PENDIENTE_TOTAL' ? 'primary' : 'secondary'}
                  onClick={() => setCreditType('PENDIENTE_TOTAL')}
                >
                  Pendiente total
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={creditType === 'ABONO_PARCIAL' ? 'primary' : 'secondary'}
                  onClick={() => setCreditType('ABONO_PARCIAL')}
                >
                  Abono parcial
                </Button>
              </div>

              {creditType === 'ABONO_PARCIAL' ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Monto abonado</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={creditAbonoInput}
                      onChange={(e) => setCreditAbonoInput(sanitizeDecimalInput(e.target.value, 2))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Saldo restante</label>
                    <Input
                      type="text"
                      disabled
                      className="font-semibold text-[var(--color-text)] disabled:text-[var(--color-text)]"
                      value={formatMoney(creditSaldoPendiente)}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm font-medium text-[var(--color-text)]">Saldo pendiente: {formatMoney(total)}</p>
              )}
            </section>
          ) : null}

          {checkoutError ? <Alert tone="error">{checkoutError}</Alert> : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={closeCheckoutModal} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="primary" className="min-w-[230px]" disabled={!checkoutCanConfirm} onClick={handleCheckoutPrimaryAction}>
              {submitting ? checkoutPrimaryLoadingLabel : checkoutPrimaryLabel}
            </Button>
          </div>
        </div>
        </div>
      </Modal>

      <Modal open={checkoutConfirmPromptVisible} onClose={() => {}} maxWidthClass="max-w-lg" panelClassName="p-0">
        <div className="space-y-4 p-4 sm:p-5">
          <div className="ui-modal-header">
            <div className="relative w-full">
              <div className="ui-modal-header-copy pr-10">
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Confirmar cobro</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                onClick={closeCheckoutConfirmModal}
                aria-label="Cerrar confirmacion de cobro"
                icon={<PiX className="text-lg" />}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[color-mix(in_oklab,var(--color-brand)_28%,transparent)] bg-[color-mix(in_oklab,var(--color-brand-soft)_28%,white_72%)] p-3">
            {!clienteSeleccionado?.id ? (
              <p className="text-sm text-[var(--color-text)]">
                Se cobrara como <strong>Consumidor final</strong> por un total de <strong>{formatMoney(total)}</strong>.
              </p>
            ) : (
              <p className="text-sm text-[var(--color-text)]">
                Se cobrara a <strong>{clienteSeleccionado.nombre}</strong> por un total de <strong>{formatMoney(total)}</strong>.
              </p>
            )}

            {checkoutMethodIsEfectivo ? (
              <div className="mt-2 space-y-1 border-t border-[color-mix(in_oklab,var(--color-border)_72%,transparent)] pt-2 text-sm">
                <div className="flex items-center justify-between text-[var(--color-text)]">
                  <span>Recibido</span>
                  <strong>{formatMoney(cashReceivedValue)}</strong>
                </div>
                <div className="flex items-center justify-between text-[var(--color-text)]">
                  <span>Cambio</span>
                  <strong>{formatMoney(cashChangeValue)}</strong>
                </div>
              </div>
            ) : null}

            {checkoutMethodIsTransfer ? (
              <div className="mt-2 space-y-1 border-t border-[color-mix(in_oklab,var(--color-border)_72%,transparent)] pt-2 text-sm text-[var(--color-text)]">
                <div className="flex items-center justify-between gap-3">
                  <span>Banco</span>
                  <strong className="text-right">{transferBank || '-'}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Nro. transferencia</span>
                  <strong className="text-right">{transferReference || '-'}</strong>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span>Observacion</span>
                  <strong className="max-w-[60%] text-right font-semibold">{transferObservation || '-'}</strong>
                </div>
              </div>
            ) : null}

            {checkoutMethodIsCredito ? (
              <div className="mt-2 space-y-1 border-t border-[color-mix(in_oklab,var(--color-border)_72%,transparent)] pt-2 text-sm text-[var(--color-text)]">
                <div className="flex items-center justify-between gap-3">
                  <span>Tipo de credito</span>
                  <strong className="text-right">
                    {creditType === 'ABONO_PARCIAL' ? 'Abono parcial' : 'Pendiente total'}
                  </strong>
                </div>
                {creditType === 'ABONO_PARCIAL' ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span>Abono</span>
                      <strong className="text-right">{formatMoney(creditAbonoValue)}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Saldo pendiente</span>
                      <strong className="text-right">{formatMoney(creditSaldoPendiente)}</strong>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeCheckoutConfirmModal} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submitVenta} disabled={!checkoutCanConfirm || submitting}>
              {submitting ? checkoutPrimaryLoadingLabel : 'Cobrar'}
            </Button>
          </div>
        </div>
      </Modal>

      <Suspense fallback={null}>
        <FacturaModal
          open={modalFacturaOpen}
          onClose={() => setModalFacturaOpen(false)}
          onSelectCliente={(cliente) => {
            setClienteSeleccionado(cliente);
            setLocalError('');
          }}
        />
      </Suspense>

      {successToast.open ? (
        <div className="fixed right-5 top-5 z-[1200] max-w-sm">
          <button type="button" className="block w-full border-0 bg-transparent p-0 text-left" onClick={closeSuccessToast}>
            <Toast tone="success">
              Venta aprobada correctamente por {formatMoney(successToast.total)}.
            </Toast>
          </button>
        </div>
      ) : null}
      {printToast.open ? (
        <div className="fixed right-5 top-24 z-[1200] max-w-sm">
          <Toast tone={printToast.tone}>
            {printToast.text}
          </Toast>
        </div>
      ) : null}

      <Modal open={cajaRequiredModalOpen} onClose={() => setCajaRequiredModalOpen(false)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Turno de caja requerido</h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              La venta en efectivo requiere un turno de caja abierto. Transferencia y credito pueden registrarse sin afectar caja fisica.
            </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCajaRequiredModalOpen(false)}>
              Entendido
            </Button>
            <Button onClick={() => navigate('/caja')}>
              Ir a caja
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(stockIssue)} onClose={() => setStockIssue(null)} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div className="ui-modal-header">
            <div className="relative w-full">
              <div className="ui-modal-header-copy pr-10">
                <h3 className="text-lg font-semibold text-[var(--color-text)]">Stock insuficiente</h3>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  No hay stock suficiente para completar la venta del producto seleccionado.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                onClick={() => setStockIssue(null)}
                aria-label="Cerrar modal de stock insuficiente"
                icon={<PiX className="text-lg" />}
              />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-warning-soft)_40%,white_60%)] p-3 text-sm text-[var(--color-text)]">
            <p><strong>Producto:</strong> {stockIssue?.producto || '-'}</p>
            <p><strong>Disponible:</strong> {stockIssue?.disponible || '0'} {stockIssue?.unidad || ''}</p>
            <div className="mt-2">
              <span className="rounded-md bg-[color-mix(in_oklab,var(--color-warning-soft)_83%,white_17%)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-warning)]">
                BAJO STOCK
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setStockIssue(null)}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
