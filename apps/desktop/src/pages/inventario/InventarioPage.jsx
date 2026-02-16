import { useEffect, useMemo, useState } from 'react';
import apiClient, { normalizeResponse } from '../../lib/apiClient';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import { getTipoClasses } from '../../components/ui/statusColors';
import { useInventarioStore } from '../../stores/inventarioStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatQtyByUnit } from '../../lib/formatQty';

const PAGE_SIZE = 10;

function SectionTitle({ title, subtitle }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-800">{title}</h2>
      <p className="text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

export default function InventarioPage() {
  const {
    disponible,
    alertas,
    mermas,
    movimientos,
    error,
    cargarDisponible,
    cargarAlertas,
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

  const [stockMin, setStockMin] = useState({ id: '', stock: '' });
  const [conteo, setConteo] = useState({ producto_id: '', stock_conteo: '' });
  const [conteoId, setConteoId] = useState('');
  const [ajuste, setAjuste] = useState({ producto_id: '', cantidad: '' });
  const [merma, setMerma] = useState({ producto_id: '', cantidad: '', motivo: 'Merma operativa' });
  const [productoEdit, setProductoEdit] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', stock_minimo: '', activo: true, categoria_id: '' });
  const [tab, setTab] = useState('disponible');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    cargarDisponible();
    cargarAlertas();
    cargarMermas();
    cargarMovimientos();

    apiClient.get('/api/categorias').then((response) => {
      setCategorias(normalizeResponse(response.data) || []);
    }).catch(() => {
      setCategorias([]);
    });
  }, [cargarDisponible, cargarAlertas, cargarMermas, cargarMovimientos]);

  useEffect(() => {
    setPagina(1);
  }, [tab, disponible.length, alertas.length, mermas.length, movimientos.length, categoriaFiltro, searchFiltro]);

  const rowsByTab = {
    disponible,
    alertas,
    mermas,
    movimientos
  };

  const rows = rowsByTab[tab] || [];

  const filteredRows = useMemo(() => {
    if (tab !== 'disponible' && tab !== 'alertas') {
      return rows;
    }

    const q = searchFiltro.trim().toLowerCase();

    const filtered = rows.filter((row) => {
      if (categoriaFiltro && String(row.categoria_id) !== String(categoriaFiltro)) return false;
      if (!q) return true;

      const codigo = String(row.codigo || '').toLowerCase();
      const nombre = String(row.nombre || '').toLowerCase();
      return codigo.includes(q) || nombre.includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (tab === 'disponible') {
        const alertA = Number(a.stock_actual || 0) <= Number(a.stock_minimo || 0) ? 0 : 1;
        const alertB = Number(b.stock_actual || 0) <= Number(b.stock_minimo || 0) ? 0 : 1;
        if (alertA !== alertB) return alertA - alertB;
      }

      const nameSort = String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
      if (nameSort !== 0) return nameSort;
      return String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { sensitivity: 'base' });
    });
  }, [rows, tab, categoriaFiltro, searchFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => filteredRows.slice((pagina - 1) * PAGE_SIZE, (pagina - 1) * PAGE_SIZE + PAGE_SIZE), [filteredRows, pagina]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <SectionTitle title="Inventario" subtitle="Control de stock, conteos y ajustes" />
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-800">Stock minimo</p>
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Producto ID" value={stockMin.id} onChange={(e) => setStockMin((s) => ({ ...s, id: e.target.value }))} />
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Nuevo stock minimo" value={stockMin.stock} onChange={(e) => setStockMin((s) => ({ ...s, stock: e.target.value }))} />
            <button
              className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
              onClick={async () => {
                await actualizarStockMinimo(Number(stockMin.id), Number(stockMin.stock));
                cargarDisponible();
                cargarAlertas();
              }}
            >
              Actualizar
            </button>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-800">Conteo</p>
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Producto ID" value={conteo.producto_id} onChange={(e) => setConteo((s) => ({ ...s, producto_id: e.target.value }))} />
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Stock contado" value={conteo.stock_conteo} onChange={(e) => setConteo((s) => ({ ...s, stock_conteo: e.target.value }))} />
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                onClick={async () => {
                  const result = await crearConteo({ items: [{ producto_id: Number(conteo.producto_id), stock_conteo: Number(conteo.stock_conteo) }] });
                  setConteoId(String(result.conteo.id));
                }}
              >
                Crear conteo
              </button>
              <input className="rounded-xl border border-slate-300 px-3 py-2" placeholder="Conteo ID" value={conteoId} onChange={(e) => setConteoId(e.target.value)} />
              <button
                className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
                onClick={async () => {
                  await aplicarConteo(Number(conteoId));
                  cargarDisponible();
                  cargarMovimientos();
                  cargarAlertas();
                }}
              >
                Aplicar conteo
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-800">Ajuste masivo</p>
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Producto ID" value={ajuste.producto_id} onChange={(e) => setAjuste((s) => ({ ...s, producto_id: e.target.value }))} />
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Cantidad (negativa o positiva)" value={ajuste.cantidad} onChange={(e) => setAjuste((s) => ({ ...s, cantidad: e.target.value }))} />
            <button
              className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
              onClick={async () => {
                await ajustesMasivo({ items: [{ producto_id: Number(ajuste.producto_id), cantidad: Number(ajuste.cantidad) }] });
                cargarDisponible();
                cargarMovimientos();
                cargarAlertas();
              }}
            >
              Aplicar ajuste
            </button>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="font-semibold text-slate-800">Merma</p>
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Producto ID" value={merma.producto_id} onChange={(e) => setMerma((s) => ({ ...s, producto_id: e.target.value }))} />
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Cantidad" value={merma.cantidad} onChange={(e) => setMerma((s) => ({ ...s, cantidad: e.target.value }))} />
            <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Motivo" value={merma.motivo} onChange={(e) => setMerma((s) => ({ ...s, motivo: e.target.value }))} />
            <button
              className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
              onClick={async () => {
                await crearMerma({ producto_id: Number(merma.producto_id), cantidad: Number(merma.cantidad), motivo: merma.motivo });
                cargarDisponible();
                cargarMermas();
                cargarMovimientos();
                cargarAlertas();
              }}
            >
              Registrar merma
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: 'disponible', label: 'Disponible' },
            { key: 'alertas', label: 'Alertas' },
            { key: 'mermas', label: 'Mermas' },
            { key: 'movimientos', label: 'Movimientos' }
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                tab === item.key ? 'bg-[#b41428] text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {(tab === 'disponible' || tab === 'alertas') && (
          <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[220px_1fr]">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Categoria</label>
              <select className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Buscar</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                value={searchFiltro}
                onChange={(e) => setSearchFiltro(e.target.value)}
                placeholder="Codigo o nombre"
              />
            </div>
          </div>
        )}

        <Tabla>
          <TablaCabecera>
            <tr>
              {(tab === 'disponible' || tab === 'alertas') && (
                <>
                  <TablaCelda as="th">Codigo</TablaCelda>
                  <TablaCelda as="th">Nombre</TablaCelda>
                  <TablaCelda as="th">Categoria</TablaCelda>
                  <TablaCelda as="th">Unidad</TablaCelda>
                  <TablaCelda as="th">Stock</TablaCelda>
                  <TablaCelda as="th">Minimo</TablaCelda>
                  {tab === 'disponible' && <TablaCelda as="th">Acciones</TablaCelda>}
                </>
              )}
              {tab === 'mermas' && (
                <>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Cantidad</TablaCelda>
                  <TablaCelda as="th">Motivo</TablaCelda>
                </>
              )}
              {tab === 'movimientos' && (
                <>
                  <TablaCelda as="th">Fecha</TablaCelda>
                  <TablaCelda as="th">Producto</TablaCelda>
                  <TablaCelda as="th">Tipo</TablaCelda>
                  <TablaCelda as="th">Cantidad</TablaCelda>
                </>
              )}
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {pagedRows.map((row) => (
              <TablaFila key={`${tab}-${row.id}`}>
                {(tab === 'disponible' || tab === 'alertas') && (
                  <>
                    <TablaCelda>{row.codigo}</TablaCelda>
                    <TablaCelda>{row.nombre}</TablaCelda>
                    <TablaCelda>{row.categoria_nombre || '-'}</TablaCelda>
                    <TablaCelda>{row.unidad_medida || row.unidad || 'UND'}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(row.stock_actual, row.unidad_medida || row.unidad, { fixedLB: true })}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(row.stock_minimo, row.unidad_medida || row.unidad, { fixedLB: true })}</TablaCelda>
                    {tab === 'disponible' && (
                      <TablaCelda>
                        <button
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white"
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
                          Editar
                        </button>
                      </TablaCelda>
                    )}
                  </>
                )}

                {tab === 'mermas' && (
                  <>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda>{row.producto_codigo} {row.producto_nombre}</TablaCelda>
                    <TablaCelda>{Number(row.cantidad || 0).toFixed(2)}</TablaCelda>
                    <TablaCelda>{row.motivo}</TablaCelda>
                  </>
                )}

                {tab === 'movimientos' && (
                  <>
                    <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                    <TablaCelda>{row.producto_codigo} {row.producto_nombre}</TablaCelda>
                    <TablaCelda>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getTipoClasses(row.tipo)}`}>
                        {row.tipo}
                      </span>
                    </TablaCelda>
                    <TablaCelda>{Number(row.cantidad || 0).toFixed(2)}</TablaCelda>
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

        {productoEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onClick={() => setProductoEdit(null)}>
            <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Editar producto</h3>
                  <p className="text-sm text-slate-500">{productoEdit.codigo} - {productoEdit.nombre}</p>
                </div>
                <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setProductoEdit(null)}>
                  X
                </button>
              </div>

              <div className="mt-3 grid gap-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Nombre</label>
                  <input
                    className="mt-1 rounded-xl border border-slate-300 px-3 py-2 w-full"
                    value={editForm.nombre}
                    onChange={(e) => setEditForm((s) => ({ ...s, nombre: e.target.value }))}
                    placeholder="Nombre"
                  />
                  <p className="mt-1 text-xs text-slate-500">Nombre comercial del producto en inventario y reportes.</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Stock minimo</label>
                  <input
                    className="mt-1 rounded-xl border border-slate-300 px-3 py-2 w-full"
                    value={editForm.stock_minimo}
                    onChange={(e) => setEditForm((s) => ({ ...s, stock_minimo: e.target.value }))}
                    placeholder="Stock minimo"
                  />
                  <p className="mt-1 text-xs text-slate-500">Define el umbral para alertas de reposicion.</p>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Categoria</label>
                  <select
                    className="mt-1 rounded-xl border border-slate-300 px-3 py-2 w-full"
                    value={editForm.categoria_id}
                    onChange={(e) => setEditForm((s) => ({ ...s, categoria_id: e.target.value }))}
                  >
                    <option value="">Sin categoria</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Categoria usada para organizar y filtrar productos.</p>
                </div>

                <div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editForm.activo}
                      onChange={(e) => setEditForm((s) => ({ ...s, activo: e.target.checked }))}
                    />
                    Activo
                  </label>
                  <p className="mt-1 text-xs text-slate-500">Si esta inactivo no se mostrara para nuevas operaciones.</p>
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setProductoEdit(null)}>
                  Cancelar
                </button>
                <button
                  className="rounded-xl bg-[#b41428] px-3 py-2 text-sm font-medium text-white hover:bg-[#8f1020]"
                  onClick={async () => {
                    await actualizarProducto(productoEdit.id, {
                      nombre: editForm.nombre,
                      stock_minimo: Number(editForm.stock_minimo || 0),
                      activo: editForm.activo,
                      categoria_id: editForm.categoria_id ? Number(editForm.categoria_id) : null
                    });
                    setProductoEdit(null);
                    cargarDisponible();
                    cargarAlertas();
                  }}
                >
                  Guardar cambios
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
