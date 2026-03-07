const { z } = require('zod');
const repository = require('./categorias.repository');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');

const createSchema = z.object({
  nombre: z.string().trim().min(1),
  activo: z.boolean().optional()
});

const updateSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debe enviar al menos un campo'
});

async function list(query) {
  const filters = {
    activo: query.activo !== undefined ? query.activo === 'true' || query.activo === '1' : undefined
  };

  return repository.list(filters);
}

async function create(body) {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const exists = await repository.getByNombre(parsed.data.nombre);
  if (exists) throw new AppError(400, 'La categoría ya existe');

  return repository.create({
    nombre: parsed.data.nombre,
    activo: parsed.data.activo ?? true
  });
}

async function update(id, body) {
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const categoria = await repository.getById(id);
  if (!categoria) throw new AppError(404, 'Categoría no encontrada');

  if (parsed.data.nombre && parsed.data.nombre.toLowerCase() !== categoria.nombre.toLowerCase()) {
    const exists = await repository.getByNombre(parsed.data.nombre);
    if (exists) throw new AppError(400, 'La categoría ya existe');
  }

  return repository.update(id, parsed.data);
}

module.exports = {
  list,
  create,
  update
};
