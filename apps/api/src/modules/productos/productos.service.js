const repository = require('./productos.repository');
const { z } = require('zod');
const db = require('../../db/knex');
const categoriasRepository = require('../categorias/categorias.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');

function normalizeProduct(product) {
  return {
    ...product,
    unidad_medida: product.unidad_medida || product.unidad || 'UND',
    precio_referencia: Number(product.precio_referencia || product.precio_venta || 0),
    stock_actual: Number(product.stock_actual || 0),
    stock_minimo: Number(product.stock_minimo || 0)
  };
}

const createSchema = z.object({
  codigo: z.string().trim().min(1),
  nombre: z.string().trim().min(1),
  categoria_id: z.number().int().positive().optional().nullable(),
  unidad_medida: z.enum(['LB', 'UND']),
  costo_promedio: z.number().nonnegative().optional(),
  precio_referencia: z.number().nonnegative(),
  stock_actual: z.number().nonnegative().optional(),
  stock_minimo: z.number().nonnegative().optional(),
  activo: z.boolean().optional()
});

const updateSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  categoria_id: z.number().int().positive().nullable().optional(),
  unidad_medida: z.enum(['LB', 'UND']).optional(),
  precio_referencia: z.number().nonnegative().optional(),
  stock_minimo: z.number().nonnegative().optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debe enviar al menos un campo'
});

const removeSchema = z.object({
  motivo: z.string().trim().min(1),
  novedad: z.string().trim().optional(),
  autorizacion: z.object({
    usuario: z.string().min(1),
    password: z.string().min(1)
  })
});

async function list(query) {
  const filters = {
    categoria_id: query.categoria_id ? Number(query.categoria_id) : undefined,
    search: query.search,
    activo: query.activo !== undefined ? query.activo === 'true' || query.activo === '1' : true
  };

  const rows = await repository.list(filters);
  return rows.map(normalizeProduct);
}

async function create(body) {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const exists = await repository.getByCodigo(parsed.data.codigo);
  if (exists) throw new AppError(400, 'El código del producto ya existe');

  if (parsed.data.categoria_id) {
    const categoria = await categoriasRepository.getById(parsed.data.categoria_id);
    if (!categoria) throw new AppError(400, 'Categoría inválida');
  }

  const data = {
    codigo: parsed.data.codigo,
    nombre: parsed.data.nombre,
    categoria_id: parsed.data.categoria_id || null,
    unidad: parsed.data.unidad_medida,
    unidad_medida: parsed.data.unidad_medida,
    costo_promedio: parsed.data.costo_promedio ?? 0,
    precio_venta: parsed.data.precio_referencia,
    precio_referencia: parsed.data.precio_referencia,
    stock_actual: parsed.data.stock_actual ?? 0,
    stock_minimo: parsed.data.stock_minimo ?? 0,
    activo: parsed.data.activo ?? true
  };

  const created = await repository.create(data);
  return normalizeProduct(created);
}

async function update(id, body) {
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const product = await repository.getById(id);
  if (!product) throw new AppError(404, 'Producto no encontrado');

  if (parsed.data.categoria_id) {
    const categoria = await categoriasRepository.getById(parsed.data.categoria_id);
    if (!categoria) throw new AppError(400, 'Categoría inválida');
  }

  const payload = { ...parsed.data };
  if (parsed.data.unidad_medida) payload.unidad = parsed.data.unidad_medida;
  if (parsed.data.precio_referencia !== undefined) payload.precio_venta = parsed.data.precio_referencia;

  const updated = await repository.update(id, payload);
  return normalizeProduct(updated);
}

async function getById(id) {
  const product = await repository.getById(id);
  if (!product) throw new AppError(404, 'Producto no encontrado');
  return normalizeProduct(product);
}

async function remove(id, body, actorUser) {
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    requireAlways: true,
    reason: 'borrar producto',
    auditContext: {
      modulo: 'PRODUCTOS',
      accion: 'PRODUCTO_BAJA_AUTH',
      entidad: 'PRODUCTO',
      entidad_id: id,
      referencia: `PRODUCTO:${id}`
    }
  });

  return db.transaction(async (trx) => {
    const product = await repository.getById(id, trx);
    if (!product) throw new AppError(404, 'Producto no encontrado');
    if (!product.activo) throw new AppError(400, 'El producto ya se encuentra inactivo');

    const deactivated = await repository.deactivate(id, trx);

    await auditoriaService.logEvent(
      {
        entidad: 'PRODUCTO',
        entidad_id: id,
        accion: 'BAJA_LOGICA',
        detalle: {
          modulo: 'PRODUCTOS',
          accion: 'BAJA_LOGICA',
          resultado: 'ALLOW',
          actor: actorUser,
          autorizador: authorizer,
          motivo: parsed.data.motivo,
          novedad: parsed.data.novedad || null,
          producto: {
            id: product.id,
            codigo: product.codigo,
            nombre: product.nombre
          },
          referencia: `PRODUCTO:${id}`
        }
      },
      trx
    );

    return {
      ok: true,
      data: normalizeProduct(deactivated)
    };
  });
}

module.exports = {
  list,
  create,
  update,
  getById,
  remove
};
