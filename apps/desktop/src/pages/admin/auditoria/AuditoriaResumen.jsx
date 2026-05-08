import { useEffect } from 'react';
import {
  Alert,
  Card,
  EmptyState,
  LoadingState,
  MetricTile,
  StatusChip,
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaFila
} from '../../../shared/ui';
import { useAuditoriaStore } from '../../../stores/auditoriaStore';
import { buildFindings, resolveAuditTone } from './auditoriaUtils';

export default function AuditoriaResumen() {
  const view = useAuditoriaStore((state) => state.views.resumen);
  const cargarVista = useAuditoriaStore((state) => state.cargarVista);

  useEffect(() => {
    if (!view.loaded) {
      cargarVista('resumen');
    }
  }, [cargarVista, view.loaded]);

  const data = view.data;
  const hallazgos = buildFindings(data);
  const areas = data?.resumen_areas || {};

  return (
    <div className="space-y-5">
      {view.error ? <Alert tone="error">{view.error}</Alert> : null}
      {view.loading && !data ? <LoadingState label="Consultando resumen de auditoria..." /> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile value={data.estado_general || 'OK'} label="Estado general" tone="primary" />
            <MetricTile value={String((data.errores_criticos || []).length)} label="Errores criticos" tone="danger" />
            <MetricTile value={String((data.advertencias || []).length)} label="Advertencias" tone="warning" />
            <MetricTile value={String((data.observaciones || []).length)} label="Observaciones" tone="info" />
          </div>

          <Card className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Resumen por area</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Inventario, costo, caja, transformaciones y trazabilidad</p>
            </div>

            <Tabla>
              <TablaCabecera>
                <tr>
                  <TablaCelda as="th">Area</TablaCelda>
                  <TablaCelda as="th">Estado</TablaCelda>
                  <TablaCelda as="th">Hallazgos</TablaCelda>
                  <TablaCelda as="th">Registros afectados</TablaCelda>
                </tr>
              </TablaCabecera>
              <TablaCuerpo>
                {Object.entries(areas).map(([areaKey, area]) => (
                  <TablaFila key={areaKey}>
                    <TablaCelda>{areaKey}</TablaCelda>
                    <TablaCelda>
                      <StatusChip tone={resolveAuditTone(area.estado_general)}>{area.estado_general}</StatusChip>
                    </TablaCelda>
                    <TablaCelda>{area.total_hallazgos}</TablaCelda>
                    <TablaCelda>{area.total_registros_afectados}</TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          </Card>

          <Card className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Hallazgos principales</h3>
              <p className="text-sm text-[var(--color-text-muted)]">Listado agregado de errores, advertencias y observaciones</p>
            </div>

            {hallazgos.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin hallazgos" description="La auditoria no encontro inconsistencias en este momento." />
              </div>
            ) : (
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Severidad</TablaCelda>
                    <TablaCelda as="th">Codigo</TablaCelda>
                    <TablaCelda as="th">Descripcion</TablaCelda>
                    <TablaCelda as="th">Registros</TablaCelda>
                  </tr>
                </TablaCabecera>
                <TablaCuerpo>
                  {hallazgos.map((row) => (
                    <TablaFila key={row.codigo}>
                      <TablaCelda>
                        <StatusChip tone={resolveAuditTone(row.severidad)}>{row.severidad}</StatusChip>
                      </TablaCelda>
                      <TablaCelda>{row.codigo}</TablaCelda>
                      <TablaCelda>{row.mensaje}</TablaCelda>
                      <TablaCelda>{row.total}</TablaCelda>
                    </TablaFila>
                  ))}
                </TablaCuerpo>
              </Tabla>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
