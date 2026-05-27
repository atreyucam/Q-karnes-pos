import { useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiEye, PiPlus, PiReceipt } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import {
  Alert,
  Button,
  Card,
  Field,
  FiltersBar,
  Input,
  PageHeader,
  Paginador,
  Select,
  StatusBadge,
  TableActions,
  TableActionButton,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda
} from '../../ui';
import { useVentasStore } from '../../stores/ventasStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';
import { Toast } from '../../shared/ui';

const PAGE_SIZE = GLOBAL_PAGE_SIZE;

export default function VentasListPage() {
  const navigate = useNavigate();
  const { ventas, ventasMeta, error, listar, imprimirTicketVenta } = useVentasStore(useShallow((s) => ({
    ventas: s.ventas,
    ventasMeta: s.ventasMeta,
    error: s.error,
    listar: s.listar,
    imprimirTicketVenta: s.imprimirTicketVenta
  })));
  const ticketImpresionActiva = useConfiguracionStore((s) => s.configuracion?.ticket_impresion_activa ?? true);

  const [filters, setFilters] = useState({ search: '', estado: 'TODOS', metodo: 'TODOS', desde: '', hasta: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagina, setPagina] = useState(1);
  const [printingSaleId, setPrintingSaleId] = useState(null);
  const [toast, setToast] = useState({ open: false, tone: 'success', text: '' });
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (!toast.open) return undefined;
    setToastVisible(true);
    const hideTimer = window.setTimeout(() => setToastVisible(false), 3800);
    const clearTimer = window.setTimeout(() => setToast({ open: false, tone: 'success', text: '' }), 4000);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  useEffect(() => {
    const controller = new AbortController();
    const offset = (pagina - 1) * PAGE_SIZE;
    listar({
      paginado: 1,
      limit: PAGE_SIZE,
      offset,
      search: debouncedSearch || undefined,
      estado: filters.estado === 'TODOS' ? undefined : filters.estado,
      metodo_pago: filters.metodo === 'TODOS' ? undefined : filters.metodo,
      desde: filters.desde || undefined,
      hasta: filters.hasta || undefined
    }, { signal: controller.signal });
    return () => controller.abort();
  }, [debouncedSearch, filters.desde, filters.estado, filters.hasta, filters.metodo, listar, pagina]);

  useEffect(() => {
    setPagina(1);
  }, [filters.desde, filters.estado, filters.hasta, filters.search, filters.metodo]);

  const ventasFiltradas = useMemo(() => ventas, [ventas]);

  const totalPaginas = Number(ventasMeta?.totalPages || 1);
  const totalRegistros = Number(ventasMeta?.total || ventasFiltradas.length);

  const handlePrintTicket = async (saleId) => {
    if (!ticketImpresionActiva) return;
    try {
      setPrintingSaleId(saleId);
      await imprimirTicketVenta(saleId);
      setToast({ open: true, tone: 'success', text: 'Ticket enviado a impresion' });
    } catch (_) {
      setToast({ open: true, tone: 'danger', text: 'No se pudo imprimir el ticket' });
    } finally {
      setPrintingSaleId(null);
    }
  };

  const canRequestReturn = (venta) => {
    const estado = String(venta?.estado || '').toUpperCase();
    return !['ANULADA', 'DEVUELTA_TOTAL'].includes(estado);
  };

  return (
    <div className="space-y-5">
      {toast.open ? (
        <div className="fixed right-5 top-5 z-[1200]">
          <Toast
            tone={toast.tone}
            title={toast.tone === 'success' ? 'Operacion completada' : 'Error de impresion'}
            description={toast.text}
            onClose={() => {
              setToastVisible(false);
              setToast({ open: false, tone: 'success', text: '' });
            }}
            className={toastVisible ? 'ui-toast-floating' : 'ui-toast-floating-out'}
          />
        </div>
      ) : null}
      <PageHeader
        title="Ventas"
        description="Consulta ventas emitidas, abre el detalle operativo y dispara devoluciones o anulaciones desde la ficha completa."
        actions={(
          <Button type="button" onClick={() => navigate('/ventas/nueva')}>
            <PiPlus className="text-base" />
            Nueva venta
          </Button>
        )}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <FiltersBar
        search={(
          <Field label="Buscar">
            <Input
              value={filters.search}
              onChange={(event) => setFilters((state) => ({ ...state, search: event.target.value }))}
              placeholder="Orden, cliente, método, vendedor o estado"
            />
          </Field>
        )}
        actions={(
          <Button
            variant="neutral"
            className="w-full xl:w-auto"
            onClick={() => setFilters({ search: '', estado: 'TODOS', metodo: 'TODOS', desde: '', hasta: '' })}
          >
            Limpiar filtros
          </Button>
        )}
      >
        <Field label="Estado">
          <Select
            value={filters.estado}
            onChange={(event) => setFilters((state) => ({ ...state, estado: event.target.value }))}
          >
            <option value="TODOS">Todos</option>
            {Array.from(new Set(ventas.map((venta) => String(venta.estado || '').trim()).filter(Boolean))).map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Desde">
          <Input
            type="date"
            value={filters.desde}
            onChange={(event) => setFilters((state) => ({ ...state, desde: event.target.value }))}
          />
        </Field>

        <Field label="Hasta">
          <Input
            type="date"
            value={filters.hasta}
            onChange={(event) => setFilters((state) => ({ ...state, hasta: event.target.value }))}
          />
        </Field>

        <Field label="Método">
          <Select
            value={filters.metodo}
            onChange={(event) => setFilters((state) => ({ ...state, metodo: event.target.value }))}
          >
            <option value="TODOS">Todos</option>
            {Array.from(new Set(ventas.map((venta) => String(venta.metodo_pago_label || '').trim()).filter(Boolean))).map((metodo) => (
              <option key={metodo} value={metodo}>
                {metodo}
              </option>
            ))}
          </Select>
        </Field>
      </FiltersBar>

      <Tabla>
        <TablaCabecera>
          <tr>
            <TablaCelda as="th">Orden</TablaCelda>
            <TablaCelda as="th">Fecha</TablaCelda>
            <TablaCelda as="th">Cliente</TablaCelda>
            <TablaCelda as="th">Metodo</TablaCelda>
            <TablaCelda as="th">Estado</TablaCelda>
            <TablaCelda as="th">Vendedor</TablaCelda>
            <TablaCelda as="th" className="text-right">Total</TablaCelda>
            <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
          </tr>
        </TablaCabecera>
        <TablaCuerpo>
          {ventasFiltradas.length === 0 ? (
            <TablaFila>
              <TablaCelda colSpan={8} className="text-center text-[var(--color-text-muted)]">
                No hay ventas para este filtro.
              </TablaCelda>
            </TablaFila>
          ) : ventasFiltradas.map((venta) => (
            <TablaFila key={venta.id}>
              <TablaCelda className="font-semibold text-[var(--color-text)]">#{venta.id}</TablaCelda>
              <TablaCelda>{formatDateQuito(venta.fecha)}</TablaCelda>
              <TablaCelda>{String(venta.cliente_nombre || '').trim() || 'Comprobante final'}</TablaCelda>
              <TablaCelda>{venta.metodo_pago_label || '-'}</TablaCelda>
              <TablaCelda>
                <StatusBadge status={venta.estado} />
              </TablaCelda>
              <TablaCelda>{venta.usuario_nombre || '-'}</TablaCelda>
              <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(venta.total || 0)}</TablaCelda>
              <TablaCelda>
                <TableActions>
                  <TableActionButton
                    variant="neutral"
                    icon={<PiEye />}
                    aria-label={`Ver venta ${venta.id}`}
                    title="Ver venta"
                    onClick={() => navigate(`/ventas/${venta.id}`)}
                  >
                    Ver
                  </TableActionButton>
                  <TableActionButton
                    variant="danger"
                    icon={<PiArrowsClockwise />}
                    aria-label={`Devolver venta ${venta.id}`}
                    title="Devolver"
                    disabled={!canRequestReturn(venta)}
                    onClick={() => navigate(`/ventas/${venta.id}?action=devolucion`)}
                  >
                    Devolver
                  </TableActionButton>
                  <TableActionButton
                    variant="neutral"
                    icon={<PiReceipt />}
                    aria-label={`Imprimir venta ${venta.id}`}
                    title="Imprimir"
                    disabled={!ticketImpresionActiva || printingSaleId === venta.id}
                    onClick={() => handlePrintTicket(venta.id)}
                  >
                    {printingSaleId === venta.id ? 'Imprimiendo...' : 'Imprimir'}
                  </TableActionButton>
                </TableActions>
              </TablaCelda>
            </TablaFila>
          ))}
        </TablaCuerpo>
      </Tabla>

      <Paginador
        paginaActual={pagina}
        totalPaginas={totalPaginas}
        totalRegistros={totalRegistros}
        mostrarSiempre
        onPageChange={setPagina}
      />
    </div>
  );
}
