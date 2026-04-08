import { useEffect, useMemo, useState } from 'react';
import { PiCalendarBlank, PiCheckCircle, PiEye, PiMagnifyingGlass, PiPackage, PiPlus, PiTruck, PiX } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, IconButton, Input, MetricTile, Modal, PageHeader, Paginador, Select, StatusBadge, Tabla, TablaCabecera, TablaCuerpo, TablaFila, TablaCelda, Textarea } from '../../ui';
import { parseApiError } from '../../lib/apiClient';
import { useComprasStore } from '../../stores/comprasStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { resolveCompraStatus } from './comprasStatus';

const PAGE_SIZE = 10;

export default function ComprasPage() {
  const { ordenes, error, listarOrdenes, cancelarOrden, cerrarOrdenParcial } = useComprasStore();
  const navigate = useNavigate();
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState({ search: '', estado: 'TODOS', fecha: '' });
  const [actionModal, setActionModal] = useState({ open: false, mode: null, orden: null });
  const [actionObservation, setActionObservation] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listarOrdenes({
        search: filtros.search || undefined,
        estado: filtros.estado === 'TODOS' ? undefined : filtros.estado
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [listarOrdenes, filtros]);

  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter((orden) => {
      if (!filtros.fecha) return true;
      return String(orden.fecha_emision || orden.fecha || '').startsWith(filtros.fecha);
    });
  }, [filtros.fecha, ordenes]);

  const resumen = useMemo(() => ({
    total: ordenesFiltradas.length,
    emitidas: ordenesFiltradas.filter((orden) => orden.estado === 'ABIERTA').length,
    parciales: ordenesFiltradas.filter((orden) => orden.estado === 'PARCIAL').length,
      completas: ordenesFiltradas.filter((orden) => orden.estado === 'COMPLETA').length
  }), [ordenesFiltradas]);

  const totalPaginas = Math.max(1, Math.ceil(ordenesFiltradas.length / PAGE_SIZE));
  const ordenesPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return ordenesFiltradas.slice(start, start + PAGE_SIZE);
  }, [ordenesFiltradas, pagina]);

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const openActionModal = (mode, orden) => {
    setActionModal({ open: true, mode, orden });
    setActionObservation('');
    setActionError('');
  };

  const closeActionModal = () => {
    setActionModal({ open: false, mode: null, orden: null });
    setActionObservation('');
    setActionError('');
    setActionLoading(false);
  };

  const onConfirmAction = async () => {
    if (!actionModal.orden?.id || !actionModal.mode) return;
    setActionError('');
    setActionLoading(true);
    try {
      if (actionModal.mode === 'cancelar') {
        await cancelarOrden(actionModal.orden.id, { observacion: actionObservation || undefined });
      } else {
        await cerrarOrdenParcial(actionModal.orden.id, { observacion: actionObservation || undefined });
      }
      await listarOrdenes({
        search: filtros.search || undefined,
        estado: filtros.estado === 'TODOS' ? undefined : filtros.estado
      });
      closeActionModal();
    } catch (nextError) {
      setActionError(parseApiError(nextError));
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Órdenes de compra"
        description="La orden solo registra intención de compra. El stock, costo visible y valorización se actualizan al recepcionar."
        actions={(
          <Button onClick={() => navigate('/compras/nueva')}>
            <PiPlus className="text-base" />
            Nueva orden
          </Button>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}
      <Alert tone="info">
        La orden no define costo final ni mete stock. Usa recepción para registrar costo real y actualizar inventario.
      </Alert>

      <section className="ui-kpi-summary-shell">
        <div className="mb-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Resumen de órdenes</p>
            <p className="text-xs text-[var(--color-text-muted)]">Mismo patrón visual del panel de ventas del turno.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            icon={PiPackage}
            value={resumen.total}
            label="Total órdenes"
            tone="danger"
          />
          <MetricTile
            icon={PiCalendarBlank}
            value={resumen.emitidas}
            label="Emitidas"
            tone="primary"
          />
          <MetricTile
            icon={PiPackage}
            value={resumen.parciales}
            label="Parciales"
            tone="success"
          />
          <MetricTile
            icon={PiCheckCircle}
            value={resumen.completas}
            label="Completas"
            tone="info"
          />
        </div>
      </section>

      <Card className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_200px_180px]">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Buscar</label>
          <div className="relative mt-2">
            <PiMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input className="pl-10" placeholder="Buscar proveedor, ID u observación" value={filtros.search} onChange={(e) => setFiltros((prev) => ({ ...prev, search: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</label>
          <Select className="mt-2" value={filtros.estado} onChange={(e) => setFiltros((prev) => ({ ...prev, estado: e.target.value }))}>
            <option value="TODOS">Todos</option>
            <option value="ABIERTA">Emitida</option>
            <option value="PARCIAL">Parcial</option>
            <option value="COMPLETA">Recibida</option>
            <option value="CANCELADA">Cancelada</option>
            <option value="CERRADA_PARCIAL">Cerrada parcial</option>
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Fecha</label>
          <Input className="mt-2" type="date" value={filtros.fecha} onChange={(e) => setFiltros((prev) => ({ ...prev, fecha: e.target.value }))} />
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">#</TablaCelda>
              <TablaCelda as="th">Proveedor</TablaCelda>
              <TablaCelda as="th">Fecha</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th" className="text-right">Líneas</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {ordenesPaginadas.map((orden) => {
              const estadoMeta = resolveCompraStatus(orden.estado, orden.estado_label);
              return (
                <TablaFila key={orden.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">#{orden.id}</TablaCelda>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">{orden.proveedor_nombre || '-'}</TablaCelda>
                  <TablaCelda>{formatDateQuito(orden.fecha_emision || orden.fecha)}</TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={estadoMeta.badgeStatus}>{orden.estado_label || estadoMeta.label}</StatusBadge>
                  </TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">
                    {Number(orden.total_lineas || 0)}
                  </TablaCelda>
                  <TablaCelda>
                    <div className="flex justify-end gap-1">
                      <IconButton
                        variant="iconView"
                        size="sm"
                        aria-label={`Ver orden ${orden.id}`}
                        title="Ver orden"
                        onClick={() => navigate(`/compras/ordenes/${orden.id}`)}
                      >
                        <PiEye className="text-lg" />
                      </IconButton>
                      {orden.recepcionable && (
                        <IconButton
                          variant="iconSecondary"
                          size="sm"
                          aria-label={`Recibir orden ${orden.id}`}
                          title="Registrar recepción"
                          onClick={() => navigate(`/compras/ordenes/${orden.id}/cargar`)}
                        >
                          <PiTruck className="text-lg" />
                        </IconButton>
                      )}
                      {orden.estado === 'ABIERTA' && (
                        <IconButton
                          variant="iconDanger"
                          size="sm"
                          aria-label={`Cancelar orden ${orden.id}`}
                          title="Cancelar orden"
                          onClick={() => openActionModal('cancelar', orden)}
                        >
                          <PiX className="text-lg" />
                        </IconButton>
                      )}
                      {orden.estado === 'PARCIAL' && (
                        <IconButton
                          variant="iconSuccess"
                          size="sm"
                          aria-label={`Cerrar orden ${orden.id}`}
                          title="Cerrar pendiente"
                          onClick={() => openActionModal('cerrar', orden)}
                        >
                          <PiCheckCircle className="text-lg" />
                        </IconButton>
                      )}
                    </div>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>

        <div className="px-5 py-4">
          <Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={ordenesFiltradas.length} mostrarSiempre onPageChange={setPagina} />
        </div>
      </Card>

      <Modal open={actionModal.open} onClose={closeActionModal} maxWidthClass="max-w-lg" panelClassName="p-5">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              {actionModal.mode === 'cancelar' ? 'Cancelar orden' : 'Cerrar con pendiente residual'}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {actionModal.mode === 'cancelar'
                ? 'Solo debes usar esta acción si la orden no tuvo ninguna recepción.'
                : 'Esta acción bloquea futuras recepciones y conserva el faltante pendiente en la trazabilidad.'}
            </p>
          </div>

          {actionError && <Alert tone="error">{actionError}</Alert>}

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-sm">
            <p><strong>Orden:</strong> #{actionModal.orden?.id}</p>
            <p><strong>Proveedor:</strong> {actionModal.orden?.proveedor_nombre || '-'}</p>
            <p><strong>Estado actual:</strong> {actionModal.orden?.estado_label || resolveCompraStatus(actionModal.orden?.estado).label}</p>
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
            <Button variant="secondary" onClick={closeActionModal}>Volver</Button>
            <Button variant={actionModal.mode === 'cancelar' ? 'danger' : 'primary'} onClick={onConfirmAction} disabled={actionLoading}>
              {actionLoading ? 'Procesando...' : actionModal.mode === 'cancelar' ? 'Confirmar cancelación' : 'Cerrar orden'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
