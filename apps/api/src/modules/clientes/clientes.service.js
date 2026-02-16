const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./clientes.repository');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');

const createSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().trim().optional().nullable(),
  activo: z.boolean().optional()
});

const updateSchema = z.object({
  nombre: z.string().min(1).optional(),
  telefono: z.string().trim().optional().nullable(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debe enviar al menos un campo'
});

const abonoSchema = z.object({
  monto: z.number().positive(),
  referencia: z.string().optional(),
  observacion: z.string().optional()
});

async function list(query = {}) {
  const parsedLimit = Number(query.limit);
  const parsedOffset = Number(query.offset);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 15;
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const search = query.search ? String(query.search) : undefined;
  const includeCredito = query.include_credito === '1' || query.include_credito === 'true';
  const credito = query.credito === 'CON' || query.credito === 'SIN' ? query.credito : undefined;
  const activo = query.activo === '1' || query.activo === 'true'
    ? true
    : query.activo === '0' || query.activo === 'false'
      ? false
      : undefined;

  const filters = { limit, offset, search, include_credito: includeCredito, credito, activo };
  const [data, total] = await Promise.all([
    repository.list(filters),
    repository.count({ search, credito, activo })
  ]);

  return {
    ok: true,
    data,
    meta: {
      total,
      limit,
      offset
    }
  };
}

async function create(body) {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return repository.create({
    nombre: parsed.data.nombre,
    telefono: parsed.data.telefono || null,
    activo: parsed.data.activo ?? true
  });
}

async function update(id, body) {
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');

  if (parsed.data.activo === false) {
    const saldos = await repository.saldoCliente(id);
    const saldo = moneyRound(saldos.cargos - saldos.abonos);
    if (saldo > 0) {
      throw new AppError(400, 'No se puede inactivar cliente con saldo > 0');
    }
  }

  return repository.update(id, parsed.data);
}

async function creditoResumen(id) {
  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');

  const movs = await repository.listCxcByCliente(id);
  const saldos = await repository.saldoCliente(id);
  const saldo = moneyRound(saldos.cargos - saldos.abonos);

  return {
    cliente,
    cargos: moneyRound(saldos.cargos),
    abonos: moneyRound(saldos.abonos),
    saldo,
    movimientos: movs
  };
}

async function abono(id, body) {
  const parsed = abonoSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const cliente = await repository.getById(id, trx);
    if (!cliente) throw new AppError(404, 'Cliente no encontrado');

    const saldos = await repository.saldoCliente(id, trx);
    const saldo = moneyRound(saldos.cargos - saldos.abonos);
    const monto = moneyRound(parsed.data.monto);

    if (monto > saldo) {
      throw new AppError(400, 'El abono no puede exceder el saldo');
    }

    const movimiento = await repository.insertCxc(
      {
        cliente_id: id,
        tipo: 'ABONO',
        monto,
        referencia: parsed.data.referencia || null,
        observacion: parsed.data.observacion || 'Abono manual'
      },
      trx
    );

    return {
      ok: true,
      data: movimiento
    };
  });
}

async function getById(id) {
  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');
  return cliente;
}

async function facturas(id) {
  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');

  const rows = await repository.listFacturasByCliente(id);
  const data = rows.map((row) => {
    const contado = moneyRound(row.contado);
    const credito = moneyRound(row.credito);

    let metodo = 'CONTADO';
    if (credito > 0 && contado > 0) metodo = 'MIXTO';
    else if (credito > 0) metodo = 'CREDITO';

    return {
      ...row,
      contado,
      credito,
      metodo
    };
  });

  return { ok: true, data };
}

module.exports = {
  list,
  create,
  update,
  creditoResumen,
  abono,
  getById,
  facturas
};
