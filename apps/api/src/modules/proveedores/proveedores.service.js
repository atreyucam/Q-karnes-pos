const { z } = require('zod');
const repository = require('./proveedores.repository');
const configuracionService = require('../configuracion/configuracion.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');
const { computeDebtStatus } = require('../../helpers/credit');

const PAYMENT_CODES = {
  EFECTIVO: 'EFECTIVO',
  TRANSFERENCIA: 'TRANSFERENCIA'
};

function toUpper(value) {
  return String(value || '').trim().toUpperCase();
}

function stripPaymentCodeTag(observacion) {
  return String(observacion || '')
    .replace(/^\[MP:[A-Z_]+\]\s*/i, '')
    .trim();
}

function extractPaymentCodeTag(observacion) {
  const match = String(observacion || '').match(/^\[MP:([A-Z_]+)\]/i);
  return match ? String(match[1] || '').toUpperCase() : null;
}

function parseBankFromObservation(observacion = '') {
  const match = String(observacion || '').match(/(?:^|\|)\s*Banco\s*:\s*([^|]+)/i);
  return match ? String(match[1] || '').trim() : '';
}

function parseReferenceFromObservation(observacion = '') {
  const match = String(observacion || '').match(/(?:^|\|)\s*Ref(?:erencia)?\s*:\s*([^|]+)/i);
  return match ? String(match[1] || '').trim() : '';
}

function resolvePagoProveedorMethodCode(movimiento, cashMovement) {
  const taggedCode = toUpper(extractPaymentCodeTag(movimiento?.observacion));
  const cashCode = toUpper(cashMovement?.metodo_pago);
  if (taggedCode) return taggedCode;
  if (cashCode) return cashCode;

  const inferredBank = parseBankFromObservation(movimiento?.observacion);
  const inferredRef = parseReferenceFromObservation(movimiento?.observacion);
  const hasTransferHint = Boolean(
    inferredBank
    || inferredRef
    || String(movimiento?.referencia || '').trim()
  );
  return hasTransferHint ? PAYMENT_CODES.TRANSFERENCIA : PAYMENT_CODES.EFECTIVO;
}

function paymentLabelFromCode(code) {
  const normalized = toUpper(code);
  if (normalized === PAYMENT_CODES.TRANSFERENCIA) return 'Transferencia';
  return 'Efectivo';
}

function conditionLabelFromMetodoPago(metodoPago) {
  return toUpper(metodoPago) === 'CREDITO' ? 'Crédito' : 'Contado';
}

function mapFacturaResumenRow(row) {
  const cargos = Number(row.cargos || 0);
  const abonos = Number(row.abonos || 0);
  const pendiente = moneyRound(cargos - abonos);
  const pagado = moneyRound(abonos);
  const total = moneyRound(row.total || cargos);

  return {
    ...row,
    total,
    cargos: moneyRound(cargos),
    abonos: pagado,
    pagado: pagado > total ? total : pagado,
    pendiente: pendiente > 0 ? pendiente : 0,
    condicion: conditionLabelFromMetodoPago(row.metodo_pago),
    estado: pendiente > 0 ? 'PENDIENTE' : 'PAGADA',
    estado_deuda: computeDebtStatus({
      saldo: pendiente,
      fecha_vencimiento: row.fecha_vencimiento
    })
  };
}

const createSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().trim().optional().nullable(),
  direccion: z.string().trim().optional().nullable(),
  observacion: z.string().trim().optional().nullable(),
  tiene_credito: z.boolean().optional(),
  dias_pago: z.number().int().nonnegative().optional(),
  activo: z.boolean().optional()
});

const updateSchema = z.object({
  nombre: z.string().min(1).optional(),
  telefono: z.string().trim().optional().nullable(),
  direccion: z.string().trim().optional().nullable(),
  observacion: z.string().trim().optional().nullable(),
  tiene_credito: z.boolean().optional(),
  dias_pago: z.number().int().nonnegative().optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debe enviar al menos un campo'
});

async function list(query = {}) {
  const parsedLimit = Number(query.limit);
  const parsedOffset = Number(query.offset);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 20;
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  const includeCxp = query.include_cxp === '1' || query.include_cxp === 'true';
  const search = query.search ? String(query.search) : undefined;
  const tieneCredito = query.tiene_credito === '1' || query.tiene_credito === 'true'
    ? true
    : query.tiene_credito === '0' || query.tiene_credito === 'false'
      ? false
      : undefined;
  const activo = query.activo === '1' || query.activo === 'true'
    ? true
    : query.activo === '0' || query.activo === 'false'
      ? false
      : undefined;

  const filters = {
    include_cxp: includeCxp,
    search,
    tiene_credito: tieneCredito,
    activo,
    limit,
    offset
  };
  const items = await repository.list(filters);
  const usePaginationEnvelope = ['1', 'true'].includes(String(query.paginado || '').toLowerCase());
  if (!usePaginationEnvelope) return items;

  const total = await repository.count(filters);
  return {
    items,
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}

async function create(body) {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  const config = await configuracionService.getRuntimeConfig();
  return repository.create({
    nombre: parsed.data.nombre,
    telefono: parsed.data.telefono || null,
    direccion: parsed.data.direccion || null,
    observacion: parsed.data.observacion || null,
    tiene_credito: parsed.data.tiene_credito ?? false,
    dias_pago: parsed.data.dias_pago ?? (parsed.data.tiene_credito ? Number(config.dias_credito_proveedor_default || 0) : 0),
    activo: parsed.data.activo ?? true
  });
}

async function update(id, body) {
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const existing = await repository.getById(id);
  if (!existing) throw new AppError(404, 'Proveedor no encontrado');

  return repository.update(id, parsed.data);
}

async function historialPrecios(id) {
  const existing = await repository.getById(id);
  if (!existing) throw new AppError(404, 'Proveedor no encontrado');
  return repository.historialPrecios(id);
}

async function getById(id) {
  const proveedor = await repository.getById(id);
  if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');
  return proveedor;
}

async function facturas(id) {
  const proveedor = await repository.getById(id);
  if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

  const rows = await repository.listFacturasByProveedor(id);
  const data = rows.map(mapFacturaResumenRow);

  return { ok: true, data };
}

async function facturaDetalle(id, facturaId) {
  const proveedor = await repository.getById(id);
  if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

  const factura = await repository.getFacturaByProveedor(id, facturaId);
  if (!factura) throw new AppError(404, 'Factura no encontrada para el proveedor');

  const [items, movimientos, facturaResumen] = await Promise.all([
    repository.listFacturaItemsByProveedor(id, factura.id, factura.numero_factura),
    repository.listCxpMovimientosByFactura(factura.id),
    repository.getFacturaResumenByProveedor(id, factura.id)
  ]);

  const facturaDoc = facturaResumen ? mapFacturaResumenRow(facturaResumen) : mapFacturaResumenRow({
    ...factura,
    cargos: factura.total,
    abonos: 0
  });

  const subtotalItems = moneyRound(
    (items || []).reduce((acc, item) => acc + Number(item.subtotal || 0), 0)
  );
  const totalFactura = moneyRound(facturaDoc.total || factura.total || subtotalItems);
  const subtotalFactura = subtotalItems > 0 ? subtotalItems : totalFactura;
  const descuentoFactura = moneyRound(Math.max(0, subtotalFactura - totalFactura));

  const cargos = moneyRound(
    (movimientos || [])
      .filter((row) => row.tipo === 'CARGO')
      .reduce((acc, row) => acc + Number(row.monto || 0), 0)
  ) || totalFactura;
  const pagado = moneyRound(
    (movimientos || [])
      .filter((row) => row.tipo === 'ABONO')
      .reduce((acc, row) => acc + Number(row.monto || 0), 0)
  );
  const pendiente = moneyRound(Math.max(0, cargos - pagado));

  const abonos = (movimientos || []).filter((row) => row.tipo === 'ABONO');
  const cashRows = await repository.listCashMovementsByCxpOrigins(abonos.map((row) => row.id));
  const cashByOrigin = new Map(cashRows.map((row) => [Number(row.origen_id), row]));

  let runningSaldo = cargos;
  const saldoDespuesByAbonoId = new Map();
  const movimientosCronologicos = [...(movimientos || [])].sort((a, b) => {
    const fechaA = a?.fecha ? new Date(a.fecha).getTime() : 0;
    const fechaB = b?.fecha ? new Date(b.fecha).getTime() : 0;
    if (fechaA !== fechaB) return fechaA - fechaB;
    return Number(a.id || 0) - Number(b.id || 0);
  });
  for (const movimiento of movimientosCronologicos) {
    const monto = moneyRound(Number(movimiento.monto || 0));
    if (movimiento.tipo === 'ABONO') {
      runningSaldo = moneyRound(Math.max(0, runningSaldo - monto));
      saldoDespuesByAbonoId.set(Number(movimiento.id), runningSaldo);
    } else if (movimiento.tipo === 'CARGO' && Number(movimiento.id) !== Number(movimientosCronologicos[0]?.id)) {
      runningSaldo = moneyRound(runningSaldo + monto);
    }
  }

  const pagos = abonos
    .map((movimiento) => {
      const cashMovement = cashByOrigin.get(Number(movimiento.id));
      const metodoPago = resolvePagoProveedorMethodCode(movimiento, cashMovement);
      const banco = parseBankFromObservation(movimiento.observacion);
      const referenciaFromObs = parseReferenceFromObservation(movimiento.observacion);
      const referencia = String(movimiento.referencia || '').trim() || referenciaFromObs || null;

      return {
        id: movimiento.id,
        tipo: 'ABONO',
        metodo_pago: metodoPago,
        metodo_pago_label: paymentLabelFromCode(metodoPago),
        monto: moneyRound(movimiento.monto),
        fecha: movimiento.fecha,
        banco: banco || null,
        referencia,
        observacion: stripPaymentCodeTag(movimiento.observacion) || null,
        saldo_despues: moneyRound(saldoDespuesByAbonoId.get(Number(movimiento.id)) ?? pendiente)
      };
    })
    .sort((a, b) => {
      const fechaA = a?.fecha ? new Date(a.fecha).getTime() : 0;
      const fechaB = b?.fecha ? new Date(b.fecha).getTime() : 0;
      if (fechaA !== fechaB) return fechaB - fechaA;
      return Number(b.id || 0) - Number(a.id || 0);
    });

  return {
    ok: true,
    data: {
      factura: {
        ...factura,
        condicion: conditionLabelFromMetodoPago(factura.metodo_pago),
        pendiente,
        pagado,
        orden_id: facturaDoc.orden_id || factura.orden_id || null,
        recepcion_id: facturaDoc.recepcion_id || null,
        fecha_vencimiento: facturaDoc.fecha_vencimiento || null,
        estado_deuda: facturaDoc.estado_deuda,
        estado_pago: pendiente > 0 ? 'PENDIENTE' : 'PAGADA'
      },
      items,
      movimientos,
      pagos,
      resumen_financiero: {
        subtotal: subtotalFactura,
        descuento: descuentoFactura,
        total: totalFactura,
        pagado,
        pendiente
      }
    }
  };
}

module.exports = {
  list,
  create,
  update,
  historialPrecios,
  getById,
  facturas,
  facturaDetalle
};
