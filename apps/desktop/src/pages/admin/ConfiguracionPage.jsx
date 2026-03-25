import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, PageHeader, Textarea } from '../../ui';
import { useConfiguracionStore } from '../../stores/configuracionStore';

function toCheckboxValue(event) {
  return Boolean(event?.target?.checked);
}

export default function ConfiguracionPage() {
  const {
    configuracion,
    metodosPago,
    loading,
    saving,
    error,
    cargarTodo,
    actualizarConfiguracion,
    actualizarMetodosPago
  } = useConfiguracionStore();

  const [form, setForm] = useState(configuracion);
  const [methodsDraft, setMethodsDraft] = useState([]);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    cargarTodo().catch(() => {});
  }, [cargarTodo]);

  useEffect(() => {
    setForm(configuracion);
  }, [configuracion]);

  useEffect(() => {
    setMethodsDraft(metodosPago);
  }, [metodosPago]);

  const enabledMethods = useMemo(
    () => methodsDraft.filter((method) => method.habilitado).map((method) => method.nombre).join(', '),
    [methodsDraft]
  );

  const updateField = (field, value) => {
    setForm((state) => ({ ...state, [field]: value }));
  };

  const toggleMethod = (methodId, checked) => {
    setMethodsDraft((state) => state.map((method) => (
      Number(method.id) === Number(methodId)
        ? { ...method, habilitado: checked }
        : method
    )));
  };

  const onSave = async () => {
    setSuccess('');

    await actualizarConfiguracion({
      ...form,
      impuesto_porcentaje: Number(form.impuesto_porcentaje || 0),
      dias_credito_cliente_default: Number(form.dias_credito_cliente_default || 0),
      dias_credito_proveedor_default: Number(form.dias_credito_proveedor_default || 0)
    });

    await actualizarMetodosPago(
      methodsDraft.map((method) => ({
        id: method.id,
        habilitado: Boolean(method.habilitado)
      }))
    );

    setSuccess('Configuración actualizada correctamente');
    await cargarTodo();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configuracion del sistema"
        description="Datos del negocio, operación, crédito, ticket, impuestos y métodos de pago"
      />

      {(error || success) && (
        <Alert tone={error ? 'error' : 'success'}>
          {error || success}
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-4 p-4">
          <h3 className="font-semibold text-[var(--color-text)]">Datos del negocio</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-[var(--color-text)]">
              Nombre
              <Input className="mt-1" value={form.negocio_nombre || ''} onChange={(e) => updateField('negocio_nombre', e.target.value)} />
            </label>
            <label className="text-sm font-medium text-[var(--color-text)]">
              RUC
              <Input className="mt-1" value={form.negocio_ruc || ''} onChange={(e) => updateField('negocio_ruc', e.target.value)} />
            </label>
            <label className="text-sm font-medium text-[var(--color-text)] md:col-span-2">
              Direccion
              <Input className="mt-1" value={form.negocio_direccion || ''} onChange={(e) => updateField('negocio_direccion', e.target.value)} />
            </label>
            <label className="text-sm font-medium text-[var(--color-text)]">
              Telefono
              <Input className="mt-1" value={form.negocio_telefono || ''} onChange={(e) => updateField('negocio_telefono', e.target.value)} />
            </label>
            <label className="text-sm font-medium text-[var(--color-text)]">
              Moneda
              <Input className="mt-1" value={form.moneda || 'USD'} onChange={(e) => updateField('moneda', e.target.value.toUpperCase())} />
            </label>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <h3 className="font-semibold text-[var(--color-text)]">Operacion</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={Boolean(form.permitir_ventas_credito)} onChange={(e) => updateField('permitir_ventas_credito', toCheckboxValue(e))} />
              Permitir ventas credito
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={Boolean(form.permitir_compras_credito)} onChange={(e) => updateField('permitir_compras_credito', toCheckboxValue(e))} />
              Permitir compras credito
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={Boolean(form.exigir_caja_abierta_para_cobros)} onChange={(e) => updateField('exigir_caja_abierta_para_cobros', toCheckboxValue(e))} />
              Exigir caja abierta para cobros
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={Boolean(form.exigir_caja_abierta_para_pagos)} onChange={(e) => updateField('exigir_caja_abierta_para_pagos', toCheckboxValue(e))} />
              Exigir caja abierta para pagos
            </label>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <h3 className="font-semibold text-[var(--color-text)]">Credito e impuestos</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-[var(--color-text)]">
              Dias credito cliente
              <Input className="mt-1" type="number" min="0" value={form.dias_credito_cliente_default ?? 0} onChange={(e) => updateField('dias_credito_cliente_default', e.target.value)} />
            </label>
            <label className="text-sm font-medium text-[var(--color-text)]">
              Dias credito proveedor
              <Input className="mt-1" type="number" min="0" value={form.dias_credito_proveedor_default ?? 0} onChange={(e) => updateField('dias_credito_proveedor_default', e.target.value)} />
            </label>
            <label className="text-sm font-medium text-[var(--color-text)]">
              Impuesto %
              <Input className="mt-1" type="number" min="0" max="100" step="0.01" value={form.impuesto_porcentaje ?? 0} onChange={(e) => updateField('impuesto_porcentaje', e.target.value)} />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-[var(--color-text)]">
              <input type="checkbox" checked={Boolean(form.precio_incluye_impuesto)} onChange={(e) => updateField('precio_incluye_impuesto', toCheckboxValue(e))} />
              Precios incluyen impuesto
            </label>
          </div>
        </Card>

        <Card className="space-y-4 p-4">
          <h3 className="font-semibold text-[var(--color-text)]">Documento y ticket</h3>
          <div className="grid gap-3">
            <label className="text-sm font-medium text-[var(--color-text)]">
              Prefijo ticket
              <Input className="mt-1" value={form.ticket_prefijo || ''} onChange={(e) => updateField('ticket_prefijo', e.target.value.toUpperCase())} />
            </label>
            <label className="text-sm font-medium text-[var(--color-text)]">
              Mensaje ticket
              <Textarea className="mt-1 min-h-24" value={form.ticket_mensaje || ''} onChange={(e) => updateField('ticket_mensaje', e.target.value)} />
            </label>
          </div>
        </Card>
      </div>

      <Card className="space-y-4 p-4">
        <div>
          <h3 className="font-semibold text-[var(--color-text)]">Metodos de pago</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Activos: {enabledMethods || 'Ninguno'}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {methodsDraft.map((method) => (
            <label key={method.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-3 text-sm text-[var(--color-text)]">
              <div>
                <p className="font-semibold">{method.nombre}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{method.codigo}</p>
              </div>
              <input type="checkbox" checked={Boolean(method.habilitado)} onChange={(e) => toggleMethod(method.id, e.target.checked)} />
            </label>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button disabled={loading || saving} onClick={onSave}>
          {saving ? 'Guardando...' : 'Guardar configuracion'}
        </Button>
      </div>
    </div>
  );
}
