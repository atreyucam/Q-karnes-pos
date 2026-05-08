import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Switch,
  Textarea,
  Toast
} from '../../shared/ui';
import { useConfiguracionStore } from '../../stores/configuracionStore';

const OPERACION_SWITCHES = [
  { key: 'permitir_ventas_credito', label: 'Permitir ventas a crédito', hint: 'Habilita ventas con saldo pendiente para clientes.' },
  { key: 'permitir_compras_credito', label: 'Permitir compras a crédito', hint: 'Habilita facturas por pagar a proveedores.' },
  { key: 'exigir_caja_abierta_para_cobros', label: 'Exigir caja abierta para cobros', hint: 'Bloquea cobros si no existe un turno activo.' },
  { key: 'exigir_caja_abierta_para_pagos', label: 'Exigir caja abierta para pagos', hint: 'Bloquea pagos operativos si la caja está cerrada.' }
];

function normalizeNumber(value) {
  return Number(value || 0);
}

function buildConfigPayload(form) {
  return {
    ...form,
    impuesto_porcentaje: normalizeNumber(form.impuesto_porcentaje),
    dias_credito_cliente_default: normalizeNumber(form.dias_credito_cliente_default),
    dias_credito_proveedor_default: normalizeNumber(form.dias_credito_proveedor_default)
  };
}

export default function ConfiguracionPage() {
  const {
    configuracion,
    metodosPago,
    loading,
    saving,
    error,
    initialized,
    cargarTodo,
    actualizarConfiguracion,
    actualizarMetodosPago
  } = useConfiguracionStore();

  const [form, setForm] = useState(configuracion);
  const [methodsDraft, setMethodsDraft] = useState([]);
  const [success, setSuccess] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [methodLoadingId, setMethodLoadingId] = useState(null);
  const [methodConfirm, setMethodConfirm] = useState(null);
  const [configHydrated, setConfigHydrated] = useState(false);

  useEffect(() => {
    cargarTodo().catch(() => {});
  }, [cargarTodo]);

  useEffect(() => {
    setForm(configuracion);
    setConfigHydrated(true);
  }, [configuracion]);

  useEffect(() => {
    setMethodsDraft(metodosPago);
  }, [metodosPago]);

  const enabledMethods = useMemo(
    () => methodsDraft.filter((method) => method.habilitado).map((method) => method.nombre).join(', '),
    [methodsDraft]
  );
  const configDirty = useMemo(() => {
    if (!configHydrated || loading) return false;
    return JSON.stringify(buildConfigPayload(form)) !== JSON.stringify(buildConfigPayload(configuracion));
  }, [configHydrated, configuracion, form, loading]);

  const updateField = (field, value) => {
    setForm((state) => ({ ...state, [field]: value }));
  };

  const persistMethodToggle = async ({ checked, method, nextMethods, previousMethods }) => {
    setSuccess('');
    setMethodLoadingId(method.id);

    try {
      const response = await actualizarMetodosPago(
        nextMethods.map((currentMethod) => ({
          id: currentMethod.id,
          habilitado: Boolean(currentMethod.habilitado)
        }))
      );
      setMethodsDraft(response);
      setSuccess(`Método de pago ${checked ? 'habilitado' : 'deshabilitado'}: ${method.nombre}`);
    } catch (_) {
      setMethodsDraft(previousMethods);
    } finally {
      setMethodLoadingId(null);
    }
  };

  const onMethodSwitch = (method, checked) => {
    const previousMethods = methodsDraft;
    const nextMethods = methodsDraft.map((currentMethod) => (
      Number(currentMethod.id) === Number(method.id)
        ? { ...currentMethod, habilitado: checked }
        : currentMethod
    ));

    setMethodsDraft(nextMethods);

    if (!checked) {
      setMethodConfirm({ method, nextMethods, previousMethods });
      return;
    }

    void persistMethodToggle({ checked, method, nextMethods, previousMethods });
  };

  const onSave = async () => {
    setSuccess('');

    await actualizarConfiguracion(buildConfigPayload(form));

    setSuccess('Configuración actualizada correctamente');
    await cargarTodo();
  };

  useEffect(() => {
    if (!success) return undefined;
    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 3800);
    const clearTimer = window.setTimeout(() => setSuccess(''), 4000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [success]);

  if (loading && !initialized) {
    return <LoadingState title="Cargando configuración" description="Leyendo parámetros base y métodos de pago." />;
  }

  return (
    <div className="space-y-5">
      {success ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast
            tone="success"
            title="Operacion completada"
            description={success}
            onClose={() => {
              setToastVisible(false);
              setSuccess('');
            }}
            className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}
          />
        </div>
      ) : null}

      <PageHeader
        title="Configuracion del sistema"
        description="Datos del negocio, operación, crédito, ticket, impuestos y métodos de pago"
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="p-4">
        <div className="grid gap-3">
          <div className={`rounded-2xl border px-4 py-3 ${
            configDirty
              ? 'border-[color-mix(in_oklab,var(--color-warning)_35%,white_65%)] bg-[color-mix(in_oklab,var(--color-warning)_14%,white_86%)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface-muted)]'
          }`}>
            <p className="text-sm font-semibold text-[var(--color-text)]">Cambios pendientes</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {configDirty
                ? 'Hay ajustes sin guardar en configuración general.'
                : 'No existen cambios pendientes en configuración general.'}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-semibold text-[var(--color-text)]">Datos del negocio</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Información visible en ticket, identidad y contacto del local.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre">
              <Input value={form.negocio_nombre || ''} onChange={(event) => updateField('negocio_nombre', event.target.value)} />
            </Field>

            <Field label="RUC">
              <Input value={form.negocio_ruc || ''} onChange={(event) => updateField('negocio_ruc', event.target.value)} />
            </Field>

            <Field label="Dirección" className="md:col-span-2">
              <Input value={form.negocio_direccion || ''} onChange={(event) => updateField('negocio_direccion', event.target.value)} />
            </Field>

            <Field label="Teléfono">
              <Input value={form.negocio_telefono || ''} onChange={(event) => updateField('negocio_telefono', event.target.value)} />
            </Field>

            <Field label="Moneda" hint="Se usa para formato monetario en reportes y tickets.">
              <Input value={form.moneda || 'USD'} onChange={(event) => updateField('moneda', event.target.value.toUpperCase())} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-semibold text-[var(--color-text)]">Operación</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Bandas operativas que afectan caja, crédito y flujos de pago. Los cambios de este bloque quedan pendientes hasta guardar.</p>
          </div>

          <div className="grid gap-3">
            {OPERACION_SWITCHES.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text)]">{item.label}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{item.hint}</p>
                  </div>
                  <Switch
                    checked={Boolean(form[item.key])}
                    onChange={(checked) => updateField(item.key, checked)}
                    aria-label={item.label}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-semibold text-[var(--color-text)]">Crédito e impuestos</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Parámetros por defecto para crédito comercial y tratamiento fiscal.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Días crédito cliente">
              <Input
                type="number"
                min="0"
                value={form.dias_credito_cliente_default ?? 0}
                onChange={(event) => updateField('dias_credito_cliente_default', event.target.value)}
              />
            </Field>

            <Field label="Días crédito proveedor">
              <Input
                type="number"
                min="0"
                value={form.dias_credito_proveedor_default ?? 0}
                onChange={(event) => updateField('dias_credito_proveedor_default', event.target.value)}
              />
            </Field>

            <Field label="Impuesto %" hint="Se guarda como porcentaje y se aplica en cálculos fiscales.">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.impuesto_porcentaje ?? 0}
                onChange={(event) => updateField('impuesto_porcentaje', event.target.value)}
              />
            </Field>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 md:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">Precios incluyen impuesto</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Activa cálculo inverso para precios finales cargados desde pantalla.
                  </p>
                </div>
                <Switch
                  checked={Boolean(form.precio_incluye_impuesto)}
                  onChange={(checked) => updateField('precio_incluye_impuesto', checked)}
                  aria-label="Precios incluyen impuesto"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-semibold text-[var(--color-text)]">Documento y ticket</h3>
            <p className="text-sm text-[var(--color-text-muted)]">Textos operativos visibles en comprobantes impresos.</p>
          </div>

          <div className="grid gap-4">
            <Field label="Prefijo ticket">
              <Input value={form.ticket_prefijo || ''} onChange={(event) => updateField('ticket_prefijo', event.target.value.toUpperCase())} />
            </Field>

            <Field label="Mensaje ticket">
              <Textarea className="min-h-24" value={form.ticket_mensaje || ''} onChange={(event) => updateField('ticket_mensaje', event.target.value)} />
            </Field>
          </div>
        </Card>
      </div>

      <Card className="space-y-4 p-5">
        <div>
          <h3 className="font-semibold text-[var(--color-text)]">Métodos de pago</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Activos: {enabledMethods || 'Ninguno'}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Estos switches se persisten inmediatamente. Deshabilitar requiere confirmación.</p>
        </div>

        {!methodsDraft.length ? (
          <EmptyState
            title="Sin métodos de pago"
            description="No existen métodos configurados para el sistema."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {methodsDraft.map((method) => (
              <div
                key={method.id}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text)]">{method.nombre}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{method.codigo}</p>
                  </div>
                  <Switch
                    checked={Boolean(method.habilitado)}
                    onChange={(checked) => onMethodSwitch(method, checked)}
                    busy={methodLoadingId === method.id}
                    disabled={methodLoadingId === method.id}
                    aria-label={`Estado de ${method.nombre}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button disabled={loading || saving || !configHydrated || !configDirty} onClick={onSave}>
          {saving ? 'Guardando...' : 'Guardar configuracion'}
        </Button>
      </div>

      <ConfirmDialog
        open={Boolean(methodConfirm)}
        onClose={() => {
          if (methodConfirm) setMethodsDraft(methodConfirm.previousMethods);
          setMethodConfirm(null);
        }}
        onConfirm={async () => {
          if (!methodConfirm) return;
          const currentConfirm = methodConfirm;
          setMethodConfirm(null);
          await persistMethodToggle({
            checked: false,
            method: currentConfirm.method,
            nextMethods: currentConfirm.nextMethods,
            previousMethods: currentConfirm.previousMethods
          });
        }}
        title="Deshabilitar método de pago"
        description={methodConfirm ? `Se deshabilitará ${methodConfirm.method.nombre} para nuevas operaciones.` : ''}
        confirmLabel={methodConfirm && methodLoadingId === methodConfirm.method.id ? 'Guardando...' : 'Sí, deshabilitar'}
        confirmVariant="danger"
        confirmLoading={Boolean(methodConfirm && methodLoadingId === methodConfirm.method.id)}
      />
    </div>
  );
}
