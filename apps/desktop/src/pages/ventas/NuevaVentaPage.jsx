import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useVentasStore } from '../../stores/ventasStore';
import apiClient, { normalizeResponse } from '../../lib/apiClient';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import FacturaModal from './FacturaModal';
import { getUnidad, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function isAlmostEqual(a, b, tolerance = 0.01) {
  return Math.abs(round2(a) - round2(b)) <= tolerance;
}

function parseDecimal(value) {
  const text = String(value || '').replace(',', '.');
  if (text === '' || text === '.') return NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

function formatMoneyInput(value) {
  return round2(value).toFixed(2);
}

function defaultQtyInput(unidad) {
  return getUnidad(unidad) === 'UND' ? '1' : '1.00';
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
  const user = useAuthStore((s) => s.user);
  const crearVenta = useVentasStore((s) => s.crear);
  const errorVenta = useVentasStore((s) => s.error);

  const [categorias, setCategorias] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState(null);
  const [productosAll, setProductosAll] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [carrito, setCarrito] = useState([]);

  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [modalFacturaOpen, setModalFacturaOpen] = useState(false);

  const [descuento, setDescuento] = useState('0');
  const [contado, setContado] = useState('0');
  const [credito, setCredito] = useState('0');
  const [contadoTouched, setContadoTouched] = useState(false);
  const [creditoTouched, setCreditoTouched] = useState(false);

  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [successToast, setSuccessToast] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim().toLowerCase());
    }, 280);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    async function initCatalogo() {
      setLoadingCatalogo(true);
      setLocalError('');
      try {
        const [categoriasResp, productosResp] = await Promise.all([
          apiClient.get('/api/categorias'),
          apiClient.get('/api/productos', { params: { activo: 1 } })
        ]);

        const dataCategorias = normalizeResponse(categoriasResp.data) || [];
        const dataProductos = normalizeResponse(productosResp.data) || [];

        setCategorias(dataCategorias);
        setProductosAll(dataProductos);
        setCategoriaActiva(dataCategorias[0]?.id || null);
      } catch (error) {
        setLocalError(error?.response?.data?.error || 'No se pudo cargar catalogo');
      } finally {
        setLoadingCatalogo(false);
      }
    }

    initCatalogo();
  }, []);

  const productosMostrados = useMemo(() => {
    if (debouncedSearch) {
      return productosAll.filter((producto) => {
        const codigo = String(producto.codigo || '').toLowerCase();
        const nombre = String(producto.nombre || '').toLowerCase();
        return codigo.includes(debouncedSearch) || nombre.includes(debouncedSearch);
      });
    }

    return productosAll.filter((producto) => Number(producto.categoria_id) === Number(categoriaActiva));
  }, [productosAll, categoriaActiva, debouncedSearch]);

  const carritoConEstado = useMemo(
    () =>
      carrito.map((item) => {
        const unidad = item.unidad_medida;
        const qtyValue = parseQtyByUnidad(item.cantidadInput, unidad);
        const priceValue = parseDecimal(item.precioInput);

        let cantidadError = '';
        if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
          cantidadError = 'Cantidad invalida';
        } else if (unidad === 'UND' && !Number.isInteger(qtyValue)) {
          cantidadError = 'UND solo permite enteros';
        } else if (qtyValue > Number(item.stock_actual || 0)) {
          cantidadError = 'Stock insuficiente';
        }

        let precioError = '';
        if (!Number.isFinite(priceValue) || priceValue <= 0) {
          precioError = 'Precio invalido';
        }

        const cantidad = !cantidadError ? (unidad === 'UND' ? Math.trunc(qtyValue) : round2(qtyValue)) : 0;
        const precio = !precioError ? round2(priceValue) : 0;

        return {
          ...item,
          cantidad,
          precio,
          subtotal: round2(cantidad * precio),
          cantidadError,
          precioError,
          invalido: Boolean(cantidadError || precioError)
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
    [subtotal, descuentoValue]
  );

  const totalAsString = useMemo(() => formatMoneyInput(total), [total]);

  useEffect(() => {
    if (!clienteSeleccionado) {
      setCredito('0');
      setCreditoTouched(false);
      setContado(totalAsString);
      setContadoTouched(false);
      return;
    }

    if (!contadoTouched && !creditoTouched) {
      setContado(totalAsString);
      setCredito('0');
    }
  }, [clienteSeleccionado, totalAsString, contadoTouched, creditoTouched]);

  const contadoValue = useMemo(() => {
    const value = parseDecimal(contado);
    if (!Number.isFinite(value) || value < 0) return 0;
    return round2(value);
  }, [contado]);

  const creditoValue = useMemo(() => {
    if (!clienteSeleccionado) return 0;
    const value = parseDecimal(credito);
    if (!Number.isFinite(value) || value < 0) return 0;
    return round2(value);
  }, [credito, clienteSeleccionado]);

  const tipoPago = useMemo(() => {
    if (!clienteSeleccionado) return 'CONTADO';
    if (creditoValue > 0 && contadoValue > 0) return 'MIXTO';
    if (creditoValue > 0) return 'CREDITO';
    return 'CONTADO';
  }, [clienteSeleccionado, contadoValue, creditoValue]);

  const pagosCuadran = useMemo(() => isAlmostEqual(contadoValue + creditoValue, total), [contadoValue, creditoValue, total]);

  const addProductoToCarrito = (producto) => {
    const unidad = getUnidad(producto.unidad_medida || producto.unidad);
    const qtyToAdd = unidad === 'UND' ? 1 : 1;
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
          precioInput: formatMoneyInput(producto.precio_referencia || producto.precio_venta || 0)
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

  const updateItemPrecioInput = (productoId, rawValue) => {
    const normalized = sanitizeDecimalInput(rawValue, 2);
    setCarrito((prev) =>
      prev.map((item) =>
        item.producto_id === productoId
          ? { ...item, precioInput: normalized }
          : item
      )
    );
  };

  const removeItem = (productoId) => {
    setCarrito((prev) => prev.filter((item) => item.producto_id !== productoId));
  };

  const submitVenta = async () => {
    setLocalError('');

    if (!carritoConEstado.length) {
      setLocalError('Agrega al menos un producto al carrito');
      return;
    }

    if (hasInvalidItems) {
      setLocalError('Corrige cantidades o precios invalidos en el carrito');
      return;
    }

    if (!pagosCuadran) {
      setLocalError('Contado + credito debe ser igual al total');
      return;
    }

    const payload = {
      usuario_id: user?.id,
      cliente_id: clienteSeleccionado?.id ?? null,
      items: carritoConEstado.map((item) => ({
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        precio_unit: item.precio
      })),
      pagos: {
        metodo: tipoPago,
        contado: contadoValue,
        credito: creditoValue
      },
      descuento_total: descuentoValue
    };

    setSubmitting(true);
    try {
      await crearVenta(payload);
      setCarrito([]);
      setClienteSeleccionado(null);
      setDescuento('0');
      setContado('0');
      setCredito('0');
      setContadoTouched(false);
      setCreditoTouched(false);
      setSuccessToast(true);
      setTimeout(() => setSuccessToast(false), 3000);
    } catch (_) {
      // handled in store
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl h-[calc(100vh-8rem)] min-h-0 flex flex-col gap-4">
      {successToast && (
        <div className="fixed right-6 top-20 z-40 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow">
          Venta realizada correctamente
        </div>
      )}

      <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">Nueva venta</h2>
            <p className="text-sm text-slate-500">Categorias, productos y carrito con precio editable</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {clienteSeleccionado ? `Cliente: ${clienteSeleccionado.nombre}` : 'Consumidor final'}
            </span>
            {clienteSeleccionado && (
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                onClick={() => {
                  setClienteSeleccionado(null);
                  setCredito('0');
                  setCreditoTouched(false);
                  setContado(totalAsString);
                  setContadoTouched(false);
                }}
              >
                Quitar cliente
              </button>
            )}
            <button
              type="button"
              className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
              onClick={() => setModalFacturaOpen(true)}
            >
              Factura
            </button>
          </div>
        </div>
      </div>

      {(localError || errorVenta) && (
        <p className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{localError || errorVenta}</p>
      )}

      <div className="flex-1 min-h-0 grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <div className="min-h-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-3">
              <p className="font-semibold text-slate-800">Categorias</p>

              <label className="block text-sm text-slate-600">
                Buscar producto
                <input
                  className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Codigo o nombre"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                {categorias.map((categoria) => (
                  <button
                    key={categoria.id}
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                      categoriaActiva === categoria.id
                        ? 'bg-[#b41428] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                    onClick={() => setCategoriaActiva(categoria.id)}
                  >
                    {categoria.nombre}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">Productos</p>
                {debouncedSearch && <p className="text-xs text-slate-500">Resultados: {productosMostrados.length}</p>}
              </div>

              {loadingCatalogo && <p className="text-sm text-slate-500">Cargando productos...</p>}
            </div>

            <div className="flex-1 min-h-0 overflow-auto pt-2 pr-1">
              {!loadingCatalogo && productosMostrados.length === 0 && (
                <p className="text-sm text-slate-500">No hay productos para este filtro</p>
              )}

              <div className="space-y-2">
                {productosMostrados.map((producto) => {
                  const unidad = getUnidad(producto.unidad_medida || producto.unidad);

                  return (
                    <div key={producto.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-2">
                        <p className="text-sm font-semibold text-slate-800">{producto.codigo} - {producto.nombre}</p>
                        <p className="text-sm text-slate-600">
                          {unidad} | Stock: {formatStock(producto.stock_actual, unidad)} | P.ref: ${formatMoneyInput(producto.precio_referencia || 0)}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white"
                        onClick={() => addProductoToCarrito(producto)}
                      >
                        Agregar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-full min-h-0 flex-col">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <p className="font-semibold text-slate-800">Carrito</p>
              <p className="text-sm font-medium text-slate-600">Items: {carrito.length}</p>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Producto</TablaCelda>
                    <TablaCelda as="th">Cant</TablaCelda>
                    <TablaCelda as="th">P. unit</TablaCelda>
                    <TablaCelda as="th">Subtotal</TablaCelda>
                    <TablaCelda as="th">Accion</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {carritoConEstado.length === 0 && (
                    <TablaFila>
                      <TablaCelda colSpan={5} className="text-center text-slate-500">
                        Sin productos en carrito
                      </TablaCelda>
                    </TablaFila>
                  )}

                  {carritoConEstado.map((item) => (
                    <TablaFila key={item.producto_id}>
                      <TablaCelda>
                        <div>
                          <p className="font-medium">{item.codigo} - {item.nombre}</p>
                          <p className="text-xs text-slate-500">{item.unidad_medida}</p>
                        </div>
                      </TablaCelda>
                      <TablaCelda>
                        <input
                          type="text"
                          inputMode={item.unidad_medida === 'UND' ? 'numeric' : 'decimal'}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          value={item.cantidadInput}
                          onChange={(e) => updateItemCantidadInput(item.producto_id, item.unidad_medida, e.target.value)}
                        />
                        {item.cantidadError && <p className="mt-1 text-[11px] text-rose-600">{item.cantidadError}</p>}
                      </TablaCelda>
                      <TablaCelda>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                          value={item.precioInput}
                          onChange={(e) => updateItemPrecioInput(item.producto_id, e.target.value)}
                        />
                        {item.precioError && <p className="mt-1 text-[11px] text-rose-600">{item.precioError}</p>}
                      </TablaCelda>
                      <TablaCelda>${item.subtotal.toFixed(2)}</TablaCelda>
                      <TablaCelda>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          onClick={() => removeItem(item.producto_id)}
                        >
                          Quitar
                        </button>
                      </TablaCelda>
                    </TablaFila>
                  ))}
                </TablaCuerpo>
              </Tabla>
            </div>

            {!clienteSeleccionado ? (
              <div className="mt-3 shrink-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="text-sm text-slate-600">
                  Descuento
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={descuento}
                    onChange={(e) => setDescuento(sanitizeDecimalInput(e.target.value, 2))}
                  />
                </label>

                <label className="text-sm text-slate-600">
                  Contado
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={contado}
                    onChange={(e) => {
                      setContado(sanitizeDecimalInput(e.target.value, 2));
                      setContadoTouched(true);
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) {
                        setContado(totalAsString);
                        setContadoTouched(false);
                      }
                    }}
                  />
                </label>

                <div className="text-right">
                  <p className="text-sm text-slate-500">Metodo: CONTADO</p>
                  <p className="text-3xl font-bold text-slate-800">Total: ${total.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <div className="mt-3 shrink-0 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2 md:items-end">
                <label className="text-sm text-slate-600">
                  Descuento
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={descuento}
                    onChange={(e) => setDescuento(sanitizeDecimalInput(e.target.value, 2))}
                  />
                </label>

                <label className="text-sm text-slate-600">
                  Contado
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={contado}
                    onChange={(e) => {
                      setContado(sanitizeDecimalInput(e.target.value, 2));
                      setContadoTouched(true);
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) {
                        setContado(totalAsString);
                        setContadoTouched(false);
                      }
                    }}
                  />
                </label>

                <label className="text-sm text-slate-600">
                  Credito
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={credito}
                    onChange={(e) => {
                      setCredito(sanitizeDecimalInput(e.target.value, 2));
                      setCreditoTouched(true);
                    }}
                    onBlur={(e) => {
                      if (!e.target.value.trim()) {
                        setCredito('0');
                        setCreditoTouched(false);
                      }
                    }}
                  />
                </label>

                <div className="text-right">
                  <p className="text-sm text-slate-500">Metodo: {tipoPago}</p>
                  <p className="text-3xl font-bold text-slate-800">Total: ${total.toFixed(2)}</p>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={submitting || !carritoConEstado.length || hasInvalidItems || !pagosCuadran}
              className="mt-3 shrink-0 w-full rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020] disabled:opacity-60"
              onClick={submitVenta}
            >
              {submitting ? 'Guardando...' : 'Guardar venta'}
            </button>
          </div>
        </div>
      </div>

      <FacturaModal
        open={modalFacturaOpen}
        onClose={() => setModalFacturaOpen(false)}
        onSelectCliente={(cliente) => {
          setClienteSeleccionado(cliente);
          setCredito('0');
          setCreditoTouched(false);
          setContado(totalAsString);
          setContadoTouched(false);
        }}
      />
    </div>
  );
}
