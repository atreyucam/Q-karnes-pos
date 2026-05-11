import { lazy, Suspense } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LoadingState, PageHeader, Panel, Tabs } from '../../shared/ui';
import {
  REPORT_SECTIONS,
  resolveInventoryTab,
  resolveLegacyReportLocation,
  resolveReportSection
} from './reportesSections';

const ReportesResumenSection = lazy(() => import('./ReportesResumenSection'));
const ReportesVentasSection = lazy(() => import('./ReportesVentasSection'));
const ReportesCajaSection = lazy(() => import('./ReportesCajaSection'));
const ReportesInventarioSection = lazy(() => import('./ReportesInventarioSection'));

const SECTION_COMPONENTS = {
  resumen: ReportesResumenSection,
  ventas: ReportesVentasSection,
  caja: ReportesCajaSection,
  inventario: ReportesInventarioSection
};

function buildLegacyRedirect({ section, tab }) {
  if (section === 'inventario' && tab) {
    return `/reportes/inventario?tab=${resolveInventoryTab(tab)}`;
  }
  return `/reportes/${section}`;
}

export default function ReportesPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sectionParam = params.section;
  const legacyLocation = resolveLegacyReportLocation(sectionParam, searchParams.get('tab'));

  if (legacyLocation) {
    return <Navigate to={buildLegacyRedirect(legacyLocation)} replace />;
  }

  if (!sectionParam) {
    return <Navigate to="/reportes/resumen" replace />;
  }

  const section = resolveReportSection(sectionParam);
  if (sectionParam !== section) {
    return <Navigate to={`/reportes/${section}`} replace />;
  }

  const ActiveSection = SECTION_COMPONENTS[section] || ReportesResumenSection;
  const currentMeta = REPORT_SECTIONS.find((item) => item.key === section) || REPORT_SECTIONS[0];

  return (
    <div className="reportes-theme space-y-6">
      <PageHeader
        title="Reportes"
        description="Hub operativo simplificado para ventas, caja e inventario."
      />

      <Panel className="space-y-4 p-4">
        <Tabs
          className="reportes-tabs-primary"
          ariaLabel="Navegación principal de reportes"
          items={REPORT_SECTIONS}
          value={section}
          onChange={(nextSection) => navigate(`/reportes/${nextSection}`)}
        />
        <p className="text-sm text-[var(--color-text-muted)]">{currentMeta.description}</p>
      </Panel>

      <Suspense fallback={<LoadingState label="Cargando sección de reportes..." />}>
        <ActiveSection />
      </Suspense>
    </div>
  );
}
