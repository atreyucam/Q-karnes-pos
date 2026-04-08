const db = require('../../db/knex');

function stockBaseExpression(alias = 'p') {
  return `
    CASE
      WHEN COALESCE(${alias}.stock_actual_base, 0) != 0 THEN COALESCE(${alias}.stock_actual_base, 0)
      WHEN UPPER(COALESCE(${alias}.unidad_medida, ${alias}.unidad, 'UND')) = 'UND'
        THEN CAST(ROUND(CAST(COALESCE(${alias}.stock_actual, 0) AS REAL), 0) AS INTEGER)
      WHEN UPPER(COALESCE(${alias}.unidad_medida, ${alias}.unidad, 'UND')) = 'KG'
        THEN CAST(ROUND(CAST(COALESCE(${alias}.stock_actual, 0) AS REAL) * 100000000000, 0) AS INTEGER)
      WHEN UPPER(COALESCE(${alias}.unidad_medida, ${alias}.unidad, 'UND')) = 'LB'
        THEN CAST(ROUND(CAST(COALESCE(${alias}.stock_actual, 0) AS REAL) * 45359237000, 0) AS INTEGER)
      ELSE 0
    END
  `;
}

function movementQuantityBaseExpression(movAlias = 'im', prodAlias = 'p') {
  return `
    CASE
      WHEN COALESCE(${movAlias}.cantidad_base, 0) != 0 THEN COALESCE(${movAlias}.cantidad_base, 0)
      WHEN UPPER(COALESCE(${prodAlias}.unidad_medida, ${prodAlias}.unidad, 'UND')) = 'UND'
        THEN CAST(ROUND(CAST(COALESCE(${movAlias}.cantidad, 0) AS REAL), 0) AS INTEGER)
      WHEN UPPER(COALESCE(${prodAlias}.unidad_medida, ${prodAlias}.unidad, 'UND')) = 'KG'
        THEN CAST(ROUND(CAST(COALESCE(${movAlias}.cantidad, 0) AS REAL) * 100000000000, 0) AS INTEGER)
      WHEN UPPER(COALESCE(${prodAlias}.unidad_medida, ${prodAlias}.unidad, 'UND')) = 'LB'
        THEN CAST(ROUND(CAST(COALESCE(${movAlias}.cantidad, 0) AS REAL) * 45359237000, 0) AS INTEGER)
      ELSE 0
    END
  `;
}

function baseAuditQuery(trx = db) {
  return trx('auditoria_eventos as ae')
    .leftJoin('usuarios as u', 'ae.usuario_id', 'u.id')
    .leftJoin('roles as r', 'u.rol_id', 'r.id')
    .select(
      'ae.id',
      'ae.usuario_id',
      'ae.tipo_evento',
      'ae.accion',
      'ae.modulo',
      'ae.entidad',
      'ae.entidad_id',
      'ae.descripcion',
      'ae.detalle',
      'ae.antes',
      'ae.despues',
      'ae.datos_anteriores',
      'ae.datos_nuevos',
      'ae.fecha_evento',
      'ae.fecha',
      'u.nombre as usuario_nombre',
      'u.usuario as usuario_login',
      'r.nombre as usuario_rol'
    );
}

async function createAudit(event, trx = db) {
  const timestamp = trx.fn.now();
  const [id] = await trx('auditoria_eventos').insert({
    usuario_id: event.usuario_id || null,
    tipo_evento: event.tipo_evento || 'EVENTO',
    modulo: event.modulo || 'SISTEMA',
    entidad: event.entidad,
    entidad_id: String(event.entidad_id),
    accion: event.accion,
    descripcion: event.descripcion || null,
    detalle: JSON.stringify(event.detalle || {}),
    antes: event.antes || null,
    despues: event.despues || null,
    datos_anteriores: event.datos_anteriores || null,
    datos_nuevos: event.datos_nuevos || null,
    fecha: timestamp,
    fecha_evento: timestamp
  });
  return id;
}

async function getByEntity(entidad, entidadId, trx = db) {
  return baseAuditQuery(trx)
    .where('ae.entidad', entidad)
    .andWhere('ae.entidad_id', String(entidadId))
    .orderBy('ae.fecha_evento', 'desc')
    .orderBy('ae.id', 'desc');
}

async function listAudit(filters = {}, trx = db) {
  const query = baseAuditQuery(trx);

  if (filters.fecha_inicio) {
    query.whereRaw("date(coalesce(ae.fecha_evento, ae.fecha)) >= date(?)", [filters.fecha_inicio]);
  }

  if (filters.fecha_fin) {
    query.whereRaw("date(coalesce(ae.fecha_evento, ae.fecha)) <= date(?)", [filters.fecha_fin]);
  }

  if (filters.modulo) {
    query.andWhereRaw('UPPER(ae.modulo) = ?', [String(filters.modulo).trim().toUpperCase()]);
  }

  if (filters.accion) {
    query.andWhereRaw('UPPER(ae.accion) = ?', [String(filters.accion).trim().toUpperCase()]);
  }

  if (filters.tipo_evento) {
    query.andWhereRaw('UPPER(ae.tipo_evento) = ?', [String(filters.tipo_evento).trim().toUpperCase()]);
  }

  if (filters.usuario_id) {
    query.andWhere('ae.usuario_id', Number(filters.usuario_id));
  } else if (filters.usuario_search) {
    const term = `%${filters.usuario_search}%`;
    query.andWhere((builder) => {
      builder.where('u.nombre', 'like', term).orWhere('u.usuario', 'like', term);
    });
  }

  const limit = Number(filters.limit || 100);
  const offset = Number(filters.offset || 0);

  return query
    .orderBy('ae.fecha_evento', 'desc')
    .orderBy('ae.id', 'desc')
    .limit(limit)
    .offset(offset);
}

async function countAudit(filters = {}, trx = db) {
  const query = trx('auditoria_eventos as ae')
    .leftJoin('usuarios as u', 'ae.usuario_id', 'u.id')
    .count({ total: '*' })
    .first();

  if (filters.fecha_inicio) {
    query.whereRaw("date(coalesce(ae.fecha_evento, ae.fecha)) >= date(?)", [filters.fecha_inicio]);
  }

  if (filters.fecha_fin) {
    query.whereRaw("date(coalesce(ae.fecha_evento, ae.fecha)) <= date(?)", [filters.fecha_fin]);
  }

  if (filters.modulo) {
    query.andWhereRaw('UPPER(ae.modulo) = ?', [String(filters.modulo).trim().toUpperCase()]);
  }

  if (filters.accion) {
    query.andWhereRaw('UPPER(ae.accion) = ?', [String(filters.accion).trim().toUpperCase()]);
  }

  if (filters.tipo_evento) {
    query.andWhereRaw('UPPER(ae.tipo_evento) = ?', [String(filters.tipo_evento).trim().toUpperCase()]);
  }

  if (filters.usuario_id) {
    query.andWhere('ae.usuario_id', Number(filters.usuario_id));
  } else if (filters.usuario_search) {
    const term = `%${filters.usuario_search}%`;
    query.andWhere((builder) => {
      builder.where('u.nombre', 'like', term).orWhere('u.usuario', 'like', term);
    });
  }

  const row = await query;
  return Number(row?.total || 0);
}

async function listNegativeStock(trx = db) {
  return trx('productos')
    .select('id as producto_id', 'codigo', 'nombre', 'stock_actual')
    .select(trx.raw(`${stockBaseExpression('productos')} as stock_actual_base`))
    .whereRaw(`${stockBaseExpression('productos')} < 0`)
    .orderBy('stock_actual_base', 'asc');
}

async function listInventoryOriginlessMovements(trx = db) {
  return trx('inventario_movimientos as im')
    .join('productos as p', 'p.id', 'im.producto_id')
    .select(
      'im.id',
      'im.fecha',
      'im.tipo',
      'im.producto_id',
      'p.codigo',
      'p.nombre',
      'im.referencia'
    )
    .where((qb) => {
      qb.whereNull('im.origen_tipo').orWhereRaw("TRIM(COALESCE(im.origen_tipo, '')) = ''");
    })
    .andWhere((qb) => {
      qb.whereNull('im.referencia').orWhereRaw("TRIM(COALESCE(im.referencia, '')) = ''");
    })
    .whereNotIn('im.tipo', ['AJUSTE_SEED_INICIAL'])
    .orderBy('im.fecha', 'desc')
    .orderBy('im.id', 'desc');
}

async function listInventoryMissingBalanceResults(trx = db) {
  return trx('inventario_movimientos as im')
    .join('productos as p', 'p.id', 'im.producto_id')
    .select(
      'im.id',
      'im.fecha',
      'im.tipo',
      'im.producto_id',
      'p.codigo',
      'p.nombre',
      'im.referencia',
      'im.origen_tipo',
      'im.origen_id'
    )
    .whereRaw('COALESCE(im.signo, 0) != 0')
    .whereNull('im.saldo_resultante_base')
    .whereNotIn('im.tipo', ['AJUSTE_SEED_INICIAL'])
    .orderBy('im.fecha', 'desc')
    .orderBy('im.id', 'desc');
}

async function listInventoryBalanceMismatches(trx = db) {
  return trx.raw(`
    SELECT *
    FROM (
      SELECT
        im.id,
        im.fecha,
        im.tipo,
        im.producto_id,
        p.codigo,
        p.nombre,
        im.saldo_resultante_base AS saldo_resultante_base_stored,
        COALESCE(im.saldo_resultante_base, 0) AS saldo_resultante_base,
        SUM((${movementQuantityBaseExpression('im', 'p')}) * COALESCE(im.signo, 0))
          OVER (
            PARTITION BY im.producto_id
            ORDER BY datetime(im.fecha), im.id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS saldo_calculado_base
      FROM inventario_movimientos im
      JOIN productos p ON p.id = im.producto_id
    ) movimientos
    WHERE saldo_resultante_base_stored IS NOT NULL
      AND COALESCE(saldo_resultante_base, 0) != COALESCE(saldo_calculado_base, 0)
    ORDER BY datetime(fecha) DESC, id DESC
  `).then((result) => result);
}

async function listInventoryProductBalanceGaps(trx = db) {
  return trx('productos as p')
    .leftJoin('inventario_movimientos as im', 'im.producto_id', 'p.id')
    .groupBy('p.id', 'p.codigo', 'p.nombre', 'p.stock_actual_base', 'p.stock_actual', 'p.unidad_medida', 'p.unidad')
    .select(
      'p.id as producto_id',
      'p.codigo',
      'p.nombre',
      trx.raw(`${stockBaseExpression('p')} as stock_actual_base`),
      trx.raw(`COALESCE(SUM((${movementQuantityBaseExpression('im', 'p')}) * COALESCE(im.signo, 0)), 0) as saldo_movimientos_base`)
    )
    .havingRaw(`${stockBaseExpression('p')} != COALESCE(SUM((${movementQuantityBaseExpression('im', 'p')}) * COALESCE(im.signo, 0)), 0)`)
    .orderBy('p.nombre', 'asc');
}

async function listSalesMissingSnapshot(trx = db) {
  return trx('venta_detalle as vd')
    .join('ventas as v', 'v.id', 'vd.venta_id')
    .join('productos as p', 'p.id', 'vd.producto_id')
    .select(
      'vd.id',
      'vd.venta_id',
      'vd.producto_id',
      'p.codigo',
      'p.nombre',
      'v.fecha'
    )
    .whereNot('v.estado', 'ANULADA')
    .andWhere((qb) => {
      qb.whereNull('vd.costo_unit_snapshot')
        .orWhere('vd.costo_unit_snapshot', '<=', 0)
        .orWhereNull('vd.subtotal_costo_centavos')
        .orWhere('vd.subtotal_costo_centavos', '<=', 0);
    })
    .orderBy('v.fecha', 'desc')
    .orderBy('vd.id', 'desc');
}

async function listReturnsWithoutOriginalSnapshot(trx = db) {
  return trx.raw(`
    SELECT
      dd.id,
      dd.devolucion_id,
      d.venta_id,
      vd.producto_id,
      p.codigo,
      p.nombre,
      dd.cantidad_base,
      COALESCE(dd.subtotal_costo_centavos, 0) AS costo_devolucion_centavos,
      CAST(ROUND(
        CASE
          WHEN COALESCE(vd.cantidad_base, 0) <= 0 THEN 0
          ELSE
            (CAST(COALESCE(vd.subtotal_costo_centavos, 0) AS REAL) * CAST(COALESCE(dd.cantidad_base, 0) AS REAL))
            / CAST(vd.cantidad_base AS REAL)
        END
      , 0) AS INTEGER) AS costo_esperado_centavos
    FROM devolucion_detalle dd
    JOIN devoluciones d ON d.id = dd.devolucion_id
    JOIN venta_detalle vd ON vd.id = dd.venta_detalle_id
    JOIN productos p ON p.id = vd.producto_id
    WHERE COALESCE(dd.subtotal_costo_centavos, 0) != CAST(ROUND(
      CASE
        WHEN COALESCE(vd.cantidad_base, 0) <= 0 THEN 0
        ELSE
          (CAST(COALESCE(vd.subtotal_costo_centavos, 0) AS REAL) * CAST(COALESCE(dd.cantidad_base, 0) AS REAL))
          / CAST(vd.cantidad_base AS REAL)
      END
    , 0) AS INTEGER)
    ORDER BY d.fecha DESC, dd.id DESC
  `).then((result) => result);
}

async function listTransformacionCostMismatches(trx = db) {
  return trx('transformaciones as t')
    .select(
      't.id',
      't.numero',
      't.fecha',
      't.estado',
      't.costo_total_padre_centavos',
      't.costo_total_distribuido_centavos',
      't.costo_total_merma_centavos',
      trx.raw(`
        COALESCE((
          SELECT SUM(COALESCE(r.costo_asignado_centavos, 0))
          FROM transformacion_resultados r
          WHERE r.transformacion_id = t.id
        ), 0) as hijos_asignados_centavos
      `),
      trx.raw(`
        COALESCE((
          SELECT SUM(COALESCE(m.costo_total_centavos, 0))
          FROM transformacion_mermas m
          WHERE m.transformacion_id = t.id
        ), 0) as merma_asignada_centavos
      `)
    )
    .where('t.estado', 'APLICADA')
    .andWhereRaw(`
      COALESCE(t.costo_total_padre_centavos, 0)
      != COALESCE((
        SELECT SUM(COALESCE(r.costo_asignado_centavos, 0))
        FROM transformacion_resultados r
        WHERE r.transformacion_id = t.id
      ), 0) + COALESCE((
        SELECT SUM(COALESCE(m.costo_total_centavos, 0))
        FROM transformacion_mermas m
        WHERE m.transformacion_id = t.id
      ), 0)
    `)
    .orderBy('t.fecha', 'desc')
    .orderBy('t.id', 'desc');
}

async function listTransformacionZeroMerma(trx = db) {
  return trx('transformaciones as t')
    .leftJoin('transformacion_mermas as tm', 'tm.transformacion_id', 't.id')
    .groupBy(
      't.id',
      't.numero',
      't.fecha',
      't.estado'
    )
    .select(
      't.id',
      't.numero',
      't.fecha',
      't.estado',
      trx.raw('COALESCE(SUM(COALESCE(tm.cantidad_base, 0)), 0) as merma_total_base')
    )
    .where('t.estado', 'APLICADA')
    .havingRaw('COALESCE(SUM(COALESCE(tm.cantidad_base, 0)), 0) = 0')
    .orderBy('t.fecha', 'desc')
    .orderBy('t.id', 'desc');
}

async function listTransformacionQuantityMismatches(trx = db) {
  return trx('transformaciones as t')
    .select(
      't.id',
      't.numero',
      't.fecha',
      't.estado',
      't.cantidad_padre_base',
      trx.raw(`
        COALESCE((
          SELECT SUM(COALESCE(r.cantidad_base, 0))
          FROM transformacion_resultados r
          WHERE r.transformacion_id = t.id
        ), 0) as resultados_total_base
      `),
      trx.raw(`
        COALESCE((
          SELECT SUM(COALESCE(m.cantidad_base, 0))
          FROM transformacion_mermas m
          WHERE m.transformacion_id = t.id
        ), 0) as merma_total_base
      `)
    )
    .where('t.estado', 'APLICADA')
    .andWhereRaw(`
      COALESCE(t.cantidad_padre_base, 0)
      != COALESCE((
        SELECT SUM(COALESCE(r.cantidad_base, 0))
        FROM transformacion_resultados r
        WHERE r.transformacion_id = t.id
      ), 0) + COALESCE((
        SELECT SUM(COALESCE(m.cantidad_base, 0))
        FROM transformacion_mermas m
        WHERE m.transformacion_id = t.id
      ), 0)
    `)
    .orderBy('t.fecha', 'desc')
    .orderBy('t.id', 'desc');
}

async function listIncompleteValuations(trx = db) {
  return trx('inventario_movimientos as im')
    .join('productos as p', 'p.id', 'im.producto_id')
    .select(
      'im.id',
      'im.fecha',
      'im.tipo',
      'im.producto_id',
      'p.codigo',
      'p.nombre',
      'im.origen_tipo',
      'im.origen_id',
      'im.referencia'
    )
    .where('im.signo', '>', 0)
    .whereNotIn('im.tipo', ['AJUSTE_SEED_INICIAL'])
    .andWhere((qb) => {
      qb.whereNull('im.costo_total_centavos')
        .orWhereNull('im.costo_unitario')
        .orWhereNotExists(function valuationExists() {
          this.select('iv.id')
            .from('inventario_valorizacion as iv')
            .whereRaw('iv.producto_id = im.producto_id')
            .andWhereRaw("COALESCE(iv.origen_tipo, '') = COALESCE(im.origen_tipo, '')")
            .andWhereRaw('COALESCE(iv.origen_id, -1) = COALESCE(im.origen_id, -1)')
            .limit(1);
        });
    })
    .orderBy('im.fecha', 'desc')
    .orderBy('im.id', 'desc');
}

async function listReceptionMissingValuation(trx = db) {
  return trx('inventario_movimientos as im')
    .join('productos as p', 'p.id', 'im.producto_id')
    .leftJoin('compras_recepciones as cr', 'cr.id', 'im.origen_id')
    .select(
      'im.id',
      'im.fecha',
      'im.producto_id',
      'p.codigo',
      'p.nombre',
      'im.origen_id as recepcion_id',
      'cr.orden_id',
      'im.referencia'
    )
    .whereRaw("UPPER(COALESCE(im.origen_tipo, '')) = 'RECEPCION'")
    .where('im.signo', '>', 0)
    .andWhere((qb) => {
      qb.whereNull('im.costo_total_centavos')
        .orWhereNull('im.costo_unitario')
        .orWhereNotExists(function valuationExists() {
          this.select('iv.id')
            .from('inventario_valorizacion as iv')
            .whereRaw('iv.producto_id = im.producto_id')
            .andWhereRaw("UPPER(COALESCE(iv.origen_tipo, '')) = 'RECEPCION'")
            .andWhereRaw('COALESCE(iv.origen_id, -1) = COALESCE(im.origen_id, -1)')
            .limit(1);
        });
    })
    .orderBy('im.fecha', 'desc')
    .orderBy('im.id', 'desc');
}

async function listUnsafeCancelledTransformations(trx = db) {
  return trx('transformaciones as t')
    .select(
      't.id',
      't.numero',
      't.fecha',
      't.fecha_aplicacion',
      't.fecha_anulacion',
      trx.raw(`
        COALESCE((
          SELECT COUNT(*)
          FROM transformacion_resultados r
          WHERE r.transformacion_id = t.id
        ), 0) as resultados_esperados
      `),
      trx.raw(`
        COALESCE((
          SELECT COUNT(*)
          FROM inventario_movimientos im
          WHERE im.referencia = 'TRANSFORMACION_ANULACION:' || CAST(t.id AS TEXT)
            AND im.tipo = 'TRANSFORMACION_ANULACION_PRODUCCION'
        ), 0) as reversos_hijos
      `),
      trx.raw(`
        COALESCE((
          SELECT COUNT(*)
          FROM inventario_movimientos im
          WHERE im.referencia = 'TRANSFORMACION_ANULACION:' || CAST(t.id AS TEXT)
            AND im.tipo = 'TRANSFORMACION_ANULACION_CONSUMO'
        ), 0) as reversos_padre
      `)
    )
    .where('t.estado', 'ANULADA')
    .andWhere(function unsafeCancelledTransformationPredicate() {
      this.whereRaw(`
        COALESCE((
          SELECT COUNT(*)
          FROM inventario_movimientos im
          WHERE im.referencia = 'TRANSFORMACION_ANULACION:' || CAST(t.id AS TEXT)
            AND im.tipo = 'TRANSFORMACION_ANULACION_CONSUMO'
        ), 0) = 0
      `).orWhereRaw(`
        COALESCE((
          SELECT COUNT(*)
          FROM inventario_movimientos im
          WHERE im.referencia = 'TRANSFORMACION_ANULACION:' || CAST(t.id AS TEXT)
            AND im.tipo = 'TRANSFORMACION_ANULACION_PRODUCCION'
        ), 0) < COALESCE((
          SELECT COUNT(*)
          FROM transformacion_resultados r
          WHERE r.transformacion_id = t.id
        ), 0)
      `);
    })
    .orderBy('t.fecha_anulacion', 'desc')
    .orderBy('t.id', 'desc');
}

async function listCashMovementMismatches(trx = db) {
  return trx('ventas as v')
    .leftJoin(
      trx('venta_pagos as vp')
        .select('vp.venta_id')
        .select(
          trx.raw(`
            COALESCE(
              SUM(
                CASE
                  WHEN COALESCE(vp.afecta_caja, 0) = 1
                    THEN COALESCE(vp.monto_centavos, CAST(ROUND(CAST(COALESCE(vp.monto, 0) AS REAL) * 100, 0) AS INTEGER))
                  ELSE 0
                END
              ),
              0
            ) as esperado_centavos
          `)
        )
        .groupBy('vp.venta_id')
        .as('pagos'),
      'pagos.venta_id',
      'v.id'
    )
    .leftJoin(
      trx('caja_movimientos as cm')
        .where('cm.tipo', 'VENTA_CONTADO')
        .groupBy('cm.origen_id')
        .select('cm.origen_id')
        .select(
          trx.raw(`
            COALESCE(
              SUM(COALESCE(cm.monto_centavos, CAST(ROUND(CAST(COALESCE(cm.monto, 0) AS REAL) * 100, 0) AS INTEGER))),
              0
            ) as registrado_centavos
          `)
        )
        .as('caja'),
      'caja.origen_id',
      'v.id'
    )
    .select(
      'v.id as venta_id',
      'v.fecha',
      'v.referencia',
      trx.raw('COALESCE(pagos.esperado_centavos, 0) as esperado_centavos'),
      trx.raw('COALESCE(caja.registrado_centavos, 0) as registrado_centavos')
    )
    .whereNot('v.estado', 'ANULADA')
    .whereRaw('COALESCE(pagos.esperado_centavos, 0) != COALESCE(caja.registrado_centavos, 0)')
    .orderBy('v.fecha', 'desc')
    .orderBy('v.id', 'desc');
}

async function listCashSalesWithoutMovement(trx = db) {
  return trx('ventas as v')
    .leftJoin(
      trx('venta_pagos as vp')
        .select('vp.venta_id')
        .select(
          trx.raw(`
            COALESCE(
              SUM(
                CASE
                  WHEN COALESCE(vp.afecta_caja, 0) = 1
                    THEN COALESCE(vp.monto_centavos, CAST(ROUND(CAST(COALESCE(vp.monto, 0) AS REAL) * 100, 0) AS INTEGER))
                  ELSE 0
                END
              ),
              0
            ) as esperado_centavos
          `)
        )
        .groupBy('vp.venta_id')
        .as('pagos'),
      'pagos.venta_id',
      'v.id'
    )
    .whereNot('v.estado', 'ANULADA')
    .whereRaw('COALESCE(pagos.esperado_centavos, 0) > 0')
    .whereNotExists(function missingCashMovement() {
      this.select('cm.id')
        .from('caja_movimientos as cm')
        .whereRaw("cm.tipo = 'VENTA_CONTADO'")
        .andWhereRaw('cm.origen_id = v.id')
        .limit(1);
    })
    .select(
      'v.id as venta_id',
      'v.turno_id',
      'v.fecha',
      'v.referencia',
      trx.raw('COALESCE(pagos.esperado_centavos, 0) as esperado_centavos')
    )
    .orderBy('v.fecha', 'desc')
    .orderBy('v.id', 'desc');
}

async function listCashNonCashAffectingBalance(trx = db) {
  return trx('caja_movimientos as cm')
    .leftJoin('caja_turnos as ct', 'ct.id', 'cm.turno_id')
    .select(
      'cm.id',
      'cm.turno_id',
      'cm.tipo',
      'cm.concepto',
      'cm.origen_id',
      'cm.monto_centavos',
      'cm.afecta_saldo',
      'cm.fecha',
      'ct.estado as turno_estado'
    )
    .whereIn('cm.tipo', ['VENTA_TRANSFERENCIA', 'VENTA_CREDITO'])
    .andWhere('cm.afecta_saldo', 1)
    .orderBy('cm.fecha', 'desc')
    .orderBy('cm.id', 'desc');
}

async function listCashSalesTurnoDifferences(trx = db) {
  return trx('caja_turnos as ct')
    .leftJoin(
      trx('ventas as v')
        .join('venta_pagos as vp', 'vp.venta_id', 'v.id')
        .whereNot('v.estado', 'ANULADA')
        .groupBy('v.turno_id')
        .select('v.turno_id')
        .select(
          trx.raw(`
            COALESCE(
              SUM(
                CASE
                  WHEN COALESCE(vp.afecta_caja, 0) = 1
                    THEN COALESCE(vp.monto_centavos, CAST(ROUND(CAST(COALESCE(vp.monto, 0) AS REAL) * 100, 0) AS INTEGER))
                  ELSE 0
                END
              ),
              0
            ) as ventas_contado_centavos
          `)
        )
        .as('ventas'),
      'ventas.turno_id',
      'ct.id'
    )
    .leftJoin(
      trx('caja_movimientos as cm')
        .where('cm.tipo', 'VENTA_CONTADO')
        .groupBy('cm.turno_id')
        .select('cm.turno_id')
        .select(
          trx.raw(`
            COALESCE(
              SUM(COALESCE(cm.monto_centavos, CAST(ROUND(CAST(COALESCE(cm.monto, 0) AS REAL) * 100, 0) AS INTEGER))),
              0
            ) as caja_ventas_contado_centavos
          `)
        )
        .as('caja'),
      'caja.turno_id',
      'ct.id'
    )
    .select(
      'ct.id as turno_id',
      'ct.estado',
      'ct.fecha_apertura',
      'ct.fecha_cierre',
      trx.raw('COALESCE(ventas.ventas_contado_centavos, 0) as ventas_contado_centavos'),
      trx.raw('COALESCE(caja.caja_ventas_contado_centavos, 0) as caja_ventas_contado_centavos')
    )
    .whereRaw('COALESCE(ventas.ventas_contado_centavos, 0) != COALESCE(caja.caja_ventas_contado_centavos, 0)')
    .orderBy('ct.fecha_apertura', 'desc')
    .orderBy('ct.id', 'desc');
}

async function listCashDifferences(trx = db) {
  return trx('caja_turnos as ct')
    .leftJoin('usuarios as u', 'u.id', 'ct.usuario_id')
    .select(
      'ct.id',
      'ct.fecha_apertura',
      'ct.fecha_cierre',
      'ct.estado',
      'ct.diferencia_centavos',
      'u.nombre as usuario_nombre'
    )
    .whereNotNull('ct.diferencia_centavos')
    .andWhere('ct.diferencia_centavos', '!=', 0)
    .orderBy('ct.fecha_apertura', 'desc')
    .orderBy('ct.id', 'desc');
}

async function listOrphanRecords(trx = db) {
  const [
    ventaDetalleOrphans,
    devolucionDetalleOrphans,
    cashMovementOrphans,
    inventoryMovementOrphans,
    valuationOrphans,
    transformResultOrphans,
    transformMermaOrphans,
    receptionDetailOrphans
  ] = await Promise.all([
    trx('venta_detalle as vd')
      .leftJoin('ventas as v', 'v.id', 'vd.venta_id')
      .leftJoin('productos as p', 'p.id', 'vd.producto_id')
      .select('vd.id', 'vd.venta_id', 'vd.producto_id')
      .where((qb) => {
        qb.whereNull('v.id').orWhereNull('p.id');
      }),
    trx('devolucion_detalle as dd')
      .leftJoin('devoluciones as d', 'd.id', 'dd.devolucion_id')
      .leftJoin('venta_detalle as vd', 'vd.id', 'dd.venta_detalle_id')
      .select('dd.id', 'dd.devolucion_id', 'dd.venta_detalle_id')
      .where((qb) => {
        qb.whereNull('d.id').orWhereNull('vd.id');
      }),
    trx('caja_movimientos as cm')
      .leftJoin('caja_turnos as ct', 'ct.id', 'cm.turno_id')
      .select('cm.id', 'cm.turno_id', 'cm.tipo')
      .whereNull('ct.id'),
    trx('inventario_movimientos as im')
      .leftJoin('productos as p', 'p.id', 'im.producto_id')
      .select('im.id', 'im.producto_id', 'im.tipo', 'im.referencia')
      .whereNull('p.id'),
    trx('inventario_valorizacion as iv')
      .leftJoin('productos as p', 'p.id', 'iv.producto_id')
      .select('iv.id', 'iv.producto_id', 'iv.origen_tipo', 'iv.origen_id')
      .whereNull('p.id'),
    trx('transformacion_resultados as tr')
      .leftJoin('transformaciones as t', 't.id', 'tr.transformacion_id')
      .leftJoin('productos as p', 'p.id', 'tr.producto_id')
      .select('tr.id', 'tr.transformacion_id', 'tr.producto_id')
      .where((qb) => {
        qb.whereNull('t.id').orWhereNull('p.id');
      }),
    trx('transformacion_mermas as tm')
      .leftJoin('transformaciones as t', 't.id', 'tm.transformacion_id')
      .leftJoin('productos as p', 'p.id', 'tm.producto_id')
      .select('tm.id', 'tm.transformacion_id', 'tm.producto_id')
      .where((qb) => {
        qb.whereNull('t.id').orWhere((inner) => inner.whereNotNull('tm.producto_id').whereNull('p.id'));
      }),
    trx('compras_recepcion_detalle as crd')
      .leftJoin('compras_recepciones as cr', 'cr.id', 'crd.recepcion_id')
      .leftJoin('compras_orden_detalle as cod', 'cod.id', 'crd.orden_detalle_id')
      .select('crd.id', 'crd.recepcion_id', 'crd.orden_detalle_id')
      .where((qb) => {
        qb.whereNull('cr.id').orWhereNull('cod.id');
      })
  ]);

  return [
    ...ventaDetalleOrphans.map((row) => ({ tabla: 'venta_detalle', ...row })),
    ...devolucionDetalleOrphans.map((row) => ({ tabla: 'devolucion_detalle', ...row })),
    ...cashMovementOrphans.map((row) => ({ tabla: 'caja_movimientos', ...row })),
    ...inventoryMovementOrphans.map((row) => ({ tabla: 'inventario_movimientos', ...row })),
    ...valuationOrphans.map((row) => ({ tabla: 'inventario_valorizacion', ...row })),
    ...transformResultOrphans.map((row) => ({ tabla: 'transformacion_resultados', ...row })),
    ...transformMermaOrphans.map((row) => ({ tabla: 'transformacion_mermas', ...row })),
    ...receptionDetailOrphans.map((row) => ({ tabla: 'compras_recepcion_detalle', ...row }))
  ];
}

async function listBrokenReferences(trx = db) {
  const [
    inventoryReceptionRefs,
    inventorySaleRefs,
    inventoryReturnRefs,
    inventoryTransformRefs,
    cashSaleRefs,
    cashReturnRefs,
    auditSaleRefs,
    auditTransformRefs,
    auditShiftRefs,
    auditReceptionRefs
  ] = await Promise.all([
    trx('inventario_movimientos as im')
      .leftJoin('compras_recepciones as cr', 'cr.id', 'im.origen_id')
      .select('im.id', 'im.origen_tipo', 'im.origen_id', 'im.referencia')
      .whereRaw("UPPER(COALESCE(im.origen_tipo, '')) = 'RECEPCION'")
      .whereNotNull('im.origen_id')
      .whereNull('cr.id'),
    trx('inventario_movimientos as im')
      .leftJoin('ventas as v', 'v.id', 'im.origen_id')
      .select('im.id', 'im.origen_tipo', 'im.origen_id', 'im.referencia')
      .whereRaw("UPPER(COALESCE(im.origen_tipo, '')) = 'VENTA'")
      .whereNotNull('im.origen_id')
      .whereNull('v.id'),
    trx('inventario_movimientos as im')
      .leftJoin('devoluciones as d', 'd.id', 'im.origen_id')
      .select('im.id', 'im.origen_tipo', 'im.origen_id', 'im.referencia')
      .whereRaw("UPPER(COALESCE(im.origen_tipo, '')) = 'DEVOLUCION_VENTA'")
      .whereNotNull('im.origen_id')
      .whereNull('d.id'),
    trx('inventario_movimientos as im')
      .leftJoin('transformaciones as t', 't.id', 'im.origen_id')
      .select('im.id', 'im.origen_tipo', 'im.origen_id', 'im.referencia')
      .whereRaw("UPPER(COALESCE(im.origen_tipo, '')) IN ('TRANSFORMACION', 'TRANSFORMACION_ANULACION')")
      .whereNotNull('im.origen_id')
      .whereNull('t.id'),
    trx('caja_movimientos as cm')
      .leftJoin('ventas as v', 'v.id', 'cm.origen_id')
      .select('cm.id', 'cm.tipo', 'cm.origen_id', 'cm.documento_origen')
      .whereIn('cm.tipo', ['VENTA_CONTADO', 'VENTA_TRANSFERENCIA', 'VENTA_CREDITO', 'ANULACION_VENTA_EFECTIVO'])
      .whereNotNull('cm.origen_id')
      .whereNull('v.id'),
    trx('caja_movimientos as cm')
      .leftJoin('devoluciones as d', 'd.id', 'cm.origen_id')
      .select('cm.id', 'cm.tipo', 'cm.origen_id', 'cm.documento_origen')
      .where('cm.tipo', 'DEVOLUCION_EFECTIVO')
      .whereNotNull('cm.origen_id')
      .whereNull('d.id'),
    trx('auditoria_eventos as ae')
      .select('ae.id', 'ae.entidad', 'ae.entidad_id', 'ae.accion')
      .where('ae.entidad', 'VENTA')
      .whereNotExists(function missingAuditSaleRef() {
        this.select('v.id')
          .from('ventas as v')
          .whereRaw('CAST(v.id AS TEXT) = ae.entidad_id')
          .limit(1);
      }),
    trx('auditoria_eventos as ae')
      .select('ae.id', 'ae.entidad', 'ae.entidad_id', 'ae.accion')
      .where('ae.entidad', 'TRANSFORMACION')
      .whereNotExists(function missingAuditTransformRef() {
        this.select('t.id')
          .from('transformaciones as t')
          .whereRaw('CAST(t.id AS TEXT) = ae.entidad_id')
          .limit(1);
      }),
    trx('auditoria_eventos as ae')
      .select('ae.id', 'ae.entidad', 'ae.entidad_id', 'ae.accion')
      .where('ae.entidad', 'CAJA_TURNO')
      .whereNotExists(function missingAuditShiftRef() {
        this.select('ct.id')
          .from('caja_turnos as ct')
          .whereRaw('CAST(ct.id AS TEXT) = ae.entidad_id')
          .limit(1);
      }),
    trx('auditoria_eventos as ae')
      .select('ae.id', 'ae.entidad', 'ae.entidad_id', 'ae.accion')
      .whereIn('ae.entidad', ['RECEPCION', 'COMPRA_RECEPCION'])
      .whereNotExists(function missingAuditReceptionRef() {
        this.select('cr.id')
          .from('compras_recepciones as cr')
          .whereRaw('CAST(cr.id AS TEXT) = ae.entidad_id')
          .limit(1);
      })
  ]);

  return [
    ...inventoryReceptionRefs.map((row) => ({ fuente: 'inventario_movimientos', ...row })),
    ...inventorySaleRefs.map((row) => ({ fuente: 'inventario_movimientos', ...row })),
    ...inventoryReturnRefs.map((row) => ({ fuente: 'inventario_movimientos', ...row })),
    ...inventoryTransformRefs.map((row) => ({ fuente: 'inventario_movimientos', ...row })),
    ...cashSaleRefs.map((row) => ({ fuente: 'caja_movimientos', ...row })),
    ...cashReturnRefs.map((row) => ({ fuente: 'caja_movimientos', ...row })),
    ...auditSaleRefs.map((row) => ({ fuente: 'auditoria_eventos', ...row })),
    ...auditTransformRefs.map((row) => ({ fuente: 'auditoria_eventos', ...row })),
    ...auditShiftRefs.map((row) => ({ fuente: 'auditoria_eventos', ...row })),
    ...auditReceptionRefs.map((row) => ({ fuente: 'auditoria_eventos', ...row }))
  ];
}

async function listAuditEventsWithoutUser(trx = db) {
  return trx('auditoria_eventos as ae')
    .select('ae.id', 'ae.entidad', 'ae.entidad_id', 'ae.accion', 'ae.modulo', 'ae.fecha_evento')
    .whereNull('ae.usuario_id')
    .whereIn('ae.accion', [
      'VENTA',
      'DEVOLUCION',
      'ANULACION',
      'APERTURA',
      'CORTE_Z',
      'AJUSTE_MASIVO',
      'RECEPCION',
      'APLICAR',
      'ANULAR'
    ])
    .orderBy('ae.fecha_evento', 'desc')
    .orderBy('ae.id', 'desc');
}

async function listTraceabilityGaps(trx = db) {
  const [
    ventasSinAuditoria,
    devolucionesSinAuditoria,
    anulacionesSinAuditoria,
    transformacionesAplicadasSinAuditoria,
    transformacionesAnuladasSinAuditoria,
    recepcionesSinAuditoria,
    aperturasCajaSinAuditoria,
    cierresCajaSinAuditoria
  ] = await Promise.all([
    trx('ventas as v')
      .select('v.id', 'v.fecha', 'v.referencia')
      .whereNot('v.estado', 'ANULADA')
      .whereNotExists(function missingSaleAudit() {
        this.select('ae.id')
          .from('auditoria_eventos as ae')
          .whereRaw("ae.entidad = 'VENTA'")
          .andWhereRaw("ae.accion = 'VENTA'")
          .andWhereRaw('ae.entidad_id = CAST(v.id AS TEXT)')
          .limit(1);
      }),
    trx('devoluciones as d')
      .select('d.id', 'd.venta_id', 'd.fecha')
      .whereNotExists(function missingReturnAudit() {
        this.select('ae.id')
          .from('auditoria_eventos as ae')
          .whereRaw("ae.entidad = 'VENTA'")
          .andWhereRaw("ae.accion = 'DEVOLUCION'")
          .andWhereRaw('ae.entidad_id = CAST(d.venta_id AS TEXT)')
          .limit(1);
      }),
    trx('ventas_anulaciones as va')
      .select('va.id', 'va.venta_id', 'va.motivo')
      .whereNotExists(function missingCancellationAudit() {
        this.select('ae.id')
          .from('auditoria_eventos as ae')
          .whereRaw("ae.entidad = 'VENTA'")
          .andWhereRaw("ae.accion = 'ANULACION'")
          .andWhereRaw('ae.entidad_id = CAST(va.venta_id AS TEXT)')
          .limit(1);
      }),
    trx('transformaciones as t')
      .select('t.id', 't.numero', 't.fecha')
      .where('t.estado', 'APLICADA')
      .whereNotExists(function missingTransformationAudit() {
        this.select('ae.id')
          .from('auditoria_eventos as ae')
          .whereRaw("ae.entidad = 'TRANSFORMACION'")
          .andWhereRaw("ae.accion = 'APLICAR'")
          .andWhereRaw('ae.entidad_id = CAST(t.id AS TEXT)')
          .limit(1);
      }),
    trx('transformaciones as t')
      .select('t.id', 't.numero', 't.fecha_anulacion')
      .where('t.estado', 'ANULADA')
      .whereNotExists(function missingTransformationCancelAudit() {
        this.select('ae.id')
          .from('auditoria_eventos as ae')
          .whereRaw("ae.entidad = 'TRANSFORMACION'")
          .andWhereRaw("ae.accion = 'ANULAR'")
          .andWhereRaw('ae.entidad_id = CAST(t.id AS TEXT)')
          .limit(1);
      }),
    trx('compras_recepciones as cr')
      .select('cr.id', 'cr.orden_id', 'cr.fecha')
      .whereNotExists(function missingReceptionAudit() {
        this.select('ae.id')
          .from('auditoria_eventos as ae')
          .whereIn('ae.entidad', ['RECEPCION', 'COMPRA_RECEPCION'])
          .andWhereRaw("ae.accion = 'RECEPCION'")
          .andWhereRaw('ae.entidad_id = CAST(cr.id AS TEXT)')
          .limit(1);
      }),
    trx('caja_turnos as ct')
      .select('ct.id', 'ct.fecha_apertura', 'ct.usuario_id')
      .whereNotExists(function missingOpenShiftAudit() {
        this.select('ae.id')
          .from('auditoria_eventos as ae')
          .whereRaw("ae.entidad = 'CAJA_TURNO'")
          .andWhereRaw("ae.accion = 'APERTURA'")
          .andWhereRaw('ae.entidad_id = CAST(ct.id AS TEXT)')
          .limit(1);
      }),
    trx('caja_turnos as ct')
      .select('ct.id', 'ct.fecha_cierre', 'ct.usuario_id')
      .where('ct.estado', 'CERRADO')
      .whereNotExists(function missingCloseShiftAudit() {
        this.select('ae.id')
          .from('auditoria_eventos as ae')
          .whereRaw("ae.entidad = 'CAJA_TURNO'")
          .andWhereRaw("ae.accion = 'CORTE_Z'")
          .andWhereRaw('ae.entidad_id = CAST(ct.id AS TEXT)')
          .limit(1);
      })
  ]);

  return {
    ventas: ventasSinAuditoria,
    devoluciones: devolucionesSinAuditoria,
    anulaciones: anulacionesSinAuditoria,
    transformaciones_aplicadas: transformacionesAplicadasSinAuditoria,
    transformaciones_anuladas: transformacionesAnuladasSinAuditoria,
    recepciones: recepcionesSinAuditoria,
    caja_aperturas: aperturasCajaSinAuditoria,
    caja_cierres: cierresCajaSinAuditoria
  };
}

module.exports = {
  createAudit,
  getByEntity,
  listAudit,
  countAudit,
  listNegativeStock,
  listInventoryOriginlessMovements,
  listInventoryMissingBalanceResults,
  listInventoryBalanceMismatches,
  listInventoryProductBalanceGaps,
  listSalesMissingSnapshot,
  listReturnsWithoutOriginalSnapshot,
  listTransformacionCostMismatches,
  listTransformacionZeroMerma,
  listTransformacionQuantityMismatches,
  listIncompleteValuations,
  listReceptionMissingValuation,
  listUnsafeCancelledTransformations,
  listCashMovementMismatches,
  listCashSalesWithoutMovement,
  listCashNonCashAffectingBalance,
  listCashSalesTurnoDifferences,
  listCashDifferences,
  listOrphanRecords,
  listBrokenReferences,
  listAuditEventsWithoutUser,
  listTraceabilityGaps
};
