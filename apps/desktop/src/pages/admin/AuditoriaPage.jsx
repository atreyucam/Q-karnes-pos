import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../ui';
import { useAuditoriaStore, getDefaultAuditFilters } from '../../stores/auditoriaStore';
import { formatDateQuito } from '../../lib/formatDateQuito';

const MODULE_OPTIONS = [
  { value: '', label: 'Todos los modulos' },
  { value: 'VENTAS', label: 'Ventas' },
  { value: 'CAJA', label: 'Caja' },
  { value: 'INVENTARIO', label: 'Inventario' },
  { value: 'COMPRAS', label: 'Compras' },
  { value: 'CXC', label: 'CxC' },
  { value: 'CXP', label: 'CxP' },
  { value: 'CONFIGURACION', label: 'Configuracion' },
  { value: 'PRODUCTOS', label: 'Productos' },
  { value: 'AUTH', label: 'Auth' }
];

export default function AuditoriaPage() {
  const { eventos, meta, loading, error, cargarEventos } = useAuditoriaStore();
  const [filters, setFilters] = useState(getDefaultAuditFilters());

  useEffect(() => {
    cargarEventos(filters).catch(() => {});
  }, [cargarEventos]);

  const updateFilter = (field, value) => {
    setFilters((state) => ({ ...state, [field]: value }));
  };

  const onSearch = async () => {
    await cargarEventos(filters);
  };

  const onReset = async () => {
    const defaults = getDefaultAuditFilters();
    setFilters(defaults);
    await cargarEventos(defaults);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Auditoria operativa"
        description="Rastreo de acciones críticas del POS para supervisión y diagnóstico"
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <label className="text-sm font-medium text-[var(--color-text)]">
            Fecha inicio
            <Input
              className="mt-1"
              type="date"
              value={filters.fecha_inicio}
              onChange={(event) => updateFilter('fecha_inicio', event.target.value)}
            />
          </label>

          <label className="text-sm font-medium text-[var(--color-text)]">
            Fecha fin
            <Input
              className="mt-1"
              type="date"
              value={filters.fecha_fin}
              onChange={(event) => updateFilter('fecha_fin', event.target.value)}
            />
          </label>

          <label className="text-sm font-medium text-[var(--color-text)]">
            Usuario
            <Input
              className="mt-1"
              placeholder="Nombre o login"
              value={filters.usuario}
              onChange={(event) => updateFilter('usuario', event.target.value)}
            />
          </label>

          <label className="text-sm font-medium text-[var(--color-text)]">
            Modulo
            <Select
              className="mt-1"
              value={filters.modulo}
              onChange={(event) => updateFilter('modulo', event.target.value)}
            >
              {MODULE_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="text-sm font-medium text-[var(--color-text)]">
            Accion
            <Input
              className="mt-1"
              placeholder="VENTA, ABONO, ACTUALIZAR"
              value={filters.accion}
              onChange={(event) => updateFilter('accion', event.target.value.toUpperCase())}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Eventos encontrados: <span className="font-semibold text-[var(--color-text)]">{meta.total || eventos.length}</span>
          </p>

          <div className="flex gap-2">
            <Button tone="secondary" onClick={onReset} disabled={loading}>
              Limpiar filtros
            </Button>
            <Button onClick={onSearch} disabled={loading}>
              {loading ? 'Consultando...' : 'Consultar'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        {loading ? (
          <div className="p-6">
            <LoadingState title="Cargando auditoria" description="Consultando eventos operativos del sistema" />
          </div>
        ) : eventos.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Sin eventos para estos filtros"
              description="Ajuste el rango de fechas o quite filtros para ampliar la búsqueda."
            />
          </div>
        ) : (
          <Tabla>
            <TablaCabecera>
              <tr>
                <TablaCelda as="th">Fecha</TablaCelda>
                <TablaCelda as="th">Usuario</TablaCelda>
                <TablaCelda as="th">Modulo</TablaCelda>
                <TablaCelda as="th">Accion</TablaCelda>
                <TablaCelda as="th">Entidad</TablaCelda>
                <TablaCelda as="th">Descripcion</TablaCelda>
              </tr>
            </TablaCabecera>
            <TablaCuerpo>
              {eventos.map((evento) => (
                <TablaFila key={evento.id}>
                  <TablaCelda>{formatDateQuito(evento.fecha)}</TablaCelda>
                  <TablaCelda>
                    <div className="space-y-0.5">
                      <p>{evento.usuario}</p>
                      {evento.usuario_login && (
                        <p className="text-xs text-[var(--color-text-muted)]">{evento.usuario_login}</p>
                      )}
                    </div>
                  </TablaCelda>
                  <TablaCelda>{evento.modulo}</TablaCelda>
                  <TablaCelda>{evento.accion}</TablaCelda>
                  <TablaCelda>{evento.entidad} #{evento.entidad_id}</TablaCelda>
                  <TablaCelda>{evento.descripcion || '-'}</TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        )}
      </Card>
    </div>
  );
}
