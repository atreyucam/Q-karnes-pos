import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import apiClient, { normalizeResponse, parseApiError } from '../../lib/apiClient';
import {
  Alert,
  BackButton,
  Button,
  Card,
  Modal,
  PageHeader,
  Paginador,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../ui';
import { useComprasStore } from '../../stores/comprasStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit } from '../../lib/formatQty';
import { resolveCompraStatus } from './comprasStatus';

export default function CompraDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { ordenActual, recepciones, error, cargarOrden, cargarRecepciones, cancelarOrden, cerrarOrdenParcial } = useComprasStore();

  const ordenId = Number(id);
  const isReadOnly = searchParams.get('readonly') === '1';
  const [proveedorInfo, setProveedorInfo] = useState(null);
  const [actionModal, setActionModal] = useState({ open: false, mode: null });
  const [actionObservation, setActionObservation] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(ordenId) || ordenId <= 0) return;
    cargarOrden(ordenId);
    cargarRecepciones(ordenId);
  }, [ordenId, cargarOrden, cargarRecepciones]);

  useEffect(() => {
    let active = true;

    async function loadProveedorData() {
      const proveedorId = ordenActual?.orden?.proveedor_id;
      if (!proveedorId) {
        if (active) setProveedorInfo(null);
        return;
      }

      try {
        const proveedorResp = await apiClient.get(`/api/proveedores/${proveedorId}`);
        if (active) setProveedorInfo(normalizeResponse(proveedorResp.data));
      } catch (_) {
        if (active) setProveedorInfo(null);
      }
    }

    loadProveedorData();
    return () => {
      active = false;
    };
  }, [ordenActual?.orden?.proveedor_id]);

  const recepcionesCards = useMemo(() => {
    return recepciones?.recepciones || [];
  }, [recepciones]);

  const estadoMeta = resolveCompraStatus(ordenActual?.orden?.estado, ordenActual?.orden?.estado_label);
  const pendingLines = useMemo(
    () => (ordenActual?.detalle || []).filter((line) => Number(line.cantidad_pendiente ?? (Number(line.cantidad) - Number(line.cantidad_recibida))) > 0).length,
    [ordenActual?.detalle]
  );

  const closeActionModal = () => {
    setActionModal({ open: false, mode: null });
    setActionObservation('');
    setActionError('');
    setActionLoading(false);
  };

  const onConfirmAction = async () => {
    if (!ordenActual?.orden?.id || !actionModal.mode) return;
    setActionLoading(true);
    setActionError('');
    try {
      if (actionModal.mode === 'cancelar') {
        await cancelarOrden(ordenActual.orden.id, { observacion: actionObservation || undefined });
      } else {
        await cerrarOrdenParcial(ordenActual.orden.id, { observacion: actionObservation || undefined });
      }
      await Promise.all([cargarOrden(ordenId), cargarRecepciones(ordenId)]);
      closeActionModal();
    } catch (nextError) {
      setActionError(parseApiError(nextError));
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <BackButton to="/compras">Volver</BackButton>

      <PageHeader
        title={`Detalle compra #${ordenId}`}
        description="La orden registra intención de compra. La recepción define costo real e impacto en inventario."
        actions={(
          <div className="flex flex-wrap gap-2">
            {!isReadOnly && ordenActual?.orden?.estado === 'ABIERTA' && (
              <Button variant="danger" onClick={() => setActionModal({ open: true, mode: 'cancelar' })}>
                Cancelar orden
              </Button>
            )}
            {!isReadOnly && ordenActual?.orden?.estado === 'PARCIAL' && (
              <Button onClick={() => setActionModal({ open: true, mode: 'cerrar' })}>
                Cerrar pendiente
              </Button>
            )}
          </div>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}
      <Alert tone="info">
        Esta orden no ingresó stock al emitirse. Cada recepción sí actualiza stock, costo visible y valorización.
      </Alert>

      {ordenActual?.orden && (
        <Card className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Proveedor</p>
                <p className="text-[1.12rem] font-bold text-[var(--color-text)]">{ordenActual.orden.proveedor_nombre || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Telefono</p>
                <p className="font-semibold text-[var(--color-text)]">{proveedorInfo?.telefono || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Credito / dias</p>
                <p className="font-semibold text-[var(--color-text)]">{proveedorInfo?.tiene_credito ? 'SI' : 'NO'} / {Number(proveedorInfo?.dias_pago || 0)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Usuario creador</p>
                <p className="font-semibold text-[var(--color-text)]">{ordenActual.orden.usuario_creador_nombre || '-'}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Fecha emision</p>
                <p className="font-semibold text-[var(--color-text)]">{formatDateQuito(ordenActual.orden.fecha_emision || ordenActual.orden.fecha)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Observacion</p>
                <p className="font-semibold text-[var(--color-text)]">{ordenActual.orden.observacion || '-'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Pendiente residual</p>
                <p className="font-semibold text-[var(--color-text)]">{pendingLines} línea(s) pendientes</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Líneas</p>
                <p className="font-semibold text-[var(--color-text)]">{ordenActual?.detalle?.length || 0}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Estado orden</p>
                <StatusBadge status={estadoMeta.badgeStatus}>
                  {ordenActual.orden.estado_label || estadoMeta.label}
                </StatusBadge>
              </div>
            </div>
        </Card>
      )}

      {recepcionesCards.length > 0 && (
        <Card className="space-y-3 p-4">
          <p className="font-semibold text-[var(--color-text)]">Recepciones</p>
            <div className="space-y-4">
              {recepcionesCards.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-background p-3">
                  <p className="text-sm font-bold text-text">Documento {r.documento_respaldo || '-'}</p>
                  <div className="mt-2 grid grid-cols-2 gap-3 xl:grid-cols-6">
                    <div className="rounded-xl border border-border bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Fecha recepcion</p>
                      <p className="mt-1 text-sm font-semibold text-text">{formatDateQuito(r.fecha_recepcion || r.fecha)}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Factura</p>
                      <p className="mt-1 text-sm font-semibold text-text">{r.numero_factura || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Metodo</p>
                      <div className="mt-1"><StatusBadge status={r.metodo_pago || '-'} /></div>
                    </div>
                    <div className="rounded-xl border border-border bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Usuario receptor</p>
                      <p className="mt-1 text-sm font-semibold text-text">{r.usuario_receptor_nombre || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Monto</p>
                      <p className="mt-1 text-sm font-semibold text-text">{formatMoney(r.total)}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-white p-3">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Observacion</p>
                      <p className="mt-1 text-sm font-semibold text-text">{r.observacion || '-'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
        </Card>
      )}

      <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-[var(--color-text)]">Items orden</p>
            {!isReadOnly && ordenActual?.orden?.recepcionable && (
              <Button onClick={() => navigate(`/compras/ordenes/${ordenId}/cargar`)}>
                Registrar recepcion
              </Button>
            )}
          </div>
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Producto</TablaCelda>
                <TablaCelda as="th">Cantidad</TablaCelda>
                <TablaCelda as="th">Recibida</TablaCelda>
                <TablaCelda as="th">Pendiente</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {(ordenActual?.detalle || []).map((d) => {
                const unidad = String(d.unidad_medida || d.unidad || 'UND').toUpperCase();
                const pendiente = Number(d.cantidad_pendiente ?? (Number(d.cantidad) - Number(d.cantidad_recibida)));
                return (
                  <TablaFila key={d.id}>
                    <TablaCelda title={d.producto_codigo || ''}>{d.producto_nombre}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(d.cantidad, unidad, { fixedLB: true })} {unidad}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(d.cantidad_recibida, unidad, { fixedLB: true })} {unidad}</TablaCelda>
                    <TablaCelda>{formatQtyByUnit(pendiente, unidad, { fixedLB: true })} {unidad}</TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>
          <Paginador paginaActual={1} totalPaginas={1} totalRegistros={ordenActual?.detalle?.length || 0} mostrarSiempre />
      </Card>

      <Modal open={!isReadOnly && actionModal.open} onClose={closeActionModal} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              {actionModal.mode === 'cancelar' ? 'Cancelar orden' : 'Cerrar con pendiente residual'}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {actionModal.mode === 'cancelar'
                ? 'La cancelación solo es válida si nunca hubo recepción.'
                : 'Se conservará el historial recibido y se bloquearán recepciones futuras.'}
            </p>
          </div>

          {actionError && <Alert tone="error">{actionError}</Alert>}

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-sm">
            <p><strong>Orden:</strong> #{ordenActual?.orden?.id}</p>
            <p><strong>Estado actual:</strong> {ordenActual?.orden?.estado_label || estadoMeta.label}</p>
            <p><strong>Pendiente:</strong> {pendingLines} línea(s) con faltante residual</p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Observación</label>
            <Textarea
              className="mt-2"
              rows={3}
              value={actionObservation}
              onChange={(e) => setActionObservation(e.target.value)}
              placeholder={actionModal.mode === 'cancelar' ? 'Motivo de cancelación (opcional)' : 'Motivo del cierre residual (opcional)'}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="neutral" onClick={closeActionModal}>Volver</Button>
            <Button variant={actionModal.mode === 'cancelar' ? 'danger' : 'primary'} onClick={onConfirmAction} disabled={actionLoading}>
              {actionLoading ? 'Procesando...' : actionModal.mode === 'cancelar' ? 'Confirmar cancelación' : 'Cerrar orden'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
