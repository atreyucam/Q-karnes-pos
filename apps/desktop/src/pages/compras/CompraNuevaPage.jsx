import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseApiError } from '../../lib/apiClient';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import Modal from '../../components/ui/Modal';
import { useComprasStore } from '../../stores/comprasStore';
import { useProveedoresStore } from '../../stores/proveedoresStore';
import { formatMoney } from '../../lib/formatMoney';
import { getUnidad, sanitizeDecimalInput, sanitizeQtyInput } from '../../lib/formatQty';
import { fetchCategorias, fetchProductosActivos } from '../../services/catalogoService';

function defaultQtyByUnit(unidad) {
  return getUnidad(unidad) === 'UND' ? '1' : '1.00';
}

function parseQtyByUnit(value, unidad) {
  const unit = getUnidad(unidad);
  if (unit === 'UND') {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

export default function CompraNuevaPage() {
  const navigate = useNavigate();
  const { crearOrden, crearProducto, crearCategoria, error } = useComprasStore();
  const { proveedores, listar: listarProveedores } = useProveedoresStore();

  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);

  const [proveedorId, setProveedorId] = useState('');
  const [observacion, setObservacion] = useState('');
  const [authAdmin, setAuthAdmin] = useState({ usuario: '', password: '' });
  const [productoSearch, setProductoSearch] = useState('');
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState('');
  const [items, setItems] = useState([]);

  const [showProductoModal, setShowProductoModal] = useState(false);
  const [showCategoriaInline, setShowCategoriaInline] = useState(false);
  const [productoNuevo, setProductoNuevo] = useState({
    codigo: '',
    nombre: '',
    categoria_id: '',
    unidad_medida: 'UND',
    precio_referencia: '0'
  });
  const [categoriaNueva, setCategoriaNueva] = useState('');
  const [localError, setLocalError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCatalogos = async () => {
    const [nextProductos, nextCategorias] = await Promise.all([
      fetchProductosActivos(),
      fetchCategorias()
    ]);
    setProductos(nextProductos);
    setCategorias(nextCategorias);
  };

  useEffect(() => {
    listarProveedores({ include_cxp: 1, activo: 1 });
    loadCatalogos().catch((error) => {
      setLocalError(parseApiError(error) || 'No se pudo cargar catalogos');
    });
  }, [listarProveedores]);

  const productosFiltrados = useMemo(() => {
    const q = productoSearch.trim().toLowerCase();
    if (!q) return productos;

    return productos.filter((p) => {
      const codigo = String(p.codigo || '').toLowerCase();
      const nombre = String(p.nombre || '').toLowerCase();
      return codigo.includes(q) || nombre.includes(q);
    });
  }, [productos, productoSearch]);

  const addItem = () => {
    const producto = productos.find((p) => String(p.id) === String(productoSeleccionadoId));
    if (!producto) return;

    const unidad = getUnidad(producto.unidad_medida || producto.unidad);
    const costoDefault = Number(producto.precio_referencia || 0).toFixed(2);

    setItems((prev) => {
      const existing = prev.find((i) => i.producto_id === producto.id);
      if (!existing) {
        return [
          ...prev,
          {
            producto_id: producto.id,
            codigo: producto.codigo,
            nombre: producto.nombre,
            unidad,
            cantidadInput: defaultQtyByUnit(unidad),
            costoInput: costoDefault
          }
        ];
      }

      const currentQty = parseQtyByUnit(existing.cantidadInput, unidad);
      const nextQty = (Number.isFinite(currentQty) ? currentQty : 0) + (unidad === 'UND' ? 1 : 1);
      const normalizedQty = unidad === 'UND' ? String(nextQty) : Number(nextQty).toFixed(2);

      return prev.map((it) =>
        it.producto_id === producto.id
          ? { ...it, cantidadInput: normalizedQty }
          : it
      );
    });

    setProductoSeleccionadoId('');
  };

  const updateItem = (index, key, value) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;

        if (key === 'cantidadInput') {
          return { ...item, cantidadInput: sanitizeQtyInput(value, item.unidad) };
        }

        if (key === 'costoInput') {
          return { ...item, costoInput: sanitizeDecimalInput(value, 2) };
        }

        return { ...item, [key]: value };
      })
    );
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const onGuardarOrden = async () => {
    setLocalError('');
    if (!items.length) {
      setLocalError('Agrega al menos un producto a la orden');
      return;
    }
    if (!proveedorId) {
      setLocalError('Selecciona un proveedor antes de guardar la orden');
      return;
    }
    if (!authAdmin.usuario.trim() || !authAdmin.password) {
      setLocalError('Registrar compra requiere autorización ADMIN (usuario y clave)');
      return;
    }

    const parsedItems = [];
    for (const item of items) {
      const cantidad = parseQtyByUnit(item.cantidadInput, item.unidad);
      const costo = Number(String(item.costoInput || '').replace(',', '.'));

      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        setLocalError(`Cantidad inválida para ${item.codigo}`);
        return;
      }
      if (getUnidad(item.unidad) === 'UND' && !Number.isInteger(cantidad)) {
        setLocalError(`Cantidad inválida para ${item.codigo}: UND solo acepta enteros`);
        return;
      }
      if (!Number.isFinite(costo) || costo < 0) {
        setLocalError(`Costo inválido para ${item.codigo}`);
        return;
      }

      parsedItems.push({
        producto_id: item.producto_id,
        cantidad,
        costo_unit_est: costo
      });
    }

    const payload = {
      proveedor_id: proveedorId ? Number(proveedorId) : null,
      observacion: observacion || undefined,
      autorizacion: {
        usuario: authAdmin.usuario.trim(),
        password: authAdmin.password
      },
      items: parsedItems
    };

    setSaving(true);
    try {
      const response = await crearOrden(payload);
      const ordenId = response?.orden?.id;
      if (ordenId) {
        navigate(`/compras/ordenes/${ordenId}`);
        return;
      }
      navigate('/compras');
    } catch (error) {
      setLocalError(parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const onCrearCategoria = async () => {
    setLocalError('');
    if (!categoriaNueva.trim()) return;
    const created = await crearCategoria({ nombre: categoriaNueva.trim(), activo: true }).catch((error) => {
      setLocalError(parseApiError(error));
      return null;
    });
    if (!created?.id) return;

    setCategoriaNueva('');
    setShowCategoriaInline(false);
    await loadCatalogos().catch((error) => {
      setLocalError(parseApiError(error));
    });
    setProductoNuevo((s) => ({ ...s, categoria_id: String(created.id) }));
  };

  const onCrearProducto = async () => {
    setLocalError('');
    const payload = {
      codigo: productoNuevo.codigo,
      nombre: productoNuevo.nombre,
      categoria_id: productoNuevo.categoria_id ? Number(productoNuevo.categoria_id) : null,
      unidad_medida: productoNuevo.unidad_medida,
      precio_referencia: Number(productoNuevo.precio_referencia || 0),
      activo: true
    };

    const created = await crearProducto(payload).catch((error) => {
      setLocalError(parseApiError(error));
      return null;
    });
    if (!created?.id) return;

    setShowProductoModal(false);
    setProductoNuevo({ codigo: '', nombre: '', categoria_id: '', unidad_medida: 'UND', precio_referencia: '0' });
    await loadCatalogos().catch((error) => {
      setLocalError(parseApiError(error));
    });
    setProductoSeleccionadoId(String(created.id));
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <div>
          <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => navigate('/compras')}>
            Volver
          </button>
          <h2 className="mt-3 text-2xl font-semibold text-slate-800">Crear orden de compra</h2>
          <p className="text-sm text-slate-500">Selecciona proveedor y agrega productos a la orden</p>
        </div>

        {(error || localError) && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {localError || error}
          </p>
        )}

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Proveedor</label>
            <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Selecciona proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Selecciona a quien compraras.</p>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Observacion</label>
            <textarea className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Observacion (opcional)" value={observacion} onChange={(e) => setObservacion(e.target.value)} />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="font-semibold text-amber-800">Autorización ADMIN requerida</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input
                className="rounded-xl border border-amber-300 px-3 py-2"
                placeholder="Usuario admin"
                value={authAdmin.usuario}
                onChange={(e) => setAuthAdmin((s) => ({ ...s, usuario: e.target.value }))}
              />
              <input
                type="password"
                className="rounded-xl border border-amber-300 px-3 py-2"
                placeholder="Clave admin"
                value={authAdmin.password}
                onChange={(e) => setAuthAdmin((s) => ({ ...s, password: e.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-800">Productos</p>
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Buscador de productos</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Codigo o nombre"
                  value={productoSearch}
                  onChange={(e) => setProductoSearch(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Producto</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={productoSeleccionadoId}
                  onChange={(e) => setProductoSeleccionadoId(e.target.value)}
                >
                  <option value="">Selecciona producto</option>
                  {productosFiltrados.map((p) => (
                    <option key={p.id} value={p.id}>{p.codigo} - {p.nombre}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Selecciona un producto del inventario o crea uno nuevo.</p>
              </div>

              <button className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white" onClick={addItem} title="Anade a la orden">
                Agregar
              </button>
              <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setShowProductoModal(true)}>
                Crear producto
              </button>
            </div>
          </div>

          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Unidad</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">Costo estimado</TablaCelda>
                <TablaCelda as="th">Accion</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {items.map((it, index) => (
                <TablaFila key={`${it.producto_id}-${index}`}>
                  <TablaCelda>{it.codigo} - {it.nombre}</TablaCelda>
                  <TablaCelda>{it.unidad}</TablaCelda>
                  <TablaCelda>
                    <input
                      className="w-28 rounded-lg border border-slate-300 px-2 py-1"
                      value={it.cantidadInput}
                      onChange={(e) => updateItem(index, 'cantidadInput', e.target.value)}
                    />
                  </TablaCelda>
                  <TablaCelda>
                    <input
                      className="w-28 rounded-lg border border-slate-300 px-2 py-1"
                      value={it.costoInput}
                      onChange={(e) => updateItem(index, 'costoInput', e.target.value)}
                    />
                  </TablaCelda>
                  <TablaCelda>
                    <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs" onClick={() => removeItem(index)}>
                      Quitar
                    </button>
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
          <Paginador paginaActual={1} totalPaginas={1} totalRegistros={items.length} mostrarSiempre />

          <div className="flex justify-end">
            <button
              className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020] disabled:opacity-60"
              onClick={onGuardarOrden}
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar orden'}
            </button>
          </div>
        </div>
      </div>

      <Modal open={showProductoModal} onClose={() => setShowProductoModal(false)} maxWidthClass="max-w-3xl" panelClassName="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Crear producto</h3>
                <p className="text-sm text-slate-500">Registra un producto para agregarlo a la orden.</p>
              </div>
              <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setShowProductoModal(false)}>
                X
              </button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">Codigo</label>
                <input className="mt-1 rounded-xl border border-slate-300 px-3 py-2 w-full" placeholder="P001" value={productoNuevo.codigo} onChange={(e) => setProductoNuevo((s) => ({ ...s, codigo: e.target.value }))} />
                <p className="mt-1 text-xs text-slate-500">Codigo unico del producto.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Nombre</label>
                <input className="mt-1 rounded-xl border border-slate-300 px-3 py-2 w-full" placeholder="Nombre" value={productoNuevo.nombre} onChange={(e) => setProductoNuevo((s) => ({ ...s, nombre: e.target.value }))} />
                <p className="mt-1 text-xs text-slate-500">Nombre comercial para busqueda y reportes.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Categoria</label>
                <select className="mt-1 rounded-xl border border-slate-300 px-3 py-2 w-full" value={productoNuevo.categoria_id} onChange={(e) => setProductoNuevo((s) => ({ ...s, categoria_id: e.target.value }))}>
                  <option value="">Categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Categoria a la que pertenece el producto.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Unidad</label>
                <select className="mt-1 rounded-xl border border-slate-300 px-3 py-2 w-full" value={productoNuevo.unidad_medida} onChange={(e) => setProductoNuevo((s) => ({ ...s, unidad_medida: e.target.value }))}>
                  <option value="UND">UND</option>
                  <option value="LB">LB</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">Unidad de manejo para compras y ventas.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Precio referencia</label>
                <input className="mt-1 rounded-xl border border-slate-300 px-3 py-2 w-full" placeholder="0.00" value={productoNuevo.precio_referencia} onChange={(e) => setProductoNuevo((s) => ({ ...s, precio_referencia: sanitizeDecimalInput(e.target.value, 2) }))} />
                <p className="mt-1 text-xs text-slate-500">Precio base de referencia para venta.</p>
              </div>
              <div>
                <button className="mt-6 rounded-xl border border-slate-300 px-3 py-2 text-sm w-full" onClick={() => setShowCategoriaInline((prev) => !prev)}>
                  {showCategoriaInline ? 'Cancelar categoria' : 'Crear categoria'}
                </button>
                <p className="mt-1 text-xs text-slate-500">Si no existe categoria, puedes crearla aqui.</p>
              </div>
            </div>

            {showCategoriaInline && (
              <div className="mt-3 space-y-1">
                <div className="flex gap-2">
                  <input className="flex-1 rounded-xl border border-slate-300 px-3 py-2" placeholder="Nombre categoria" value={categoriaNueva} onChange={(e) => setCategoriaNueva(e.target.value)} />
                  <button className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white" onClick={onCrearCategoria}>
                    Guardar categoria
                  </button>
                </div>
                <p className="text-xs text-slate-500">Define la familia del producto para filtros y reportes.</p>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setShowProductoModal(false)}>
                Cancelar
              </button>
              <button className="rounded-xl bg-[#b41428] px-3 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={onCrearProducto}>
                Guardar producto
              </button>
            </div>
      </Modal>
    </div>
  );
}
