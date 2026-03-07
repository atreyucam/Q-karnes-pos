const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./cxp.repository');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');

const pagoSchema = z.object({
  factura_id: z.number().int().positive().optional(),
  monto: z.number().positive(),
  referencia: z.string().optional(),
  observacion: z.string().optional()
});

async function resumenProveedor(proveedorId) {
  const proveedor = await repository.getProveedorById(proveedorId);
  if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

  const totals = await repository.saldoByProveedor(proveedorId);
  const saldo = moneyRound(totals.cargos - totals.abonos);

  return {
    ok: true,
    data: {
      proveedor,
      cargos: moneyRound(totals.cargos),
      abonos: moneyRound(totals.abonos),
      saldo: saldo > 0 ? saldo : 0
    }
  };
}

async function pagarProveedor(proveedorId, body) {
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const proveedor = await repository.getProveedorById(proveedorId, trx);
    if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

    const monto = moneyRound(parsed.data.monto);
    const totals = await repository.saldoByProveedor(proveedorId, trx);
    const saldo = moneyRound(totals.cargos - totals.abonos);
    if (monto > saldo) throw new AppError(400, 'El pago no puede exceder el saldo pendiente');

    let facturaId = null;
    if (parsed.data.factura_id) {
      const factura = await repository.getFacturaById(parsed.data.factura_id, trx);
      if (!factura || Number(factura.proveedor_id) !== Number(proveedorId)) {
        throw new AppError(400, 'Factura inválida para este proveedor');
      }

      const facturaTotals = await repository.saldoByFactura(parsed.data.factura_id, trx);
      const facturaSaldo = moneyRound(facturaTotals.cargos - facturaTotals.abonos);
      if (monto > facturaSaldo) {
        throw new AppError(400, 'El pago excede el pendiente de la factura');
      }
      facturaId = parsed.data.factura_id;
    }

    const movimiento = await repository.insertMovimiento(
      {
        proveedor_id: proveedorId,
        factura_id: facturaId,
        tipo: 'ABONO',
        monto,
        referencia: parsed.data.referencia || null,
        observacion: parsed.data.observacion || 'Pago manual CxP'
      },
      trx
    );

    return {
      ok: true,
      data: movimiento
    };
  });
}

module.exports = {
  resumenProveedor,
  pagarProveedor
};
