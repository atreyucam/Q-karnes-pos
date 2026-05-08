import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  FiltersBar,
  Input,
  LoadingState,
  Select,
  StatusChip,
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaFila
} from '../../../shared/ui';
import { getDefaultAuditFilters, useAuditoriaStore } from '../../../stores/auditoriaStore';
import { formatAuditDate, MODULE_OPTIONS, resolveAuditTone, TIPO_EVENTO_OPTIONS } from './auditoriaUtils';

export default function AuditoriaEventosView() {
  const eventosState = useAuditoriaStore((state) => state.eventos);
  const cargarEventos = useAuditoriaStore((state) => state.cargarEventos);
  const [filters, setFilters] = useState(getDefaultAuditFilters());

  useEffect(() => {
    if (!eventosState.loaded) {
      cargarEventos(getDefaultAuditFilters());
    }
  }, [cargarEventos, eventosState.loaded]);

  const rows = eventosState.items || [];

  return (
    <div className="space-y-5">
      <FiltersBar
        description={`Eventos encontrados: ${eventosState.meta.total || rows.length}`}
        actions={(
          <>
            <Button
              variant="neutral"
              className="w-full sm:w-auto"
              onClick={() => {
                const reset = getDefaultAuditFilters();
                setFilters(reset);
                cargarEventos(reset);
              }}
              disabled={eventosState.loading}
            >
              Limpiar filtros
            </Button>
            <Button onClick={() => cargarEventos(filters)} disabled={eventosState.loading}>
              Consultar
            </Button>
          </>
        )}
        secondaryMinWidth={190}
      >
        <Field label="Fecha de inicio">
          <Input
            type="date"
            value={filters.fecha_inicio}
            onChange={(event) => setFilters((state) => ({ ...state, fecha_inicio: event.target.value }))}
          />
        </Field>

        <Field label="Fecha de fin">
          <Input
            type="date"
            value={filters.fecha_fin}
            onChange={(event) => setFilters((state) => ({ ...state, fecha_fin: event.target.value }))}
          />
        </Field>

        <Field label="Usuario">
          <Input
            value={filters.usuario}
            placeholder="Nombre o login"
            onChange={(event) => setFilters((state) => ({ ...state, usuario: event.target.value }))}
          />
        </Field>

        <Field label="Módulo">
          <Select
            value={filters.modulo}
            onChange={(event) => setFilters((state) => ({ ...state, modulo: event.target.value }))}
          >
            {MODULE_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Tipo evento">
          <Select
            value={filters.tipo_evento}
            onChange={(event) => setFilters((state) => ({ ...state, tipo_evento: event.target.value }))}
          >
            {TIPO_EVENTO_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </Field>
      </FiltersBar>

      {eventosState.error ? <Alert tone="error">{eventosState.error}</Alert> : null}
      {eventosState.loading && !eventosState.loaded ? <LoadingState label="Consultando eventos de auditoria..." /> : null}

      <Card className="p-0">
        {rows.length === 0 && !eventosState.loading ? (
          <div className="p-4">
            <EmptyState title="Sin eventos para estos filtros" description="Ajuste fechas o quite filtros para ampliar el historial." />
          </div>
        ) : (
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Usuario</TablaCelda>
                <TablaCelda as="th">Modulo</TablaCelda>
                <TablaCelda as="th">Tipo</TablaCelda>
                <TablaCelda as="th">Accion</TablaCelda>
                <TablaCelda as="th">Entidad</TablaCelda>
                <TablaCelda as="th">Descripcion</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {rows.map((row) => (
                <TablaFila key={row.id}>
                  <TablaCelda>{formatAuditDate(row.fecha)}</TablaCelda>
                  <TablaCelda>
                    <div className="space-y-0.5">
                      <p>{row.usuario}</p>
                      {row.usuario_login ? <p className="text-xs text-[var(--color-text-muted)]">{row.usuario_login}</p> : null}
                    </div>
                  </TablaCelda>
                  <TablaCelda>{row.modulo}</TablaCelda>
                  <TablaCelda>
                    <StatusChip tone={resolveAuditTone(row.tipo_evento === 'EVENTO' ? 'OBSERVACION' : 'OK')}>
                      {row.tipo_evento}
                    </StatusChip>
                  </TablaCelda>
                  <TablaCelda>{row.accion}</TablaCelda>
                  <TablaCelda>{row.entidad} #{row.entidad_id}</TablaCelda>
                  <TablaCelda>{row.descripcion || '-'}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        )}
      </Card>
    </div>
  );
}
