import { useEffect, useMemo, useRef, useState } from 'react';
import { PiX } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { useVentasStore } from '../../stores/ventasStore';
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  PageHeader,
  Select,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
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

  return (
    <div className="sales-page-layout sales-page-shell flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <PageHeader
        title="Nueva venta"
        description="Busca productos, arma el carrito y confirma el cobro usando el contrato vigente del backend."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                Cliente
              </p>
              <p className={`mt-1 text-[var(--color-text)] ${clienteSeleccionado ? 'text-lg font-bold' : 'text-sm font-semibold'}`}>
                {clienteSeleccionado?.nombre || 'Comprobante final'}
              </p>
            </div>
            {clienteSeleccionado && (
              <Button type="button" variant="secondary" onClick={handleClearCliente}>
                Quitar cliente
              </Button>
            )}
            <Button type="button" variant="primary" onClick={() => setModalFacturaOpen(true)}>
              Cliente / factura
            </Button>
          </div>
        )}
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

      {selectedPaymentOption && (
        <Alert tone={selectedPaymentOption.requiere_cliente || (!cajaAbierta && requiresOpenCashShift) ? 'warning' : 'info'} className="shrink-0">
          {selectedPaymentOption.requiere_cliente
            ? 'La venta a credito requiere cliente y no impacta caja fisica.'
            : paymentImpactsCash
              ? (cajaAbierta
                ? 'El pago en efectivo impacta caja fisica y se registrara en el turno abierto.'
                : 'El pago en efectivo requiere un turno de caja abierto.')
              : 'Este metodo es informativo para caja: registra la venta pero no altera el saldo fisico.'}
        </Alert>
      )}

      <div className="flex-1 min-h-0 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="min-h-0 p-4">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-3">
              <p className="font-semibold text-[var(--color-text)]">Categorias</p>

              <div className="relative">
                <Input
                  className="pr-11"
                  placeholder="Buscar por codigo o nombre"
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

              <div className="flex flex-wrap gap-2">
                {categorias.map((categoria) => (
                  <Button
                    key={categoria.id}
                    type="button"
                    size="md"
                    variant={categoriaActiva === categoria.id ? 'primary' : 'secondary'}
                    className="min-h-11 rounded-xl px-4"
                    onClick={() => setCategoriaActiva(categoria.id)}
                  >
                    {categoria.nombre}
                  </Button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <p className="font-semibold text-[var(--color-text)]">Productos</p>
                {debouncedSearch && (
                  <p className="text-xs text-[var(--color-text-muted)]">Resultados: {productosMostrados.length}</p>
                )}
              </div>

              {loadingCatalogo && <p className="text-sm text-[var(--color-text-muted)]">Cargando productos...</p>}
            </div>

            <div className="flex-1 min-h-0 overflow-auto pt-2 pr-1">
              {!loadingCatalogo && productosMostrados.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">No hay productos para este filtro.</p>
              )}

              <div className="space-y-2">
                {productosMostrados.map((producto, index) => {
                  const unidad = getUnidad(producto.unidad_medida || producto.unidad);
                  const selected = index === selectedProductoIndex;

                  return (
                    <button
                      key={producto.id}
                      type="button"
                      ref={(node) => { productRefs.current[index] = node; }}
                      onMouseEnter={() => setSelectedProductoIndex(index)}
                      onClick={() => addProductoToCarrito(producto)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-[var(--color-brand)] bg-[var(--color-brand-soft)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                            {producto.codigo} - {producto.nombre}
                          </p>
                          <p className="text-sm text-[var(--color-text-muted)]">
                            {unidad} | Stock: {formatStock(producto.stock_actual, unidad)}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-[var(--color-text)]">
                              {formatMoney(producto.precio_venta || producto.precio_referencia || 0)}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">P. unit</p>
                          </div>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              addProductoToCarrito(producto);
                            }}
                          >
                            Agregar
                          </Button>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <Card className="min-h-0 p-4">
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <p className="font-semibold text-[var(--color-text)]">Carrito</p>
              <p className="text-sm font-medium text-[var(--color-text-muted)]">Items: {carrito.length}</p>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Producto</TablaCelda>
                    <TablaCelda as="th" className="w-[120px]">Cant</TablaCelda>
                    <TablaCelda as="th" className="text-right">P. unit</TablaCelda>
                    <TablaCelda as="th" className="text-right">Subtotal</TablaCelda>
                    <TablaCelda as="th" className="w-[64px] text-center">Accion</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {carritoConEstado.length === 0 && (
                    <TablaFila>
                      <TablaCelda colSpan={5} className="text-center text-[var(--color-text-muted)]">
                        Sin productos en carrito
                      </TablaCelda>
                    </TablaFila>
                  )}

                  {carritoConEstado.map((item) => (
                    <TablaFila key={item.producto_id} className="bg-[color-mix(in_oklab,var(--color-warning-soft)_45%,white_55%)]">
                      <TablaCelda>
                        <div className="min-w-[120px]">
                          <p className="font-medium text-[var(--color-text)]">{item.nombre}</p>
                        </div>
                      </TablaCelda>
                      <TablaCelda>
                        <div className="flex min-w-[108px] items-center gap-2">
                          <Input
                            type="text"
                            inputMode={item.unidad_medida === 'UND' ? 'numeric' : 'decimal'}
                            className="w-[4.75rem] px-2 py-1 text-sm"
                            value={item.cantidadInput}
                            onChange={(e) => updateItemCantidadInput(item.producto_id, item.unidad_medida, e.target.value)}
                          />
                          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            {item.unidad_medida}
                          </span>
                        </div>
                        {item.cantidadError && (
                          <p className="mt-1 text-[11px] text-[var(--color-danger)]">{item.cantidadError}</p>
                        )}
                      </TablaCelda>
                      <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                        {formatMoney(item.precio)}
                      </TablaCelda>
                      <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                        {formatMoney(item.subtotal)}
                      </TablaCelda>
                      <TablaCelda className="text-center">
                        <Button
                          type="button"
                          variant="iconDanger"
                          size="sm"
                          className="font-bold"
                          aria-label={`Quitar ${item.nombre}`}
                          title="Quitar"
                          onClick={() => removeItem(item.producto_id)}
                        >
                          <span className="text-xl font-extrabold leading-none text-current">x</span>
                        </Button>
                      </TablaCelda>
                    </TablaFila>
                  ))}
                </TablaCuerpo>
              </Tabla>
            </div>

            <div className="mt-3 shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-[var(--color-text)]">Metodo de pago</label>
                    <Select
                      value={selectedPaymentCode}
                      onChange={(e) => setSelectedPaymentCode(e.target.value)}
                      disabled={!paymentOptions.length}
                    >
                      {paymentOptions.map((option) => (
                        <option key={option.codigo} value={option.codigo}>
                          {option.nombre}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-[var(--color-text)]">Cliente</label>
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2.5 text-sm font-medium text-[var(--color-text)]">
                      {clienteSeleccionado?.nombre || 'Comprobante final'}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-[var(--color-text)]">Descuento</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={descuento}
                      onChange={(e) => setDescuento(sanitizeDecimalInput(e.target.value, 2))}
                    />
                  </div>

                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2.5 text-sm text-[var(--color-text-muted)]">
                    <p>
                      Metodo actual:{' '}
                      <strong className="text-[var(--color-text)]">{selectedPaymentOption?.nombre || '-'}</strong>
                    </p>
                    <p className="mt-1">
                      {paymentImpactsCash
                        ? 'Afecta caja fisica.'
                        : 'No afecta caja fisica, solo queda como referencia de cobro.'}
                    </p>
                    {selectedPaymentOption?.requiere_cliente ? (
                      <p className="mt-1 text-[var(--color-warning)]">El credito exige cliente asociado.</p>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2 text-right lg:pt-4">
                  <div className="flex items-center justify-end gap-6 text-sm text-[var(--color-text-muted)]">
                    <span>Subtotal</span>
                    <span className="min-w-[110px] font-semibold text-[var(--color-text)]">{formatMoney(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-end gap-6 text-sm text-[var(--color-text-muted)]">
                    <span>Descuento</span>
                    <span className="min-w-[110px] font-semibold text-[var(--color-text)]">{formatMoney(descuentoValue)}</span>
                  </div>
                  <div className="flex items-center justify-end gap-6 border-t border-[var(--color-border)] pt-3 text-base">
                    <span className="font-semibold text-[var(--color-text)]">Total</span>
                    <span className="min-w-[110px] text-2xl font-bold text-[var(--color-text)]">{formatMoney(total)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={resetVentaDraft}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant={paymentImpactsCash ? 'cashier' : 'primary'}
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
