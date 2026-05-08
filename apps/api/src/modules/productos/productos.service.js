const repository = require('./productos.repository');
const { z } = require('zod');
const db = require('../../db/knex');
const categoriasRepository = require('../categorias/categorias.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { quantityToBase, baseToVisible, moneyToCents } = require('../../helpers/unitPolicy');
const { resolveProductInventory, buildProductInventoryUpdatePayload } = require('../../helpers/inventoryState');

const GENERATED_CODE_PREFIX = 'QK-';
const ROLE_FIELDS = ['es_vendible', 'es_transformable', 'es_insumo', 'es_merma'];

function normalizeRoleBoolean(value) {
  return value === true || value === 1 || value === '1';
}

function normalizeRoleFlags(source = {}) {
  return {
    es_vendible: normalizeRoleBoolean(source.es_vendible),
    es_transformable: normalizeRoleBoolean(source.es_transformable),
    es_insumo: normalizeRoleBoolean(source.es_insumo),
    es_merma: normalizeRoleBoolean(source.es_merma)
  };
}

function hasExplicitRoleFlags(source = {}) {
  return ROLE_FIELDS.some((field) => source[field] !== undefined);
}

function inferLegacyRoleFlags(data = {}) {
  const unidadMedida = String(data.unidad_medida || data.unidad || 'UND').toUpperCase();
  return {
    es_vendible: true,
    es_transformable: ['LB', 'KG'].includes(unidadMedida),
    es_insumo: false,
    es_merma: false
  };
}

function assertValidRoleFlags(flags) {
  if (!ROLE_FIELDS.some((field) => flags[field])) {
    throw new AppError(400, 'El producto debe tener al menos un rol activo');
  }

  if (flags.es_merma && (flags.es_vendible || flags.es_transformable || flags.es_insumo)) {
    throw new AppError(400, 'Un producto de merma no puede combinarse con roles vendible, transformable o insumo');
  }
}

function resolveRoleFlags(data = {}, options = {}) {
  const explicitFlags = hasExplicitRoleFlags(data);
  const baseFlags = options.baseFlags ? normalizeRoleFlags(options.baseFlags) : null;
  const nextFlags = explicitFlags
    ? normalizeRoleFlags(baseFlags ? { ...baseFlags, ...data } : data)
    : (baseFlags || inferLegacyRoleFlags(data));

  assertValidRoleFlags(nextFlags);
  return nextFlags;
}

function parseBooleanQuery(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'si', 'sí'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return undefined;
}

function normalizeProduct(product) {
  const normalizedInventory = resolveProductInventory(product);
  const precioVenta = Number(normalizedInventory.precio_venta || normalizedInventory.precio_referencia || 0);
  const roles = normalizeRoleFlags(product);
  return {
    ...normalizedInventory,
    unidad_medida: normalizedInventory.unidad_medida || normalizedInventory.unidad || 'UND',
    precio_referencia: precioVenta,
    precio_venta: precioVenta,
    ...roles
  };
}

const createSchema = z.object({
  codigo: z.string().trim().min(1).optional(),
  nombre: z.string().trim().min(1),
  categoria_id: z.number().int().positive().optional().nullable(),
  unidad_medida: z.enum(['KG', 'LB', 'UND']),
  costo_promedio: z.number().nonnegative().optional(),
  precio_referencia: z.number().nonnegative().optional(),
  precio_venta: z.number().nonnegative().optional(),
  stock_actual: z.number().nonnegative().optional(),
  stock_minimo: z.number().nonnegative().optional(),
  activo: z.boolean().optional(),
  es_vendible: z.boolean().optional(),
  es_transformable: z.boolean().optional(),
  es_insumo: z.boolean().optional(),
  es_merma: z.boolean().optional()
}).superRefine((data, ctx) => {
  const vendibleExplicito = data.es_vendible !== undefined ? data.es_vendible : !hasExplicitRoleFlags(data);
  if (vendibleExplicito && data.precio_referencia === undefined && data.precio_venta === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['precio_venta'],
      message: 'Precio de venta es obligatorio'
    });
  }
});

function parseGeneratedCodeSequence(code) {
  const match = String(code || '').trim().toUpperCase().match(/^QK-(\d{3,})$/);
  return match ? Number(match[1]) : 0;
}

async function generateNextProductCode() {
  const lastCodeRow = await repository.getLastGeneratedCode();
  const nextSequence = parseGeneratedCodeSequence(lastCodeRow?.codigo) + 1;
  return `${GENERATED_CODE_PREFIX}${String(nextSequence).padStart(3, '0')}`;
}

const updateSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  categoria_id: z.number().int().positive().nullable().optional(),
  unidad_medida: z.enum(['KG', 'LB', 'UND']).optional(),
  costo_promedio: z.number().nonnegative().optional(),
  precio_referencia: z.number().nonnegative().optional(),
  precio_venta: z.number().nonnegative().optional(),
  stock_actual: z.number().nonnegative().optional(),
  stock_minimo: z.number().nonnegative().optional(),
  activo: z.boolean().optional(),
  es_vendible: z.boolean().optional(),
  es_transformable: z.boolean().optional(),
  es_insumo: z.boolean().optional(),
  es_merma: z.boolean().optional()
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
    activo: parseBooleanQuery(query.activo),
    es_vendible: parseBooleanQuery(query.es_vendible),
    es_transformable: parseBooleanQuery(query.es_transformable),
    es_insumo: parseBooleanQuery(query.es_insumo),
    es_merma: parseBooleanQuery(query.es_merma)
  };

  const rows = await repository.list(filters);
  return rows.map(normalizeProduct);
}

async function create(body) {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const codigo = parsed.data.codigo?.trim() || await generateNextProductCode();
  const exists = await repository.getByCodigo(codigo);
  if (exists) throw new AppError(400, 'El código del producto ya existe');

  if (parsed.data.categoria_id) {
    const categoria = await categoriasRepository.getById(parsed.data.categoria_id);
    if (!categoria) throw new AppError(400, 'Categoría inválida');
  }

  const roleFlags = resolveRoleFlags(parsed.data);
  const precioVenta = parsed.data.precio_venta ?? parsed.data.precio_referencia ?? 0;
  const unidadMedida = parsed.data.unidad_medida;
  const stockActualBase = quantityToBase(parsed.data.stock_actual ?? 0, unidadMedida, {
    field: 'stock_actual',
    requirePositive: false,
    allowZero: true
  });
  const stockMinimoBase = quantityToBase(parsed.data.stock_minimo ?? 0, unidadMedida, {
    field: 'stock_minimo',
    requirePositive: false,
    allowZero: true
  });
  const valorInventarioCentavos = moneyToCents((parsed.data.costo_promedio ?? 0) * (parsed.data.stock_actual ?? 0), 'valor_inventario');
  const inventoryPayload = buildProductInventoryUpdatePayload({
    unit: unidadMedida,
    stockBase: stockActualBase,
    stockMinBase: stockMinimoBase,
    valueCents: valorInventarioCentavos
  });
  const data = {
    codigo,
    nombre: parsed.data.nombre,
    categoria_id: parsed.data.categoria_id || null,
    unidad: unidadMedida,
    unidad_medida: unidadMedida,
    precio_venta: precioVenta,
    precio_referencia: precioVenta,
    activo: parsed.data.activo ?? true,
    ...inventoryPayload,
    ...roleFlags
  };

  const created = await repository.create(data);
  return normalizeProduct(created);
}

async function update(id, body, actorUser) {
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const product = await repository.getById(id);
  if (!product) throw new AppError(404, 'Producto no encontrado');

  if (parsed.data.categoria_id) {
    const categoria = await categoriasRepository.getById(parsed.data.categoria_id);
    if (!categoria) throw new AppError(400, 'Categoría inválida');
  }

  const payload = { ...parsed.data };
  const roleFlags = hasExplicitRoleFlags(parsed.data)
    ? resolveRoleFlags(parsed.data, { baseFlags: product })
    : null;
  const currentInventory = resolveProductInventory(product);

  if (parsed.data.unidad_medida) payload.unidad = parsed.data.unidad_medida;
  if (parsed.data.precio_venta !== undefined || parsed.data.precio_referencia !== undefined) {
    const precioVenta = parsed.data.precio_venta ?? parsed.data.precio_referencia;
    payload.precio_venta = precioVenta;
    payload.precio_referencia = precioVenta;
  }
  if (roleFlags) Object.assign(payload, roleFlags);

  const nextUnit = parsed.data.unidad_medida || currentInventory.unidad_operativa;
  const stockActualVisible = parsed.data.stock_actual ?? currentInventory.stock_actual;
  const stockMinimoVisible = parsed.data.stock_minimo ?? currentInventory.stock_minimo;
  const costoPromedioVisible = parsed.data.costo_promedio ?? currentInventory.costo_promedio;
  const stockActualBase = quantityToBase(stockActualVisible, nextUnit, {
    field: 'stock_actual',
    requirePositive: false,
    allowZero: true
  });
  const stockMinimoBase = quantityToBase(stockMinimoVisible, nextUnit, {
    field: 'stock_minimo',
    requirePositive: false,
    allowZero: true
  });
  const valueCents = moneyToCents(Number(stockActualVisible || 0) * Number(costoPromedioVisible || 0), 'valor_inventario');
  Object.assign(payload, buildProductInventoryUpdatePayload({
    unit: nextUnit,
    stockBase: stockActualBase,
    stockMinBase: stockMinimoBase,
    valueCents
  }));

  return db.transaction(async (trx) => {
    const updated = await repository.update(id, payload, trx);

    await auditoriaService.logEvent(
      {
        entidad: 'PRODUCTO',
        entidad_id: id,
        accion: 'MODIFICAR',
        descripcion: `Producto ${product.codigo} actualizado`,
        datos_anteriores: {
          nombre: product.nombre,
          categoria_id: product.categoria_id,
          unidad_medida: product.unidad_medida || product.unidad || 'UND',
          precio_referencia: Number(product.precio_referencia || product.precio_venta || 0),
          stock_minimo: Number(product.stock_minimo || 0),
          activo: Boolean(product.activo),
          ...normalizeRoleFlags(product)
        },
        datos_nuevos: payload,
        detalle: {
          modulo: 'PRODUCTOS',
          actor: actorUser || null,
          codigo: product.codigo,
          cambios: payload
        }
      },
      trx
    );

    return normalizeProduct(updated);
  });
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
