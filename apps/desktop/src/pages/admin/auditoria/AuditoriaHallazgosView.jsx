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

export default function AuditoriaHallazgosView({ viewKey, title, description }) {
  const view = useAuditoriaStore((state) => state.views[viewKey]);
  const cargarVista = useAuditoriaStore((state) => state.cargarVista);

  useEffect(() => {
    if (!view.loaded) {
      cargarVista(viewKey);
    }
  }, [cargarVista, view.loaded, viewKey]);

  const data = view.data;
  const hallazgos = buildFindings(data);

  return (
    <div className="space-y-5">
      {view.error ? <Alert tone="error">{view.error}</Alert> : null}
      {view.loading && !data ? <LoadingState label={`Consultando ${title.toLowerCase()}...`} /> : null}

      {data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile value={data.estado_general || 'OK'} label="Estado general" tone="primary" />
            <MetricTile value={String(data.total_hallazgos || 0)} label="Hallazgos" tone="danger" />
            <MetricTile value={String((data.errores_criticos || []).length)} label="Errores criticos" tone="danger" />
            <MetricTile value={String((data.advertencias || []).length)} label="Advertencias" tone="warning" />
          </div>

          <Card className="p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-4">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">{title}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
            </div>

            {hallazgos.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Sin hallazgos" description="No se detectaron problemas para esta area." />
              </div>
            ) : (
              <Tabla>
                <TablaCabecera>
                  <tr>
                    <TablaCelda as="th">Severidad</TablaCelda>
                    <TablaCelda as="th">Codigo</TablaCelda>
                    <TablaCelda as="th">Descripcion</TablaCelda>
                    <TablaCelda as="th">Registros</TablaCelda>
                    <TablaCelda as="th">Ejemplo</TablaCelda>
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
                      <TablaCelda>
                        {Array.isArray(row.ejemplos) && row.ejemplos.length > 0 ? JSON.stringify(row.ejemplos[0]) : '-'}
                      </TablaCelda>
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
