import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
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
      <Card className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <label className="text-sm font-medium text-[var(--color-text)]">
            Fecha inicio
            <Input
              className="mt-1"
              type="date"
              value={filters.fecha_inicio}
              onChange={(event) => setFilters((state) => ({ ...state, fecha_inicio: event.target.value }))}
            />
          </label>

          <label className="text-sm font-medium text-[var(--color-text)]">
            Fecha fin
            <Input
              className="mt-1"
              type="date"
              value={filters.fecha_fin}
              onChange={(event) => setFilters((state) => ({ ...state, fecha_fin: event.target.value }))}
            />
          </label>

          <label className="text-sm font-medium text-[var(--color-text)]">
            Usuario
            <Input
              className="mt-1"
              value={filters.usuario}
              placeholder="Nombre o login"
              onChange={(event) => setFilters((state) => ({ ...state, usuario: event.target.value }))}
            />
          </label>

          <label className="text-sm font-medium text-[var(--color-text)]">
            Modulo
            <Select
              className="mt-1"
              value={filters.modulo}
              onChange={(event) => setFilters((state) => ({ ...state, modulo: event.target.value }))}
            >
              {MODULE_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>

          <label className="text-sm font-medium text-[var(--color-text)]">
            Tipo evento
            <Select
              className="mt-1"
              value={filters.tipo_evento}
              onChange={(event) => setFilters((state) => ({ ...state, tipo_evento: event.target.value }))}
            >
              {TIPO_EVENTO_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Eventos encontrados: <span className="font-semibold text-[var(--color-text)]">{eventosState.meta.total || rows.length}</span>
          </p>

          <div className="flex gap-2">
            <Button
              variant="ghost"
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
          </div>
        </div>
      </Card>

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
