import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Panel, Tabs } from '../../shared/ui';
import ReportesCajaSection from './ReportesCajaSection';
import ReportesComprasSection from './ReportesComprasSection';
import ReportesDespieceSection from './ReportesDespieceSection';
import ReportesInventarioSection from './ReportesInventarioSection';
import ReportesResumenSection from './ReportesResumenSection';
import { REPORT_SECTIONS, resolveReportSection } from './reportesSections';
import ReportesVentasSection from './ReportesVentasSection';

const SECTION_COMPONENTS = {
  resumen: ReportesResumenSection,
  ventas: ReportesVentasSection,
  caja: ReportesCajaSection,
  inventario: ReportesInventarioSection,
  compras: ReportesComprasSection,
  despiece: ReportesDespieceSection
};

export default function ReportesPage() {
  const params = useParams();
  const navigate = useNavigate();
  const section = resolveReportSection(params.section);

  if (params.section !== section) {
    return <Navigate to={`/reportes/${section}`} replace />;
  }

  const ActiveSection = SECTION_COMPONENTS[section] || ReportesResumenSection;
  const currentMeta = REPORT_SECTIONS.find((item) => item.key === section) || REPORT_SECTIONS[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Hub operativo para control comercial, financiero e inventario del negocio."
      />

      <Panel className="space-y-4 p-4">
        <Tabs
          ariaLabel="Navegación interna de reportes"
          items={REPORT_SECTIONS}
          value={section}
          onChange={(nextSection) => navigate(`/reportes/${nextSection}`)}
        />
        <p className="text-sm text-[var(--color-text-muted)]">{currentMeta.description}</p>
      </Panel>

      <ActiveSection />
    </div>
  );
}
