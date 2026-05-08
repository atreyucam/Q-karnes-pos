import { Button, Field, FiltersBar, Input } from '../../shared/ui';
import { QUICK_RANGE_OPTIONS, buildRangeFromQuick, businessTodayString, sanitizeDateRange } from './reportesUtils';

function QuickButtons({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {QUICK_RANGE_OPTIONS.map((option) => (
        <Button
          key={option.key}
          size="sm"
          variant={value === option.key ? 'primary' : 'secondary'}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export default function ReportDateFilters({
  filters,
  setFilters,
  loading,
  onSubmit,
  submitLabel = 'Actualizar',
  extraFields = null,
  secondaryMinWidth = 180,
  showExport = false,
  onExport
}) {
  return (
    <FiltersBar
      title="Filtros"
      description="Define periodo operativo y criterios de análisis."
      secondaryMinWidth={secondaryMinWidth}
      search={(
        <Field label="Rango rápido">
          <QuickButtons
            value={filters.quick}
            onChange={(quick) => {
              if (quick === 'custom') {
                setFilters((prev) => ({ ...prev, quick }));
                return;
              }
              const today = businessTodayString();
              const range = buildRangeFromQuick(quick, today);
              setFilters((prev) => ({
                ...prev,
                quick,
                fecha_inicio: range.fecha_inicio,
                fecha_fin: range.fecha_fin
              }));
            }}
          />
        </Field>
      )}
      actions={(
        <>
          <Button
            variant="secondary"
            onClick={() => {
              const today = businessTodayString();
              const range = buildRangeFromQuick('last7', today);
              setFilters((prev) => ({
                ...prev,
                quick: 'last7',
                fecha_inicio: range.fecha_inicio,
                fecha_fin: range.fecha_fin
              }));
              onSubmit?.({
                ...filters,
                quick: 'last7',
                ...range
              });
            }}
            disabled={loading}
          >
            Reiniciar
          </Button>
          {showExport ? (
            <Button variant="secondary" onClick={onExport} disabled={loading}>
              Exportar CSV
            </Button>
          ) : null}
          <Button
            onClick={() => onSubmit?.({ ...filters, ...sanitizeDateRange(filters) })}
            disabled={loading}
          >
            {submitLabel}
          </Button>
        </>
      )}
    >
      <Field label="Fecha inicio">
        <Input
          type="date"
          value={filters.fecha_inicio}
          onChange={(event) => setFilters((prev) => ({ ...prev, quick: 'custom', fecha_inicio: event.target.value }))}
        />
      </Field>

      <Field label="Fecha fin">
        <Input
          type="date"
          value={filters.fecha_fin}
          onChange={(event) => setFilters((prev) => ({ ...prev, quick: 'custom', fecha_fin: event.target.value }))}
        />
      </Field>

      {extraFields}
    </FiltersBar>
  );
}
