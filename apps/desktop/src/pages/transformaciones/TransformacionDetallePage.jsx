import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  BackButton,
  Button,
  Input,
  Modal,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  TipoBadge,
  Textarea
} from '../../ui';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit } from '../../lib/formatQty';
import { useAuthStore } from '../../stores/authStore';
import { useTransformacionesStore } from '../../stores/transformacionesStore';
import { getTransformacionStatusHelp, getTransformacionStatusLabel } from './transformacionesUi';

function formatTimeQuito(value) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function DataItem({ label, value, tone = 'text-text' }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className={`text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function CancelModal({ open, auth, setAuth, novedad, setNovedad, onClose, onConfirm, loading, requiresAuth }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-lg" panelClassName="p-5">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-text">Anular transformación</h3>
          <p className="text-sm text-text-muted">Esta operación revierte stock y costos. Requiere justificación operativa y autorización ADMIN.</p>
        </div>
        <Textarea
          className="w-full"
          rows={3}
          placeholder="Novedad de anulación"
          value={novedad}
          onChange={(e) => setNovedad(e.target.value)}
        />
        {requiresAuth && (
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              placeholder="Usuario admin"
              value={auth.usuario}
              onChange={(e) => setAuth((s) => ({ ...s, usuario: e.target.value }))}
            />
            <Input
              type="password"
              placeholder="Clave admin"
              value={auth.password}
              onChange={(e) => setAuth((s) => ({ ...s, password: e.target.value }))}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Anulando...' : 'Confirmar anulación'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function TransformacionDetallePage() {
  const { id } = useParams();
  const transformacionId = Number(id);
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const { actual, loading, saving, error, obtener, anular } = useTransformacionesStore();
  const [localError, setLocalError] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [auth, setAuth] = useState({ usuario: '', password: '' });
  const [novedad, setNovedad] = useState('');
  const isAdminUser = String(currentUser?.rol?.nombre || currentUser?.rol || '').trim().toUpperCase() === 'ADMIN';

  useEffect(() => {
    if (!Number.isFinite(transformacionId) || transformacionId <= 0) return;
    obtener(transformacionId).catch((requestError) => setLocalError(requestError.message));
  }, [obtener, transformacionId]);

  const onConfirmAnular = async () => {
    if (!novedad.trim()) {
      setLocalError('Debes ingresar una novedad de anulación');
      return;
    }
    if (!isAdminUser && (!auth.usuario.trim() || !auth.password)) {
      setLocalError('Debes ingresar usuario y clave ADMIN');
      return;
    }
    setLocalError('');
    try {
      await anular(transformacionId, {
        novedad: novedad.trim(),
        ...(isAdminUser ? {} : { autorizacion: { usuario: auth.usuario.trim(), password: auth.password } })
      });
      setShowCancelModal(false);
      await obtener(transformacionId);
    } catch (requestError) {
      setLocalError(requestError.message);
    }
  };

  const openCancelFlow = () => {
    setAuth({ usuario: '', password: '' });
    setNovedad('');
    setShowCancelModal(true);
  };

  if (!actual || actual.id !== transformacionId) {
    return (
      <div>
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="text-sm text-text-muted">{loading ? 'Cargando detalle...' : 'No se encontró la transformación solicitada.'}</p>
          <div className="mt-3">
            <BackButton to="/transformaciones">Volver al listado</BackButton>
          </div>
        </div>
      </div>
    );
  }

  const unit = actual.insumo?.unidad_medida || 'LB';
  const totalDelPadre = formatQtyByUnit(actual.insumo?.stock_disponible_snapshot, unit, { fixedWeight: true });
  const totalConsumido = formatQtyByUnit(actual.metricas?.total_consumido || actual.insumo?.cantidad, unit, { fixedWeight: true });
  const stockRestante = formatQtyByUnit(actual.metricas?.stock_restante_estimado || actual.insumo?.stock_restante_snapshot, unit, { fixedWeight: true });
  const costoConsumido = formatMoney(actual.metricas?.costo_padre_consumido || actual.costos?.costo_total_padre);
  const diferenciaCosto = formatMoney(actual.metricas?.diferencia_costo || actual.resumen?.diferencia_costo);
  const balanceOk = Boolean(actual.balance?.en_rango) && Number(actual.balance?.diferencia_costo || 0) === 0;
  const responsable = actual.actor?.nombre || actual.autorizador?.nombre || '-';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton to="/transformaciones">Volver</BackButton>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => navigate('/reportes?tab=kardex')}>
            Ver Kardex
          </Button>
          {actual.estado === 'APLICADA' ? (
            <Button variant="danger" onClick={openCancelFlow} disabled={saving}>
              Anular transformación
            </Button>
          ) : null}
        </div>
      </div>

      {(error || localError) && (
        <Alert tone="error">
          {localError || error}
        </Alert>
      )}

      <section className="rounded-3xl border border-border bg-white p-6 shadow-sm">
        <div className="space-y-3 border-b border-border pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Transformación auditada</p>
          <h1 className="text-3xl font-black tracking-tight text-text">Transformación {actual.numero}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={actual.estado}>
              {getTransformacionStatusLabel(actual.estado)}
            </StatusBadge>
            <span className="text-sm text-text-muted">{actual.tipo_proceso}</span>
            <span className="text-sm text-text-muted">{formatDateQuito(actual.fecha)}</span>
          </div>
          <p className="text-sm text-text-muted">{getTransformacionStatusHelp(actual.estado)}</p>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          <DataItem label="Padre" value={`${actual.insumo?.producto_codigo || '-'} ${actual.insumo?.producto_nombre || ''}`.trim()} />
          <DataItem label="Total del padre" value={totalDelPadre} />
          <DataItem label="Consumido" value={totalConsumido} />
          <DataItem label="Stock restante" value={stockRestante} tone="text-emerald-700" />
          <DataItem label="Responsable" value={responsable} />
          <DataItem label="Referencia lote" value={actual.referencia_lote || '-'} />
          <DataItem label="Balance" value={balanceOk ? '✓ Correcto' : 'Revisar'} tone={balanceOk ? 'text-emerald-700' : 'text-amber-700'} />
          <DataItem label="Costo consumido" value={costoConsumido} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Observación operativa</p>
            <p className="mt-2 text-sm text-text">{actual.observacion || '-'}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Diferencia costo</p>
            <p className={`mt-2 text-lg font-bold ${Number(actual.balance?.diferencia_costo || 0) === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{diferenciaCosto}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Resultados generados</p>
          <h2 className="mt-2 text-xl font-bold text-text">Salidas útiles del proceso</h2>
        </div>
        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Código</TablaCelda>
              <TablaCelda as="th">Producto</TablaCelda>
              <TablaCelda as="th">Cantidad</TablaCelda>
              <TablaCelda as="th">Costo total</TablaCelda>
              <TablaCelda as="th">Costo unitario</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {(actual.resultados || []).map((row) => (
              <TablaFila key={row.id}>
                <TablaCelda>{row.producto_codigo}</TablaCelda>
                <TablaCelda>{row.producto_nombre}</TablaCelda>
                <TablaCelda>{formatQtyByUnit(row.cantidad, row.unidad_medida, { fixedLB: true })}</TablaCelda>
                <TablaCelda>{formatMoney(row.costo_asignado)}</TablaCelda>
                <TablaCelda>{formatMoney(row.costo_unitario_resultante)}</TablaCelda>
              </TablaFila>
            ))}
          </TablaCuerpo>
        </Tabla>
      </section>

      <section className="rounded-3xl border border-border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Merma</p>
          <h2 className="mt-2 text-xl font-bold text-text">Registro clasificatorio de merma</h2>
        </div>
        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Tipo merma</TablaCelda>
              <TablaCelda as="th">Cantidad</TablaCelda>
              <TablaCelda as="th">Costo total</TablaCelda>
              <TablaCelda as="th">Motivo</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {(actual.mermas || []).map((row) => (
              <TablaFila key={row.id}>
                <TablaCelda>{row.tipo_merma}</TablaCelda>
                <TablaCelda>{formatQtyByUnit(row.cantidad, row.unidad_medida, { fixedWeight: true })}</TablaCelda>
                <TablaCelda>{formatMoney(row.costo_total)}</TablaCelda>
                <TablaCelda>{row.motivo || '-'}</TablaCelda>
              </TablaFila>
            ))}
          </TablaCuerpo>
        </Tabla>
      </section>

      <section className="rounded-3xl border border-border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Trazabilidad / movimientos</p>
          <h2 className="mt-2 text-xl font-bold text-text">Auditoría operativa del documento</h2>
        </div>
        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Hora</TablaCelda>
              <TablaCelda as="th">Tipo movimiento</TablaCelda>
              <TablaCelda as="th">Producto</TablaCelda>
              <TablaCelda as="th">Cantidad</TablaCelda>
              <TablaCelda as="th">Referencia</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {(actual.movimientos || []).map((row) => (
              <TablaFila key={row.id}>
                <TablaCelda>{formatTimeQuito(row.fecha)}</TablaCelda>
                <TablaCelda><TipoBadge tipo={row.tipo} /></TablaCelda>
                <TablaCelda>
                  {row.tipo === 'TRANSFORMACION_MERMA' || row.tipo === 'TRANSFORMACION_REVERSION_MERMA'
                    ? 'Registro clasificatorio de merma'
                    : `${row.producto_codigo || '-'} - ${row.producto_nombre || '-'}`}
                </TablaCelda>
                <TablaCelda>{formatQtyByUnit(row.cantidad, row.unidad_medida || unit, { fixedWeight: true })}</TablaCelda>
                <TablaCelda>{row.referencia}</TablaCelda>
              </TablaFila>
            ))}
          </TablaCuerpo>
        </Tabla>
      </section>

      <CancelModal
        open={showCancelModal}
        auth={auth}
        setAuth={setAuth}
        novedad={novedad}
        setNovedad={setNovedad}
        onClose={() => setShowCancelModal(false)}
        onConfirm={onConfirmAnular}
        loading={saving}
        requiresAuth={!isAdminUser}
      />
    </div>
  );
}
