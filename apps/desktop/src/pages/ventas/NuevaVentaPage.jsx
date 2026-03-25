import { useEffect, useMemo, useRef, useState } from 'react';
import { PiX } from 'react-icons/pi';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient, { normalizeResponse } from '../../lib/apiClient';
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
  TablaCelda
} from '../../ui';
import FacturaModal from './FacturaModal';
import { getUnidad, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { useVentaCatalogo } from './hooks/useVentaCatalogo';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { printSaleTicketDocument } from './printTicket';

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function defaultQtyInput(unidad) {
  return getUnidad(unidad) === 'UND' ? '1' : '1.00';
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
  return getUnidad(unidad) === 'UND' ? String(Math.trunc(n)) : n.toFixed(2);
}

export default function NuevaVentaPage() {
  const navigate = useNavigate();
  const { id: ventaIdParam } = useParams();
  const isReadOnlyMode = Boolean(ventaIdParam);
  const ventaId = ventaIdParam ? Number(ventaIdParam) : null;
  const crearVenta = useVentasStore((s) => s.crear);
  const ventaDetalle = useVentasStore((s) => s.ventaDetalle);
  const ticketVenta = useVentasStore((s) => s.ticket);
  const detalleVenta = useVentasStore((s) => s.detalle);
  const cargarTicket = useVentasStore((s) => s.cargarTicket);
  const loadingVenta = useVentasStore((s) => s.loading);
  const errorVenta = useVentasStore((s) => s.error);
  const configuracion = useConfiguracionStore((s) => s.configuracion);
  const metodosPago = useConfiguracionStore((s) => s.metodosPago);
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
  } = useVentaCatalogo({ enabled: !isReadOnlyMode });

  const [carrito, setCarrito] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [modalFacturaOpen, setModalFacturaOpen] = useState(false);
  const [descuento, setDescuento] = useState('0');
  const [selectedPaymentCode, setSelectedPaymentCode] = useState('EFECTIVO');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [successModal, setSuccessModal] = useState({ open: false, total: 0, progress: 100 });
  const [selectedProductoIndex, setSelectedProductoIndex] = useState(-1);

  const productRefs = useRef([]);
  const currentVentaDetalle = !isReadOnlyMode || !ventaId || Number(ventaDetalle?.venta?.id) === ventaId ? ventaDetalle : null;
  const currentTicketVenta = !isReadOnlyMode || !ventaId || Number(ticketVenta?.venta?.id) === ventaId ? ticketVenta : null;

  const enabledPaymentMethods = useMemo(() => {
    const defaults = [
      { codigo: 'EFECTIVO', nombre: 'Efectivo', habilitado: true, es_efectivo: true },
      { codigo: 'TRANSFERENCIA', nombre: 'Transferencia', habilitado: true, es_efectivo: false },
      { codigo: 'CREDITO_CLIENTE', nombre: 'Credito cliente', habilitado: true, es_efectivo: false }
    ];

    const source = metodosPago.length ? metodosPago : defaults;
    return source.filter((method) => method.habilitado);
  }, [metodosPago]);

  const creditoHabilitado = Boolean(configuracion?.permitir_ventas_credito)
    && enabledPaymentMethods.some((method) => method.codigo === 'CREDITO_CLIENTE');

  const paymentOptions = useMemo(() => {
    return enabledPaymentMethods
      .filter((method) => {
        if (method.codigo === 'CREDITO_CLIENTE') return Boolean(clienteSeleccionado) && creditoHabilitado;
        return true;
      })
      .map((method) => ({
        value: method.codigo,
        label: method.nombre,
        ventaMode: method.codigo === 'CREDITO_CLIENTE' ? 'CREDITO' : 'CONTADO',
        isCash: Boolean(method.es_efectivo)
      }));
  }, [clienteSeleccionado, creditoHabilitado, enabledPaymentMethods]);

  useEffect(() => {
    if (isReadOnlyMode) return;
    if (!paymentOptions.length) return;
    if (!paymentOptions.some((option) => option.value === selectedPaymentCode)) {
      setSelectedPaymentCode(paymentOptions[0].value);
    }
  }, [isReadOnlyMode, paymentOptions, selectedPaymentCode]);

  useEffect(() => {
    if (!isReadOnlyMode || !ventaId) return;
    detalleVenta(ventaId);
    cargarTicket(ventaId);
  }, [cargarTicket, detalleVenta, isReadOnlyMode, ventaId]);

  useEffect(() => {
    if (!isReadOnlyMode || !currentVentaDetalle?.detalle) return;

    setCarrito(
      currentVentaDetalle.detalle.map((item) => {
        const unidad = getUnidad(item.unidad_medida || item.unidad);
        const cantidad = Number(item.cantidad || 0);
        return {
          producto_id: item.producto_id,
          codigo: item.producto_codigo,
          nombre: item.producto_nombre,
          unidad_medida: unidad,
          stock_actual: Number(item.stock_actual || cantidad),
          cantidadInput: unidad === 'UND' ? String(Math.trunc(cantidad)) : Number(cantidad).toFixed(2),
          precio_venta: round2(item.precio_unit || 0)
        };
      })
    );
    setClienteSeleccionado(currentVentaDetalle.venta?.cliente || null);
    setDescuento(String(round2(currentVentaDetalle.venta?.descuento_total || 0)));
  }, [currentVentaDetalle, isReadOnlyMode]);

  useEffect(() => {
    if (!isReadOnlyMode || !currentTicketVenta) return;

    const ticketCode = String(currentTicketVenta.codigo_metodo_pago || '').trim().toUpperCase();
    if (ticketCode) {
      setSelectedPaymentCode(ticketCode);
      return;
    }

    const metodo = String(currentTicketVenta.metodo_pago || '').trim().toUpperCase();
    if (metodo === 'CREDITO') {
      setSelectedPaymentCode('CREDITO_CLIENTE');
      return;
    }
    if (metodo === 'TRANSFERENCIA') {
      setSelectedPaymentCode('TRANSFERENCIA');
      return;
    }
    setSelectedPaymentCode('EFECTIVO');
  }, [currentTicketVenta, isReadOnlyMode]);

  const selectedPaymentOption = useMemo(
    () => paymentOptions.find((option) => option.value === selectedPaymentCode) || null,
    [paymentOptions, selectedPaymentCode]
  );

  const ventaClienteLabel = String(
    currentTicketVenta?.cliente?.nombre
      || currentVentaDetalle?.venta?.cliente_nombre
      || clienteSeleccionado?.nombre
      || ''
  ).trim() || 'Consumidor final';

  const ventaFechaLabel = currentVentaDetalle?.venta?.fecha ? formatDateQuito(currentVentaDetalle.venta.fecha) : '-';
  const ventaMetodoLabel = String(currentTicketVenta?.metodo_pago || selectedPaymentOption?.label || '-');

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/ventas');
  };

  const carritoConEstado = useMemo(
    () =>
      carrito.map((item) => {
        const unidad = item.unidad_medida;
        const qtyValue = parseQtyByUnidad(item.cantidadInput, unidad);

        let cantidadError = '';
        if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
          cantidadError = 'Cantidad invalida';
        } else if (unidad === 'UND' && !Number.isInteger(qtyValue)) {
          cantidadError = 'UND solo permite enteros';
        } else if (!isReadOnlyMode && qtyValue > Number(item.stock_actual || 0)) {
          cantidadError = 'Stock insuficiente';
        }

        const cantidad = !cantidadError ? (unidad === 'UND' ? Math.trunc(qtyValue) : round2(qtyValue)) : 0;
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
    [carrito, isReadOnlyMode]
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
    [subtotal, descuentoValue]
  );

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
    if (!successModal.open) return undefined;

    const duration = 3000;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, duration - elapsed);
      const progress = (remaining / duration) * 100;

      if (remaining <= 0) {
        window.clearInterval(interval);
        setSuccessModal((current) => (
          current.open
            ? { ...current, open: false, progress: 0 }
            : current
        ));
        return;
      }

      setSuccessModal((current) => (
        current.open
          ? { ...current, progress }
          : current
      ));
    }, 50);

    return () => window.clearInterval(interval);
  }, [successModal.open]);

  const addProductoToCarrito = (producto) => {
    const unidad = getUnidad(producto.unidad_medida || producto.unidad);
    const qtyToAdd = 1;
    const stockActual = Number(producto.stock_actual || 0);

    setLocalError('');
    setCarrito((prev) => {
      const existing = prev.find((item) => item.producto_id === producto.id);

      if (existing) {
        const existingQty = parseQtyByUnidad(existing.cantidadInput, unidad);
        const newQty = (Number.isFinite(existingQty) ? existingQty : 0) + qtyToAdd;
        if (newQty > stockActual) {
          setLocalError(`Stock insuficiente para ${producto.codigo}`);
          return prev;
        }

        return prev.map((item) =>
          item.producto_id === producto.id
            ? { ...item, cantidadInput: unidad === 'UND' ? String(newQty) : Number(newQty).toFixed(2) }
            : item
        );
      }

      if (qtyToAdd > stockActual) {
        setLocalError(`Stock insuficiente para ${producto.codigo}`);
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
    setCarrito((prev) =>
      prev.map((item) =>
        item.producto_id === productoId
          ? { ...item, cantidadInput: normalized }
          : item
      )
    );
  };

  const removeItem = (productoId) => {
    setCarrito((prev) => prev.filter((item) => item.producto_id !== productoId));
  };

  const resetVentaDraft = () => {
    setCarrito([]);
    setClienteSeleccionado(null);
    setDescuento('0');
    setSelectedPaymentCode(paymentOptions[0]?.value || 'EFECTIVO');
    setLocalError('');
  };

  const closeSuccessModal = () => {
    setSuccessModal((current) => ({ ...current, open: false, progress: 0 }));
  };

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

  const submitVenta = async () => {
    setLocalError('');

    if (!carritoConEstado.length) {
      setLocalError('Agrega al menos un producto al carrito');
      return;
    }

    if (hasInvalidItems) {
      setLocalError('Corrige cantidades invalidas en el carrito');
      return;
    }

    if (!selectedPaymentCode || !selectedPaymentOption) {
      setLocalError('Selecciona un metodo de pago');
      return;
    }

    if (selectedPaymentOption.ventaMode === 'CREDITO') {
      if (!creditoHabilitado) {
        setLocalError('El credito cliente esta deshabilitado en la configuracion');
        return;
      }
      if (!clienteSeleccionado) {
        setLocalError('Selecciona un cliente antes de vender a credito');
        return;
      }
    }

    const contadoValue = selectedPaymentOption.ventaMode === 'CONTADO' ? total : 0;
    const creditoValue = selectedPaymentOption.ventaMode === 'CREDITO' ? total : 0;

    const payload = {
      cliente_id: clienteSeleccionado?.id ?? null,
      items: carritoConEstado.map((item) => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad
      })),
      pagos: {
        metodo: selectedPaymentOption.ventaMode,
        codigo: selectedPaymentCode,
        contado: contadoValue,
        credito: creditoValue
      },
      descuento_total: descuentoValue
    };

    setSubmitting(true);
    try {
      const totalVenta = total;
      const result = await crearVenta(payload);
      const ventaId = result?.venta?.id;
      if (ventaId) {
        const ticketResponse = await apiClient.get(`/api/ventas/${ventaId}/ticket`);
        const ticketData = normalizeResponse(ticketResponse.data);
        printSaleTicketDocument(ticketData, { metodoLabel: selectedPaymentOption.label });
      }
      resetVentaDraft();
      setSuccessModal({ open: true, total: totalVenta, progress: 100 });
    } catch (_) {
      // handled by store
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sales-page-layout sales-page-shell flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      {isReadOnlyMode && (
        <div className="shrink-0">
          <Button type="button" variant="ghost" onClick={handleGoBack}>
            ← Volver
          </Button>
        </div>
      )}

      <PageHeader
        title={isReadOnlyMode ? `Detalle de venta #${currentVentaDetalle?.venta?.id || ventaId || ''}` : 'Nueva venta'}
        description={isReadOnlyMode ? 'Vista en modo lectura del comprobante registrado.' : 'Busca productos, arma el carrito y procesa el cobro.'}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <span className="ui-badge ui-badge-neutral px-3 py-1 text-sm">
              Cliente: {ventaClienteLabel}
            </span>
            {!isReadOnlyMode && clienteSeleccionado && (
              <Button type="button" variant="ghost" onClick={() => setClienteSeleccionado(null)}>
                Quitar cliente
              </Button>
            )}
            {isReadOnlyMode ? (
              <Button type="button" variant="secondary" onClick={() => currentTicketVenta && printSaleTicketDocument(currentTicketVenta)} disabled={!currentTicketVenta}>
                Imprimir ticket
              </Button>
            ) : (
              <Button type="button" onClick={() => setModalFacturaOpen(true)}>
                Factura
              </Button>
            )}
          </div>
        )}
      />

      {(localError || errorVenta || catalogError) && (
        <Alert tone="error" className="shrink-0">
          {localError || errorVenta || catalogError}
        </Alert>
      )}

      {!isReadOnlyMode && !paymentOptions.length && (
        <Alert tone="warning" className="shrink-0">
          No hay metodos de pago compatibles habilitados para esta venta.
        </Alert>
      )}

      {isReadOnlyMode && loadingVenta && !currentVentaDetalle && (
        <Alert tone="info" className="shrink-0">
          Cargando detalle de la venta...
        </Alert>
      )}

      <div className="flex-1 min-h-0 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <Card className="min-h-0 p-4">
          {isReadOnlyMode ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 space-y-3">
                <p className="font-semibold text-[var(--color-text)]">Resumen de venta</p>
              </div>

              <div className="mt-2 flex-1 min-h-0 overflow-auto">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Cliente</p>
                    <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{ventaClienteLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Fecha</p>
                    <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{ventaFechaLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Método de pago</p>
                    <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{ventaMetodoLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Referencia</p>
                    <p className="mt-2 text-base font-semibold text-[var(--color-text)]">{currentVentaDetalle?.venta?.referencia || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
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
                  {debouncedSearch && <p className="text-xs text-[var(--color-text-muted)]">Resultados: {productosMostrados.length}</p>}
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
                                {formatMoney(producto.precio_referencia || producto.precio_venta || 0)}
                              </p>
                              <p className="text-xs text-[var(--color-text-muted)]">P. unit</p>
                            </div>
                            <Button type="button" variant="primary" size="sm" onClick={(event) => {
                              event.stopPropagation();
                              addProductoToCarrito(producto);
                            }}>
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
          )}
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
                    <TablaCelda as="th" className="w-[118px]">Cant</TablaCelda>
                    <TablaCelda as="th" className="text-right">P. unit</TablaCelda>
                    <TablaCelda as="th" className="text-right">Subtotal</TablaCelda>
                    {!isReadOnlyMode && <TablaCelda as="th" className="w-[64px] text-center">Accion</TablaCelda>}
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {carritoConEstado.length === 0 && (
                    <TablaFila>
                      <TablaCelda colSpan={isReadOnlyMode ? 4 : 5} className="text-center text-[var(--color-text-muted)]">
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
                        {isReadOnlyMode ? (
                          <div className="inline-flex min-w-[108px] items-center gap-2 px-1 py-2 text-sm font-semibold text-[var(--color-text)]">
                            <span>{item.cantidadInput}</span>
                            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                              {item.unidad_medida}
                            </span>
                          </div>
                        ) : (
                          <div className="flex min-w-[108px] items-center gap-2">
                            <Input
                              type="text"
                              inputMode={item.unidad_medida === 'UND' ? 'numeric' : 'decimal'}
                              className="w-[4.5rem] px-2 py-1 text-sm"
                              value={item.cantidadInput}
                              onChange={(e) => updateItemCantidadInput(item.producto_id, item.unidad_medida, e.target.value)}
                            />
                            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                              {item.unidad_medida}
                            </span>
                          </div>
                        )}
                        {item.cantidadError && <p className="mt-1 text-[11px] text-[var(--color-danger)]">{item.cantidadError}</p>}
                      </TablaCelda>
                      <TablaCelda className="text-right">
                        <div className="inline-flex min-w-[75px] justify-end px-1 py-2 text-right text-sm font-semibold text-[var(--color-text)]">
                          {formatMoney(item.precio)}
                        </div>
                      </TablaCelda>
                      <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                        <div className="inline-flex min-w-[75px] justify-end px-1 py-2 text-right text-sm font-semibold text-[var(--color-text)]">

                        {formatMoney(item.subtotal)}
                        </div>
                      </TablaCelda>
                      {!isReadOnlyMode && (
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
                            <span className="text-xl font-extrabold leading-none text-current">×</span>
                          </Button>
                        </TablaCelda>
                      )}
                    </TablaFila>
                  ))}
                </TablaCuerpo>
              </Tabla>
            </div>

            <div className="mt-3 shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-[var(--color-text)]">Metodo de pago</label>
                    {isReadOnlyMode ? (
                      <div className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm font-medium text-[var(--color-text)]">
                        {ventaMetodoLabel}
                      </div>
                    ) : (
                      <Select value={selectedPaymentCode} onChange={(e) => setSelectedPaymentCode(e.target.value)} disabled={!paymentOptions.length}>
                        {paymentOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-[var(--color-text)]">Descuento</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={descuento}
                      disabled={isReadOnlyMode}
                      onChange={(e) => setDescuento(sanitizeDecimalInput(e.target.value, 2))}
                    />
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

              {isReadOnlyMode ? (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={handleGoBack}>
                    Volver
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={resetVentaDraft}>
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="cashier"
                    disabled={submitting || !carritoConEstado.length || hasInvalidItems || !paymentOptions.length}
                    onClick={submitVenta}
                  >
                    {submitting ? 'Procesando...' : 'Cobrar'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {!isReadOnlyMode && (
        <FacturaModal
          open={modalFacturaOpen}
          onClose={() => setModalFacturaOpen(false)}
          onSelectCliente={(cliente) => {
            setClienteSeleccionado(cliente);
            if (selectedPaymentCode === 'CREDITO_CLIENTE') return;
            if (creditoHabilitado) setSelectedPaymentCode('CREDITO_CLIENTE');
          }}
        />
      )}

      <Modal open={!isReadOnlyMode && successModal.open} onClose={closeSuccessModal} maxWidthClass="max-w-md" panelClassName="overflow-hidden p-0">
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-[var(--color-text)]">La venta ha sido exitosa</h3>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Se registró correctamente el cobro por <span className="font-semibold text-emerald-600">{formatMoney(successModal.total)}</span>.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={closeSuccessModal}>
              X
            </Button>
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="button" variant="secondary" onClick={closeSuccessModal}>
              Cerrar
            </Button>
          </div>
        </div>

        <div className="h-3 w-full bg-emerald-100">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${successModal.progress}%` }}
          />
        </div>
      </Modal>
    </div>
  );
}
