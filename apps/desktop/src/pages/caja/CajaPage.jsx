import { useEffect, useMemo, useState } from 'react';
import { Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda } from '../../components/ui/Tabla';
import Paginador from '../../components/ui/Paginador';
import Modal from '../../components/ui/Modal';
import { getTipoClasses } from '../../components/ui/statusColors';
import { useCajaStore } from '../../stores/cajaStore';
import { formatDateQuito } from '../../lib/formatDateQuito';

const PAGE_SIZE = 20;

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export default function CajaPage() {
  const {
    turnoActual,
    resumen,
    movimientos,
    auditoria,
    loading,
    error,
    fetchTurnoActual,
    abrirTurno,
    corteX,
    movimientoManual,
    corteZ,
    cargarAuditoria,
    cargarMovimientosTurno
  } = useCajaStore();

  const [fondo, setFondo] = useState('100');
  const [manual, setManual] = useState({ tipo: 'INGRESO', concepto: '', monto: '' });
  const [corteData, setCorteData] = useState({ efectivo_contado: '', observacion: '' });
  const [corteAuth, setCorteAuth] = useState({ usuario: '', password: '' });
  const [pagina, setPagina] = useState(1);
  const [movimientoDetalle, setMovimientoDetalle] = useState(null);

  const refreshTurnoData = async () => {
    try {
      const turno = await fetchTurnoActual();
      if (!turno?.id) return;
      await Promise.all([
        corteX(),
        cargarMovimientosTurno(turno.id, { limit: 500, offset: 0 })
      ]);
    } catch (_) {
      // managed by store error state
    }
  };

  useEffect(() => {
    refreshTurnoData();
  }, []);

  useEffect(() => {
    if (!turnoActual?.id) return undefined;

    const interval = setInterval(() => {
      refreshTurnoData();
    }, 4000);

    return () => clearInterval(interval);
  }, [turnoActual?.id]);

  useEffect(() => {
    setPagina(1);
  }, [movimientos.length]);

  const movimientosPaginados = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return movimientos.slice(start, start + PAGE_SIZE);
  }, [movimientos, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(movimientos.length / PAGE_SIZE));
  const efectivoEsperado = Number(resumen?.efectivo_esperado || 0);
  const efectivoContado = Number(corteData.efectivo_contado || 0);
  const diferenciaCierre = round2(efectivoContado - efectivoEsperado);
  const requiereAutorizacionAdmin = corteData.efectivo_contado !== '' && Math.abs(diferenciaCierre) > 0.009;

  useEffect(() => {
    if (!requiereAutorizacionAdmin && (corteAuth.usuario || corteAuth.password)) {
      setCorteAuth({ usuario: '', password: '' });
    }
  }, [requiereAutorizacionAdmin, corteAuth.usuario, corteAuth.password]);

  const onAbrir = async () => {
    await abrirTurno({ fondo_inicial: Number(fondo || 0), observacion: 'Apertura manual desktop' });
    await refreshTurnoData();
  };

  const onCorteX = async () => {
    await corteX();
    if (turnoActual?.id) await cargarMovimientosTurno(turnoActual.id, { limit: 500, offset: 0 });
  };

  const onManual = async () => {
    await movimientoManual({ ...manual, monto: Number(manual.monto || 0) });
    setManual({ tipo: 'INGRESO', concepto: '', monto: '' });
    await refreshTurnoData();
  };

  const onCorteZ = async () => {
    await corteZ({
      efectivo_contado: efectivoContado,
      observacion: corteData.observacion || undefined,
      autorizacion: requiereAutorizacionAdmin && corteAuth.usuario.trim() && corteAuth.password
        ? { usuario: corteAuth.usuario.trim(), password: corteAuth.password }
        : undefined
    });
    setCorteData({ efectivo_contado: '', observacion: '' });
    setCorteAuth({ usuario: '', password: '' });
    await refreshTurnoData();
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Caja</h2>
          <p className="text-sm text-slate-500">Turno actual, corte X y movimientos</p>
        </div>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {!turnoActual ? (
          <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-sm text-slate-700">
              Fondo inicial
              <input className="mt-1 block rounded-xl border border-slate-300 px-3 py-2" value={fondo} onChange={(e) => setFondo(e.target.value)} />
            </label>
            <button className="rounded-xl bg-[#b41428] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f1020]" onClick={onAbrir} disabled={loading}>
              Abrir turno
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Fondo inicial</p>
                <p className="text-xl font-semibold text-slate-800">${formatMoney(turnoActual.fondo_inicial)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Ventas efectivo</p>
                <p className="text-xl font-semibold text-slate-800">${formatMoney(resumen?.ventas_efectivo)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Ingresos manuales</p>
                <p className="text-xl font-semibold text-slate-800">${formatMoney(resumen?.ingresos_manuales)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Egresos manuales</p>
                <p className="text-xl font-semibold text-slate-800">${formatMoney(resumen?.egresos_manuales)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Efectivo esperado</p>
                <p className="text-xl font-semibold text-[#b41428]">${formatMoney(resumen?.efectivo_esperado)}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-slate-800">Movimiento manual</p>
                <select className="w-full rounded-xl border border-slate-300 px-3 py-2" value={manual.tipo} onChange={(e) => setManual((s) => ({ ...s, tipo: e.target.value }))}>
                  <option value="INGRESO">INGRESO</option>
                  <option value="EGRESO">EGRESO</option>
                </select>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Concepto" value={manual.concepto} onChange={(e) => setManual((s) => ({ ...s, concepto: e.target.value }))} />
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Monto" value={manual.monto} onChange={(e) => setManual((s) => ({ ...s, monto: e.target.value }))} />
                <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={onManual}>
                  Registrar movimiento
                </button>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-semibold text-slate-800">Corte Z</p>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Efectivo contado" value={corteData.efectivo_contado} onChange={(e) => setCorteData((s) => ({ ...s, efectivo_contado: e.target.value }))} />
                <textarea className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Observacion (si hay diferencia)" value={corteData.observacion} onChange={(e) => setCorteData((s) => ({ ...s, observacion: e.target.value }))} />
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                  Esperado: ${formatMoney(efectivoEsperado)} | Contado: ${formatMoney(efectivoContado)} | Diferencia: ${formatMoney(diferenciaCierre)}
                </div>
                {requiereAutorizacionAdmin && (
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2">
                    <input
                      className="rounded-xl border border-amber-300 px-3 py-2"
                      placeholder="Usuario admin (diferencia detectada)"
                      value={corteAuth.usuario}
                      onChange={(e) => setCorteAuth((s) => ({ ...s, usuario: e.target.value }))}
                    />
                    <input
                      type="password"
                      className="rounded-xl border border-amber-300 px-3 py-2"
                      placeholder="Clave admin (diferencia detectada)"
                      value={corteAuth.password}
                      onChange={(e) => setCorteAuth((s) => ({ ...s, password: e.target.value }))}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white" onClick={onCorteX}>
                    Corte X
                  </button>
                  <button className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={onCorteZ} disabled={corteData.efectivo_contado === ''}>
                    Cerrar turno
                  </button>
                  <button className="rounded-xl border border-slate-300 px-4 py-2 text-sm" onClick={() => cargarAuditoria(turnoActual.id)}>
                    Auditoria
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">Movimientos del turno</p>
                <p className="text-xs text-slate-500">Actualiza cada 4s</p>
              </div>
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Fecha</TablaCelda>
                    <TablaCelda as="th">Tipo</TablaCelda>
                    <TablaCelda as="th">Concepto</TablaCelda>
                    <TablaCelda as="th">Monto</TablaCelda>
                    <TablaCelda as="th">Accion</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {movimientosPaginados.map((m) => (
                    <TablaFila key={m.id}>
                      <TablaCelda>{formatDateQuito(m.fecha)}</TablaCelda>
                      <TablaCelda>
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${getTipoClasses(m.tipo)}`}>
                          {m.tipo}
                        </span>
                      </TablaCelda>
                      <TablaCelda>{m.concepto}</TablaCelda>
                      <TablaCelda>${formatMoney(m.monto)}</TablaCelda>
                      <TablaCelda>
                        <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs" onClick={() => setMovimientoDetalle(m)}>
                          Ver detalle
                        </button>
                      </TablaCelda>
                    </TablaFila>
                  ))}
                </TablaCuerpo>
              </Tabla>

              <Paginador
                paginaActual={pagina}
                totalPaginas={totalPaginas}
                totalRegistros={movimientos.length}
                mostrarSiempre
                onPageChange={setPagina}
              />
            </div>

            {auditoria?.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-2 font-semibold text-slate-800">Auditoria del turno</p>
                <pre className="max-h-60 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(auditoria, null, 2)}</pre>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={Boolean(movimientoDetalle)} onClose={() => setMovimientoDetalle(null)} maxWidthClass="max-w-md" panelClassName="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">Detalle movimiento</h3>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setMovimientoDetalle(null)}>
            X
          </button>
        </div>

        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p><span className="font-semibold">Fecha:</span> {formatDateQuito(movimientoDetalle?.fecha)}</p>
          <p><span className="font-semibold">Tipo:</span> {movimientoDetalle?.tipo}</p>
          <p><span className="font-semibold">Concepto:</span> {movimientoDetalle?.concepto}</p>
          <p><span className="font-semibold">Monto:</span> ${formatMoney(movimientoDetalle?.monto)}</p>
        </div>
      </Modal>
    </div>
  );
}
