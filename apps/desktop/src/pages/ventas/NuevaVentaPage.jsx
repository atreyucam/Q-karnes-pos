import { useEffect, useMemo, useRef, useState } from 'react';
import { PiTrash, PiX } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
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
import FacturaModal from './FacturaModal';
import { getUnidad, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';
import { formatMoney } from '../../lib/formatMoney';
import { useVentaCatalogo } from './hooks/useVentaCatalogo';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { printSaleTicketDocument } from './printTicket';
import { useCajaStore } from '../../stores/cajaStore';
import {
  PAYMENT_CODES,
  buildVentaCreatePayload,
  normalizePaymentMethods,
  paymentAffectsCash,
  paymentRequiresClient
} from './ventaUtils';

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
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
  return `${qty.toFixed(2)} ${unit}`;
}

export default function NuevaVentaPage() {
  const navigate = useNavigate();
  const crearVenta = useVentasStore((s) => s.crear);
  const cargarTicket = useVentasStore((s) => s.cargarTicket);
  const errorVenta = useVentasStore((s) => s.error);
  const configuracion = useConfiguracionStore((s) => s.configuracion);
  const metodosPago = useConfiguracionStore((s) => s.metodosPago);
  const turnoActual = useCajaStore((s) => s.turnoActual);
  const fetchTurnoActual = useCajaStore((s) => s.fetchTurnoActual);
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
  const [selectedProductoIndex, setSelectedProductoIndex] = useState(-1);
  const [cajaRequiredModalOpen, setCajaRequiredModalOpen] = useState(false);
  const [stockIssue, setStockIssue] = useState(null);

  const productRefs = useRef([]);

  const enabledPaymentMethods = useMemo(() => {
    const methods = normalizePaymentMethods(metodosPago);
    return methods.filter((method) => {
      if (method.codigo === PAYMENT_CODES.CREDITO_CLIENTE) {
        return Boolean(configuracion?.permitir_ventas_credito);
      }
      return true;
    });
  }, [configuracion?.permitir_ventas_credito, metodosPago]);

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
    if (selectedProductoIndex < 0) return;
    productRefs.current[selectedProductoIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedProductoIndex]);

  useEffect(() => {
    if (!successToast.open) return undefined;
    const timer = window.setTimeout(() => {
      setSuccessToast((current) => (current.open ? { ...current, open: false } : current));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [successToast.open]);

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
        ? (unidad === 'UND' ? Math.trunc(qtyValue) : round2(qtyValue))
        : 0;
      const precio = round2(item.precio_venta);

      return {
        ...item,
        cantidad,
        precio,
        subtotal: round2(cantidad * precio),
        cantidadError,
        invalido: Boolean(cantidadError)
      };
    }),
    [carrito]
  );

  const hasInvalidItems = carritoConEstado.some((item) => item.invalido);
  const subtotal = useMemo(
    () => round2(carritoConEstado.reduce((acc, item) => acc + item.subtotal, 0)),
    [carritoConEstado]
  );
  const descuentoValue = useMemo(() => {
    const value = parseDecimal(descuento);
    if (!Number.isFinite(value) || value < 0) return 0;
    return round2(value);
  }, [descuento]);
  const total = useMemo(
    () => Math.max(0, round2(subtotal - descuentoValue)),
    [descuentoValue, subtotal]
  );

  const ventaActionDisabled = submitting
    || !carritoConEstado.length
    || hasInvalidItems
    || !paymentOptions.length
    || (selectedPaymentOption?.requiere_cliente && !clienteSeleccionado);

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

  const addProductoToCarrito = (producto) => {
    const unidad = getUnidad(producto.unidad_medida || producto.unidad);
    const qtyToAdd = unidad === 'UND' ? 1 : 1;
    const stockActual = Number(producto.stock_actual || 0);

    setLocalError('');
    setCarrito((prev) => {
      const existing = prev.find((item) => item.producto_id === producto.id);

      if (existing) {
        const existingQty = parseQtyByUnidad(existing.cantidadInput, unidad);
        const newQty = round2((Number.isFinite(existingQty) ? existingQty : 0) + qtyToAdd);

        if (newQty > stockActual) {
          setStockIssue({
            producto: `${producto.codigo} - ${producto.nombre}`,
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
          producto: `${producto.codigo} - ${producto.nombre}`,
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
  };

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

  const submitVenta = async () => {
    setLocalError('');

    if (!carritoConEstado.length) {
      setLocalError('Agrega al menos un producto al carrito');
      return;
    }

    if (hasInvalidItems) {
      const stockItem = carritoConEstado.find((item) => item.cantidadError === 'Stock insuficiente');
      if (stockItem) {
        setStockIssue({
          producto: `${stockItem.codigo} - ${stockItem.nombre}`,
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

    if (selectedPaymentOption.requiere_cliente && !clienteSeleccionado) {
      setLocalError('Selecciona un cliente antes de registrar una venta a credito');
      return;
    }

    if (requiresOpenCashShift && !cajaAbierta) {
      setCajaRequiredModalOpen(true);
      return;
    }

    const payload = buildVentaCreatePayload({
      clienteId: clienteSeleccionado?.id ?? null,
      items: carritoConEstado.map((item) => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad
      })),
      descuentoTotal: descuentoValue,
      paymentCode: selectedPaymentCode,
      total
    });

    setSubmitting(true);
    try {
      const totalVenta = total;
      const result = await crearVenta(payload);
      const ventaId = result?.venta?.id;
      if (ventaId) {
        const ticketData = await cargarTicket(ventaId);
        printSaleTicketDocument(ticketData);
      }
      resetVentaDraft();
      await fetchTurnoActual({ silent: true }).catch(() => {});
      setSuccessToast({ open: true, total: totalVenta });
    } catch (_) {
      // handled by store
    } finally {
      setSubmitting(false);
    }
  };

  const clienteLabel = clienteSeleccionado?.nombre || 'Consumidor final';
  const metodoPagoLabel = (codigo, nombre) => (codigo === PAYMENT_CODES.CREDITO_CLIENTE ? 'Crédito' : nombre);

  return (
    <div className="sales-page-layout sales-page-shell flex h-full min-h-0 flex-col gap-1 overflow-hidden">
      <PageHeader
        title="Nueva venta"
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

      <div className="flex-1 min-h-0 grid gap-1.5 xl:grid-cols-[1fr_1.35fr]">
        <Card className="min-h-0 border-[color-mix(in_oklab,var(--color-border)_65%,transparent)] p-2 shadow-none">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-2">
              <p className="font-semibold text-[var(--color-text)]">Buscar producto</p>

              <div className="relative">
                <Input
                  className="pr-11"
                  placeholder="Buscar codigo o nombre"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                />
                {searchTerm ? (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                    onClick={() => setSearchTerm('')}
                    aria-label="Limpiar busqueda"
                  >
                    <PiX className="text-lg" />
                  </button>
                ) : null}
              </div>

              <div className="overflow-x-auto">
                <div className="inline-flex min-h-9 items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1">
                  {categorias.map((categoria) => (
                    <button
                      key={categoria.id}
                      type="button"
                      className={`min-h-7 rounded-lg px-3 text-xs font-semibold transition-colors ${
                        categoriaActiva === categoria.id
                          ? 'bg-[var(--color-brand)] text-white shadow-sm'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
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

            <div className="flex-1 min-h-0 overflow-auto pt-1.5 pr-1 pb-1">
              {!loadingCatalogo && productosMostrados.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">No hay productos para este filtro.</p>
              )}

              <div className="space-y-1.5">
                {productosMostrados.map((producto, index) => {
                  const unidad = getUnidad(producto.unidad_medida || producto.unidad);
                  const selected = index === selectedProductoIndex;
                  const stockActual = Number(producto.stock_actual || 0);
                  const stockMinimo = Number(producto.stock_minimo || 0);
                  const isOut = stockActual <= 0;
                  const isLow = !isOut && ((stockMinimo > 0 && stockActual <= stockMinimo) || stockActual <= 5);
                  const stockBadgeLabel = isOut ? 'Agotado' : (isLow ? 'Bajo' : null);
                  const stockBadgeClass = isOut
                    ? 'bg-[color-mix(in_oklab,var(--color-danger-soft)_70%,white_30%)] text-[var(--color-danger)]'
                    : isLow
                      ? 'bg-[color-mix(in_oklab,var(--color-warning-soft)_78%,white_22%)] text-[var(--color-warning)]'
                      : '';
                  const stateTintClass = isOut
                    ? 'bg-[color-mix(in_oklab,var(--color-danger-soft)_30%,white_70%)]'
                    : isLow
                      ? 'bg-[color-mix(in_oklab,var(--color-warning-soft)_35%,white_65%)]'
                      : 'bg-[var(--color-surface)]';

                  return (
                    <button
                      key={producto.id}
                      type="button"
                      ref={(node) => { productRefs.current[index] = node; }}
                      onMouseEnter={() => setSelectedProductoIndex(index)}
                      onClick={() => addProductoToCarrito(producto)}
                      className={`w-full rounded-lg border px-2.5 py-[7px] text-left transition-colors ${stateTintClass} ${
                        selected
                          ? 'border-[var(--color-border-strong)]'
                          : 'border-[var(--color-border)] hover:bg-[color-mix(in_oklab,var(--color-surface-muted)_65%,white_35%)]'
                      } ${isOut ? 'opacity-90' : ''}`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-semibold leading-tight text-[var(--color-text)]">
                            {producto.codigo} {producto.nombre}
                          </p>
                          <div className="shrink-0 flex items-center gap-2">
                            <p className="text-sm font-bold leading-none text-[var(--color-text)]">
                              {formatMoney(producto.precio_venta || producto.precio_referencia || 0)}
                            </p>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              className="-mt-0.5 min-h-6 px-0.5 py-0 text-[8px] leading-none"
                              disabled={isOut}
                              onClick={(event) => {
                                event.stopPropagation();
                                addProductoToCarrito(producto);
                              }}
                            >
                              Agregar
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <p className="text-sm text-[var(--color-text-muted)]">
                            Stock {formatStock(producto.stock_actual, unidad)} {unidad}
                          </p>
                          {isOut ? (
                            <span className="text-[11px] font-semibold text-[var(--color-danger)]">Sin stock</span>
                          ) : null}
                          {stockBadgeLabel ? (
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stockBadgeClass}`}>
                              {stockBadgeLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <Card className="relative min-h-0 overflow-hidden border-[color-mix(in_oklab,var(--color-border)_65%,transparent)] p-0 shadow-none">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-[color-mix(in_oklab,var(--color-border)_75%,transparent)] bg-[var(--color-surface-alt)] px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-[var(--color-text)]">Carrito</h3>
                    <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-muted)]">
                      {carrito.length} items
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Cliente: {clienteLabel}</p>
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

            <div className="flex-[0.88] min-h-0 overflow-auto bg-[var(--color-surface)] p-3 pb-1.5">
              {carritoConEstado.length === 0 ? (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] px-6 text-center">
                  <p className="text-base font-semibold text-[var(--color-text)]">Sin productos en el carrito</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    Busca un producto y presiona Agregar para comenzar
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {carritoConEstado.map((item) => (
                    <article
                      key={item.producto_id}
                      className={`rounded-lg border px-2.5 py-2 ${
                        item.cantidadError
                          ? 'border-[var(--color-danger)] bg-[color-mix(in_oklab,var(--color-danger-soft)_52%,white_48%)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface-alt)]'
                      }`}
                    >
                      <p className="truncate text-[15px] font-semibold text-[var(--color-text)]">{item.nombre}</p>

                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <Input
                            type="text"
                            inputMode={item.unidad_medida === 'UND' ? 'numeric' : 'decimal'}
                            className="h-7 w-[6ch] min-w-[6ch] rounded-md px-1.5 py-0 text-right text-xs font-semibold"
                            value={item.cantidadInput}
                            onChange={(e) => updateItemCantidadInput(item.producto_id, item.unidad_medida, e.target.value)}
                          />
                          <span className="font-semibold uppercase">{getUnidad(item.unidad_medida)}</span>
                          <span>x</span>
                          <span className="font-medium text-[var(--color-text)]">{formatMoney(item.precio)}</span>
                        </div>

                        <p className="ml-auto mr-2.5 shrink-0 text-right text-base font-bold text-[var(--color-text)]">
                          {formatMoney(item.subtotal)}
                        </p>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 border border-[color-mix(in_oklab,var(--color-danger)_25%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-soft)_42%,white_58%)] text-[color-mix(in_oklab,var(--color-danger)_72%,var(--color-text)_28%)] hover:bg-[color-mix(in_oklab,var(--color-danger-soft)_62%,white_38%)] hover:text-[var(--color-danger)]"
                          aria-label={`Quitar ${item.nombre}`}
                          title="Quitar"
                          onClick={() => removeItem(item.producto_id)}
                        >
                          <PiTrash className="text-base" />
                        </Button>
                      </div>

                      {item.cantidadError ? (
                        <p className="mt-2 text-xs font-semibold text-[var(--color-danger)]">{item.cantidadError}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 flex-[0.12] shrink-0 border-t border-[color-mix(in_oklab,var(--color-border)_75%,transparent)] bg-[var(--color-surface-alt)] p-3">
              <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,290px)]">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Metodo de pago</label>
                    <div className="flex flex-wrap gap-1.5">
                      {paymentOptions.map((option) => (
                        <Button
                          key={option.codigo}
                          type="button"
                          size="sm"
                          className="px-2.5 py-1 text-xs"
                          variant={selectedPaymentCode === option.codigo ? 'primary' : 'secondary'}
                          onClick={() => setSelectedPaymentCode(option.codigo)}
                        >
                          {metodoPagoLabel(option.codigo, option.nombre)}
                        </Button>
                      ))}
                    </div>
                    {selectedPaymentCode === PAYMENT_CODES.CREDITO_CLIENTE ? (
                      <p className="text-[13px] font-medium text-[var(--color-warning)]">
                        Debe seleccionar un cliente para usar credito.
                      </p>
                    ) : null}
                  </div>

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
                  variant={paymentImpactsCash ? 'cashier' : 'primary'}
                  className="min-w-[150px] px-4 py-1.5 text-sm font-semibold"
                  disabled={ventaActionDisabled}
                  onClick={submitVenta}
                >
                  {submitting ? 'Procesando...' : 'Cobrar'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
      
      <FacturaModal
        open={modalFacturaOpen}
        onClose={() => setModalFacturaOpen(false)}
        onSelectCliente={(cliente) => {
          setClienteSeleccionado(cliente);
          setLocalError('');
        }}
      />

      {successToast.open ? (
        <div className="fixed bottom-5 right-5 z-[1100] max-w-sm">
          <button type="button" className="block w-full border-0 bg-transparent p-0 text-left" onClick={closeSuccessToast}>
            <Toast tone="success">
              Venta aprobada correctamente por {formatMoney(successToast.total)}.
            </Toast>
          </button>
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
            <div className="ui-modal-header-copy">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Stock insuficiente</h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              No hay stock suficiente para completar la venta del producto seleccionado.
            </p>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-sm text-[var(--color-text)]">
            <p><strong>Producto:</strong> {stockIssue?.producto || '-'}</p>
            <p><strong>Disponible:</strong> {stockIssue?.disponible || '0'} {stockIssue?.unidad || ''}</p>
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
