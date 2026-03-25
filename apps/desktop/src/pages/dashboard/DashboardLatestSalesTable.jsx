import { EmptyState, Panel, PanelHeader, StatusChip, Table, TableBody, TableCell, TableHead, TableRow } from '../../shared/ui';
import { formatDashboardMoney } from './dashboardFormatters';

export default function DashboardLatestSalesTable({ items = [] }) {
  return (
    <Panel className="overflow-hidden p-5">
      <PanelHeader
        title="Últimas ventas"
        description="Ventas más recientes para lectura rápida del flujo comercial."
        actions={<StatusChip tone="info">{items.length} registros</StatusChip>}
      />

      {items.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="Sin ventas recientes"
          description="Las últimas ventas emitidas aparecerán aquí cuando exista actividad."
        />
      ) : (
        <Table className="mt-5">
          <TableHead>
            <TableRow>
              <TableCell as="th">Venta</TableCell>
              <TableCell as="th">Estado</TableCell>
              <TableCell as="th">Hora</TableCell>
              <TableCell as="th">Cliente</TableCell>
              <TableCell as="th">Método</TableCell>
              <TableCell as="th" className="text-right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-semibold text-[var(--color-text)]">{item.venta}</TableCell>
                <TableCell>
                  <StatusChip status={item.estado} />
                </TableCell>
                <TableCell>{item.hora}</TableCell>
                <TableCell>{item.cliente}</TableCell>
                <TableCell>
                  <StatusChip status={item.metodo} />
                </TableCell>
                <TableCell className="text-right font-semibold text-[var(--color-text)]">
                  {formatDashboardMoney(item.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
