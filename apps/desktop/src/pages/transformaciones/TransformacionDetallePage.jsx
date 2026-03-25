import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
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
import { useTransformacionesStore } from '../../stores/transformacionesStore';

function CancelModal({ open, auth, setAuth, novedad, setNovedad, onClose, onConfirm, loading }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} maxWidthClass="max-w-lg" panelClassName="p-5">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Anular transformación</h3>
          <p className="text-sm text-slate-500">Esta operación revierte stock/costos y requiere autorización ADMIN.</p>
        </div>
        <Textarea
          className="w-full"
          rows={3}
          placeholder="Novedad de anulación"
          value={novedad}
          onChange={(e) => setNovedad(e.target.value)}
        />
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
  const { actual, loading, saving, error, obtener, anular } = useTransformacionesStore();
  const [localError, setLocalError] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [auth, setAuth] = useState({ usuario: '', password: '' });
  const [novedad, setNovedad] = useState('');

  useEffect(() => {
    if (!Number.isFinite(transformacionId) || transformacionId <= 0) return;
    obtener(transformacionId).catch((e) => setLocalError(e.message));
  }, [obtener, transformacionId]);

  const onConfirmAnular = async () => {
    if (!novedad.trim()) {
      setLocalError('Debes ingresar una novedad de anulación');
      return;
    }
    if (!auth.usuario.trim() || !auth.password) {
      setLocalError('Debes ingresar usuario y clave ADMIN');
      return;
    }
    setLocalError('');
    try {
      await anular(transformacionId, {
        novedad: novedad.trim(),
        autorizacion: { usuario: auth.usuario.trim(), password: auth.password }
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
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">{loading ? 'Cargando detalle...' : 'No se encontró la transformación solicitada.'}</p>
          <Button className="mt-3" variant="ghost" onClick={() => navigate('/transformaciones')}>
            Volver al listado
          </Button>
        </div>
      </div>
    );
  }

  const unit = actual.insumo?.unidad_medida || 'LB';

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Detalle despiece ${actual.numero}`}
        description="Trazabilidad completa de consumo, producción, merma, costos y movimientos."
        actions={(
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/transformaciones')}>
              Volver
            </Button>
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

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
            <StatusBadge status={actual.estado} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Fecha</p>
            <p className="font-semibold text-slate-800">{formatDateQuito(actual.fecha)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Tipo</p>
            <p className="font-semibold text-slate-800">{actual.tipo_proceso}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Actor</p>
            <p className="font-semibold text-slate-800">{actual.actor?.nombre || '-'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Autorizador</p>
            <p className="font-semibold text-slate-800">{actual.autorizador?.nombre || '-'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Referencia lote</p>
            <p className="font-semibold text-slate-800">{actual.referencia_lote || '-'}</p>
          </div>
          <div className="md:col-span-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Observación</p>
            <p className="font-semibold text-slate-800">{actual.observacion || '-'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800">Padre consumido</h3>
          <p className="mt-2 text-sm text-slate-700">
            {actual.insumo?.producto_codigo} - {actual.insumo?.producto_nombre}
          </p>
          <div className="mt-2 grid gap-2 text-sm text-slate-600 md:grid-cols-4">
            <p>Cantidad: <strong>{formatQtyByUnit(actual.insumo?.cantidad, unit, { fixedLB: true })}</strong></p>
            <p>Unidad: <strong>{unit}</strong></p>
            <p>Costo snapshot: <strong>{formatMoney(actual.insumo?.costo_unitario_snapshot)}</strong></p>
            <p>Costo total: <strong>{formatMoney(actual.insumo?.subtotal_costo)}</strong></p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800">Productos hijo generados</h3>
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

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800">Mermas</h3>
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Tipo</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">Unidad</TablaCelda>
                <TablaCelda as="th">Motivo</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(actual.mermas || []).map((row) => (
                <TablaFila key={row.id}>
                  <TablaCelda>{row.tipo_merma}</TablaCelda>
                  <TablaCelda>{formatQtyByUnit(row.cantidad, row.unidad_medida, { fixedLB: true })}</TablaCelda>
                  <TablaCelda>{row.unidad_medida}</TablaCelda>
                  <TablaCelda>{row.motivo}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </div>

        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
          <p className="text-sm text-slate-600">Entrada total: <strong>{formatQtyByUnit(actual.resumen?.entrada_total, unit, { fixedLB: true })}</strong></p>
          <p className="text-sm text-slate-600">Salida útil total: <strong>{formatQtyByUnit(actual.resumen?.salida_util_total, unit, { fixedLB: true })}</strong></p>
          <p className="text-sm text-slate-600">Merma total: <strong>{formatQtyByUnit(actual.resumen?.merma_total, unit, { fixedLB: true })}</strong></p>
          <p className="text-sm text-slate-600">Diferencia balance: <strong>{formatQtyByUnit(actual.resumen?.diferencia_balance, unit, { fixedLB: true })}</strong></p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800">Movimientos asociados</h3>
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
      />
    </div>
  );
}
