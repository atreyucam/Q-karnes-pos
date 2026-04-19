import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../../shared/ui';
import CajaDiariaReport from './CajaDiariaReport';
import InventarioActualReport from './InventarioActualReport';
import KardexReport from './KardexReport';
import TransformacionesReport from './TransformacionesReport';
import VentasDiaReport from './VentasDiaReport';
import VentasPeriodoReport from './VentasPeriodoReport';
import VentasPorProductoReport from './VentasPorProductoReport';

const REPORT_TABS = [
  { key: 'ventas-dia', label: 'Ventas del dia', component: VentasDiaReport },
  { key: 'ventas-periodo', label: 'Ventas por periodo', component: VentasPeriodoReport },
  { key: 'ventas-producto', label: 'Ventas por producto', component: VentasPorProductoReport },
  { key: 'inventario-actual', label: 'Inventario valorizado', component: InventarioActualReport },
  { key: 'kardex', label: 'Kardex', component: KardexReport },
  { key: 'transformaciones', label: 'Transformaciones', component: TransformacionesReport },
  { key: 'caja-diaria', label: 'Caja diaria', component: CajaDiariaReport }
];

export default function ReportesPage() {
  const [params, setParams] = useSearchParams();

  const currentTab = useMemo(() => {
    const currentValue = params.get('tab');
    return REPORT_TABS.find((tab) => tab.key === currentValue)?.key || REPORT_TABS[0].key;
  }, [params]);

  useEffect(() => {
    if (!params.get('tab')) {
      setParams({ tab: REPORT_TABS[0].key }, { replace: true });
    }
  }, [params, setParams]);

  const ActiveReport = REPORT_TABS.find((tab) => tab.key === currentTab)?.component || VentasDiaReport;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Analisis financiero y operativo del negocio usando el backend como fuente unica de verdad"
      />

      <Tabs
        ariaLabel="Pestanas de reportes"
        items={REPORT_TABS}
        value={currentTab}
        onChange={(tabKey) => setParams({ tab: tabKey })}
      />

      <ActiveReport />
    </div>
  );
}
