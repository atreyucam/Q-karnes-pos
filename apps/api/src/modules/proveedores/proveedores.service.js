const { z } = require('zod');
const repository = require('./proveedores.repository');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');

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

  return repository.list({
    include_cxp: includeCxp,
    search,
    tiene_credito: tieneCredito,
    activo
  });
}

async function create(body) {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  return repository.create({
    nombre: parsed.data.nombre,
    telefono: parsed.data.telefono || null,
    direccion: parsed.data.direccion || null,
    observacion: parsed.data.observacion || null,
    tiene_credito: parsed.data.tiene_credito ?? false,
    dias_pago: parsed.data.dias_pago ?? 0,
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
  const data = rows.map((row) => {
    const cargos = Number(row.cargos || 0);
    const abonos = Number(row.abonos || 0);
    const pendiente = moneyRound(cargos - abonos);

    return {
      ...row,
      cargos: moneyRound(cargos),
      abonos: moneyRound(abonos),
      pendiente: pendiente > 0 ? pendiente : 0
    };
  });

  return { ok: true, data };
}

async function facturaDetalle(id, facturaId) {
  const proveedor = await repository.getById(id);
  if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

  const factura = await repository.getFacturaByProveedor(id, facturaId);
  if (!factura) throw new AppError(404, 'Factura no encontrada para el proveedor');

  const [items, movimientos] = await Promise.all([
    repository.listFacturaItemsByProveedor(id, factura.id, factura.numero_factura),
    repository.listCxpMovimientosByFactura(factura.id)
  ]);

  return {
    ok: true,
    data: {
      factura,
      items,
      movimientos
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
