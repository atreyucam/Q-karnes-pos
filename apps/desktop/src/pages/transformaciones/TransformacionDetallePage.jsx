import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  BackButton,
  Button,
  Input,
  Modal,
  PageHeader,
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

function CancelModal({ open, auth, setAuth, novedad, setNovedad, onClose, onConfirm, loading, requiresAuth }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-lg" panelClassName="p-5">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-text">Anular transformación</h3>
          <p className="text-sm text-text-muted">Esta operación revierte stock/costos y requiere autorización ADMIN.</p>
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
    obtener(transformacionId).catch((e) => setLocalError(e.message));
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
    } catch (e) {
      setLocalError(e.message);
    }
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

  return (
    <div className="space-y-5">
      <BackButton to="/transformaciones">Volver</BackButton>

      <PageHeader
        title={`Detalle transformación ${actual.numero}`}
        description="Consulta consumo, hijos, merma, costos distribuidos y movimientos asociados."
        actions={(
          <div className="flex gap-2">
            {actual.estado === 'APLICADA' && (
              <Button
                variant="danger"
                onClick={() => {
                  setAuth({ usuario: '', password: '' });
                  setNovedad('');
                  setShowCancelModal(true);
                }}
                disabled={saving}
              >
                Anular transformación
              </Button>
            )}
          </div>
        )}
      />

      {(error || localError) && (
        <Alert tone="error">
          {localError || error}
        </Alert>
      )}

        <div className="grid gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Estado</p>
            <StatusBadge status={actual.estado} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Fecha</p>
            <p className="font-semibold text-text">{formatDateQuito(actual.fecha)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Tipo</p>
            <p className="font-semibold text-text">{actual.tipo_proceso}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Actor</p>
            <p className="font-semibold text-text">{actual.actor?.nombre || '-'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Autorizador</p>
            <p className="font-semibold text-text">{actual.autorizador?.nombre || '-'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">Referencia lote</p>
            <p className="font-semibold text-text">{actual.referencia_lote || '-'}</p>
          </div>
          <div className="md:col-span-3">
            <p className="text-xs uppercase tracking-wide text-text-muted">Observación</p>
            <p className="font-semibold text-text">{actual.observacion || '-'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-text">Padre consumido</h3>
          <p className="mt-2 text-sm text-text-muted">
            {actual.insumo?.producto_codigo} - {actual.insumo?.producto_nombre}
          </p>
          <div className="mt-2 grid gap-2 text-sm text-text-muted md:grid-cols-4">
            <p>Total consumido: <strong>{formatQtyByUnit(actual.metricas?.total_consumido || actual.insumo?.cantidad, unit, { fixedWeight: true })}</strong></p>
            <p>Unidad: <strong>{unit}</strong></p>
            <p>Stock snapshot: <strong>{formatQtyByUnit(actual.insumo?.stock_disponible_snapshot, unit, { fixedWeight: true })}</strong></p>
            <p>Costo snapshot: <strong>{formatMoney(actual.insumo?.costo_unitario_snapshot)}</strong></p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-text">Productos hijo generados</h3>
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">Unidad</TablaCelda>
                <TablaCelda as="th">Costo asignado</TablaCelda>
                <TablaCelda as="th">Costo unitario resultante</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(actual.resultados || []).map((row) => (
                <TablaFila key={row.id}>
                  <TablaCelda>{row.producto_codigo} - {row.producto_nombre}</TablaCelda>
                  <TablaCelda>{formatQtyByUnit(row.cantidad, row.unidad_medida, { fixedLB: true })}</TablaCelda>
                  <TablaCelda>{row.unidad_medida}</TablaCelda>
                  <TablaCelda>{formatMoney(row.costo_asignado)}</TablaCelda>
                  <TablaCelda>{formatMoney(row.costo_unitario_resultante)}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-text">Mermas</h3>
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">Unidad</TablaCelda>
                <TablaCelda as="th">Costo total</TablaCelda>
                <TablaCelda as="th">Motivo</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(actual.mermas || []).map((row) => (
                <TablaFila key={row.id}>
                  <TablaCelda>{row.producto_codigo ? `${row.producto_codigo} - ${row.producto_nombre}` : row.tipo_merma}</TablaCelda>
                  <TablaCelda>{formatQtyByUnit(row.cantidad, row.unidad_medida, { fixedWeight: true })}</TablaCelda>
                  <TablaCelda>{row.unidad_medida}</TablaCelda>
                  <TablaCelda>{formatMoney(row.costo_total)}</TablaCelda>
                  <TablaCelda>{row.motivo}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </div>

        <div className="grid gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm md:grid-cols-2">
          <p className="text-sm text-text-muted">Total hijos: <strong>{formatQtyByUnit(actual.metricas?.total_hijos || actual.resumen?.salida_util_total, unit, { fixedWeight: true })}</strong></p>
          <p className="text-sm text-text-muted">Total merma: <strong>{formatQtyByUnit(actual.metricas?.total_merma || actual.resumen?.merma_total, unit, { fixedWeight: true })}</strong></p>
          <p className="text-sm text-text-muted">Stock restante estimado: <strong>{formatQtyByUnit(actual.metricas?.stock_restante_estimado || actual.insumo?.stock_restante_snapshot, unit, { fixedWeight: true })}</strong></p>
          <p className="text-sm text-text-muted">Costo padre consumido: <strong>{formatMoney(actual.metricas?.costo_padre_consumido || actual.costos?.costo_total_padre)}</strong></p>
          <p className="text-sm text-text-muted">Costo distribuido: <strong>{formatMoney(actual.metricas?.costo_distribuido || actual.costos?.costo_total_distribuido)}</strong></p>
          <p className="text-sm text-text-muted">Diferencia costo: <strong>{formatMoney(actual.metricas?.diferencia_costo || actual.resumen?.diferencia_costo)}</strong></p>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-text">Movimientos asociados</h3>
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Tipo</TablaCelda>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">Referencia</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(actual.movimientos || []).map((row) => (
                <TablaFila key={row.id}>
                  <TablaCelda>{formatDateQuito(row.fecha)}</TablaCelda>
                  <TablaCelda>
                    <TipoBadge tipo={row.tipo} />
                  </TablaCelda>
                  <TablaCelda>{row.producto_codigo} - {row.producto_nombre}</TablaCelda>
                  <TablaCelda>{formatQtyByUnit(row.cantidad, unit, { fixedLB: true })}</TablaCelda>
                  <TablaCelda>{row.referencia}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </div>

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
