import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../../shared/ui';
import AuditoriaResumen from './auditoria/AuditoriaResumen';
import AuditoriaEventosView from './auditoria/AuditoriaEventosView';
import AuditoriaHallazgosView from './auditoria/AuditoriaHallazgosView';

const AUDITORIA_TABS = [
  { key: 'resumen', label: 'Resumen', component: AuditoriaResumen },
  {
    key: 'ventas',
    label: 'Ventas',
    component: () => (
      <AuditoriaHallazgosView
        viewKey="ventas"
        title="Auditoria de ventas"
        description="Hallazgos vinculados a ventas, costo snapshot y caja asociada"
      />
    )
  },
  {
    key: 'inventario',
    label: 'Inventario',
    component: () => (
      <AuditoriaHallazgosView
        viewKey="inventario"
        title="Auditoria de inventario"
        description="Stock, kardex y valorizacion operativa"
      />
    )
  },
  {
    key: 'caja',
    label: 'Caja',
    component: () => (
      <AuditoriaHallazgosView
        viewKey="caja"
        title="Auditoria de caja"
        description="Diferencias de saldo, movimientos y conciliacion por turno"
      />
    )
  },
  {
    key: 'transformaciones',
    label: 'Transformaciones',
    component: () => (
      <AuditoriaHallazgosView
        viewKey="transformaciones"
        title="Auditoria de transformaciones"
        description="Conservacion de costo, mermas y descuadres de cantidades"
      />
    )
  },
  { key: 'eventos', label: 'Eventos', component: AuditoriaEventosView }
];

export default function AuditoriaPage() {
  const [params, setParams] = useSearchParams();

  const currentTab = useMemo(() => {
    const currentValue = params.get('tab');
    return AUDITORIA_TABS.find((tab) => tab.key === currentValue)?.key || AUDITORIA_TABS[0].key;
  }, [params]);

  useEffect(() => {
    if (!params.get('tab')) {
      setParams({ tab: AUDITORIA_TABS[0].key }, { replace: true });
    }
  }, [params, setParams]);

  const ActiveTab = AUDITORIA_TABS.find((tab) => tab.key === currentTab)?.component || AuditoriaResumen;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria"
        description="Supervision operativa para detectar errores criticos, advertencias y trazabilidad faltante"
      />

      <Tabs
        ariaLabel="Pestanas de auditoria"
        items={AUDITORIA_TABS}
        value={currentTab}
        onChange={(tabKey) => setParams({ tab: tabKey })}
      />

      <ActiveTab />
    </div>
  );
}
