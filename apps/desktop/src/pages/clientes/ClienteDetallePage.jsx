import { useEffect, useMemo, useState } from 'react';
import { PiCurrencyDollar, PiEye } from 'react-icons/pi';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  BackButton,
  Button,
  Card,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Paginador,
  Select,
  StatusBadge,
  Tabla,
  TablaCabecera,
  TablaCuerpo,
  TablaFila,
  TablaCelda,
  Textarea
} from '../../ui';
import { useClientesStore } from '../../stores/clientesStore';
import { useConfiguracionStore } from '../../stores/configuracionStore';
import { formatMoney } from '../../lib/formatMoney';
import { formatDateQuito } from '../../lib/formatDateQuito';

const PAGE_SIZE = 8;

export default function ClienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clienteDetalle, facturas, resumen, error, detalle, cargarFacturas, creditoResumen, abonar } = useClientesStore();
  const configuracion = useConfiguracionStore((state) => state.configuracion);

  const clienteId = Number(id);
  const [pagina, setPagina] = useState(1);
  const [modalAbono, setModalAbono] = useState(null);
  const [abonoForm, setAbonoForm] = useState({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
  const [abonoError, setAbonoError] = useState('');

  const loadData = async () => {
    await Promise.all([detalle(clienteId), cargarFacturas(clienteId), creditoResumen(clienteId)]);
  };

  useEffect(() => {
    if (!Number.isFinite(clienteId) || clienteId <= 0) return;
    loadData();
  }, [clienteId]);

  useEffect(() => {
    setPagina(1);
  }, [facturas.length]);

  const facturasDecoradas = useMemo(() => {
    const rows = facturas.map((row) => ({
      ...row,
      credito_pendiente: Math.max(0, Number(row.saldo || 0))
    }));

    return rows.sort((a, b) => {
      const pA = Number(a.credito_pendiente || 0) > 0 ? 0 : 1;
      const pB = Number(b.credito_pendiente || 0) > 0 ? 0 : 1;
      if (pA !== pB) return pA - pB;
      const fechaA = String(a.fecha_vencimiento || '');
      const fechaB = String(b.fecha_vencimiento || '');
      if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);
      return Number(b.id) - Number(a.id);
    });
  }, [facturas]);

  const facturasPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return facturasDecoradas.slice(start, start + PAGE_SIZE);
  }, [facturasDecoradas, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(facturasDecoradas.length / PAGE_SIZE));

  const abrirModalAbono = (factura) => {
    setModalAbono(factura);
    setAbonoForm({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
    setAbonoError('');
  };

  const registrarAbono = async () => {
    if (!modalAbono) return;

    const saldoFactura = Math.min(Number(modalAbono.credito_pendiente || 0), Number(resumen?.saldo || 0));
    const monto = Number(abonoForm.monto || 0);

    if (!(monto > 0)) {
      setAbonoError('El monto debe ser mayor a 0');
      return;
    }

    if (monto > saldoFactura) {
      setAbonoError('El monto no puede exceder el saldo pendiente');
      return;
    }

    await abonar(clienteId, {
      monto,
      venta_id: modalAbono.id,
      metodo_pago: abonoForm.metodo_pago,
      observacion: abonoForm.observacion || undefined
    });

    setModalAbono(null);
    setAbonoForm({ monto: '', metodo_pago: 'EFECTIVO', observacion: '' });
    setAbonoError('');
    await loadData();
  };

  return (
    <div className="space-y-5">
      <BackButton to="/clientes">Volver</BackButton>

      <PageHeader
        title="Detalle cliente"
        description="Facturas y gestion de abonos de credito."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {clienteDetalle && (
        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cliente</span>
                <span className="font-semibold text-[var(--color-text)]">{clienteDetalle.nombre}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Telefono</span>
                <span className="font-semibold text-[var(--color-text)]">{clienteDetalle.telefono || '-'}</span>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Estado</span>
                <StatusBadge status={clienteDetalle.activo ? 'ACTIVO' : 'INACTIVO'} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Direccion</span>
                <span className="text-[var(--color-text)]">{clienteDetalle.direccion || '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Saldo credito</span>
                <span className={`text-lg font-bold ${Number(resumen?.saldo || 0) > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                  {formatMoney(resumen?.saldo)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-0">
        <div className="flex items-center justify-between px-5 pt-5">
          <p className="font-semibold text-[var(--color-text)]">Facturas del cliente</p>
          <span className="ui-chip ui-chip-info">{facturasDecoradas.length} registros</span>
        </div>

        <Tabla>
          <TablaCabecera>
            <tr>
              <TablaCelda as="th">Venta / factura</TablaCelda>
              <TablaCelda as="th">Fecha</TablaCelda>
              <TablaCelda as="th">Metodo</TablaCelda>
              <TablaCelda as="th">Estado</TablaCelda>
              <TablaCelda as="th" className="text-right">Total</TablaCelda>
              <TablaCelda as="th" className="text-right">Credito pendiente</TablaCelda>
              <TablaCelda as="th" className="text-right">Acciones</TablaCelda>
            </tr>
          </TablaCabecera>
          <TablaCuerpo>
            {facturasPaginadas.map((f) => {
              const pendiente = Number(f.credito_pendiente || 0);
              const sinPendiente = pendiente <= 0;

              return (
                <TablaFila key={f.id}>
                  <TablaCelda className="font-semibold text-[var(--color-text)]">{f.referencia || `#${f.id}`}</TablaCelda>
                  <TablaCelda>{formatDateQuito(f.fecha)}</TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={f.metodo} />
                  </TablaCelda>
                  <TablaCelda>
                    <StatusBadge status={f.estado} />
                  </TablaCelda>
                  <TablaCelda className="text-right font-semibold text-[var(--color-text)]">{formatMoney(f.total)}</TablaCelda>
                  <TablaCelda className={`text-right font-semibold ${pendiente > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
                    {formatMoney(pendiente)}
                  </TablaCelda>
                  <TablaCelda>
                    <div className="flex justify-end gap-1">
                      <IconButton
                        variant="iconView"
                        size="sm"
                        aria-label="Ver factura"
                        title="Ver factura"
                        onClick={() => navigate(`/ventas/${f.id}`)}
                      >
                        <PiEye className="text-lg" />
                      </IconButton>
                      <IconButton
                        variant="iconSecondary"
                        size="sm"
                        aria-label="Registrar abono"
                        title={sinPendiente ? 'Sin saldo pendiente' : 'Registrar abono'}
                        disabled={sinPendiente}
                        onClick={() => abrirModalAbono(f)}
                      >
                        <PiCurrencyDollar className="text-lg" />
                      </IconButton>
                    </div>
                  </TablaCelda>
                </TablaFila>
              );
            })}
          </TablaCuerpo>
        </Tabla>

        <div className="px-5 pb-5">
          <Paginador paginaActual={pagina} totalPaginas={totalPaginas} totalRegistros={facturasDecoradas.length} mostrarSiempre onPageChange={setPagina} />
        </div>
      </Card>

      <Modal open={Boolean(modalAbono)} onClose={() => setModalAbono(null)} maxWidthClass="max-w-3xl" panelClassName="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Registrar abono</h3>
            <p className="text-xl font-bold text-[var(--color-text)]">{clienteDetalle?.nombre || '-'}</p>
            <p className="text-base font-semibold text-[var(--color-text-muted)]">
              Saldo actual: {formatMoney(Math.min(Number(modalAbono?.credito_pendiente || 0), Number(resumen?.saldo || 0)))}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setModalAbono(null)}>
            X
          </Button>
        </div>

        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Factura {modalAbono?.referencia || `#${modalAbono?.id || ''}`}</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {configuracion?.exigir_caja_abierta_para_cobros
            ? 'El método efectivo requiere turno abierto. Transferencia no impacta caja.'
            : 'Efectivo impacta caja si existe turno abierto. Transferencia no impacta caja.'}
        </p>

        {abonoError && <Alert tone="error" className="mt-3">{abonoError}</Alert>}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]">Valor</label>
            <Input className="mt-2" placeholder="10.00" value={abonoForm.monto} onChange={(e) => setAbonoForm((s) => ({ ...s, monto: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]">Método de pago</label>
            <Select
              className="mt-2"
              value={abonoForm.metodo_pago}
              onChange={(e) => setAbonoForm((s) => ({ ...s, metodo_pago: e.target.value }))}
            >
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <label className="text-sm font-medium text-[var(--color-text)]">Observacion</label>
          <Textarea className="mt-2" value={abonoForm.observacion} onChange={(e) => setAbonoForm((s) => ({ ...s, observacion: e.target.value }))} />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalAbono(null)}>
            Cancelar
          </Button>
          <Button onClick={registrarAbono}>
            Guardar abono
          </Button>
        </div>
      </Modal>
    </div>
  );
}
