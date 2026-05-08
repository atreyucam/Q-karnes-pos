import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, Panel, PanelHeader, StatusChip, Table, TableBody, TableCell, TableHead, TableRow } from '../../shared/ui';
import { PiArrowRight } from 'react-icons/pi';
import { formatDashboardMoney } from './dashboardFormatters';

function isExpenseRow(item) {
  const tipo = String(item?.tipo || item?.category || item?.accion || '').toUpperCase();
  const estado = String(item?.estado || '').toUpperCase();
  return (
    tipo.includes('EGRESO') ||
    tipo.includes('DEVOLUC') ||
    estado.includes('DEVOLUC') ||
    Number(item?.total || 0) < 0
  );
}

export default function DashboardLatestSalesTable({ items = [] }) {
  const navigate = useNavigate();
  const recent = items.slice(0, 5);

  return (
    <Panel className="overflow-hidden p-5">
      <PanelHeader
        title="Actividad reciente"
        description="Últimas ventas para lectura rápida en caja."
        actions={<StatusChip tone="info">{recent.length} de {items.length}</StatusChip>}
      />

      {recent.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="Sin ventas hoy"
          description="Las ventas recientes aparecerán aquí cuando exista movimiento."
        />
      ) : (
        <Table className="mt-5">
          <TableHead>
            <TableRow>
              <TableCell as="th">Hora</TableCell>
              <TableCell as="th">Movimiento</TableCell>
              <TableCell as="th">Método</TableCell>
              <TableCell as="th" className="text-right">Monto</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recent.map((item) => {
              const expense = isExpenseRow(item);
              return (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => navigate(item.id ? `/ventas/${item.id}` : '/ventas')}
                >
                  <TableCell>{item.hora}</TableCell>
                  <TableCell className="font-semibold text-[var(--color-text)]">{item.venta}</TableCell>
                  <TableCell>{item.metodo}</TableCell>
                  <TableCell className={`text-right font-bold ${expense ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
                    {formatDashboardMoney(item.total)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Button
        type="button"
        variant="neutral"
        size="sm"
        className="mt-4"
        onClick={() => navigate('/ventas')}
      >
        Ver todas las ventas
        <PiArrowRight className="text-base" />
      </Button>
    </Panel>
  );
}
