/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'transformaciones-partial-despiece' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const transformacionesService = require('../../src/modules/transformaciones/transformaciones.service');
const { prepareDatabase } = require('../support/database');
const { createCategoria, createProducto, createProveedor } = require('../support/factories');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function ensureOpenShift(cajero) {
  const current = await cajaService.turnoActual();
  if (current) return current;
  return cajaService.abrirTurno({ fondo_inicial: 200, observacion: 'Turno test transformaciones' }, cajero.id);
}

async function receiveStock(actorUser, proveedorId, productoId, cantidad, costoTotalReal, documento = `RCV-${productoId}`) {
  const orden = await comprasService.createOrden(
    {
      proveedor_id: proveedorId,
      observacion: 'Compra test transformaciones',
      items: [{ producto_id: productoId, cantidad }]
    },
    actorUser
  );

  const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
  await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      documento_respaldo: documento,
      factura: { metodo_pago: 'CREDITO' },
      items: [{
        orden_detalle_id: detalle.id,
        cantidad,
        costo_total_real: costoTotalReal
      }]
    },
    actorUser
  );
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });

    const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
    const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
    await ensureOpenShift(cajero);

    const categoria = await createCategoria(db, { nombre: 'Transformaciones test' });
    const proveedor = await createProveedor(db, { nombre: 'Proveedor transformaciones', tiene_credito: true, dias_pago: 15 });

    const padreLb = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'PADRE-LB',
      nombre: 'Canal LB',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      es_transformable: true
    });
    const hijoLbA = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'HIJO-LB-A',
      nombre: 'Lomo LB',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      es_transformable: true
    });
    const hijoLbB = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'HIJO-LB-B',
      nombre: 'Costilla LB',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      es_transformable: false
    });
    const mermaLb = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'MERMA-LB',
      nombre: 'Merma LB',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      es_vendible: false,
      es_transformable: false,
      es_merma: true
    });

    const padreKg = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'PADRE-KG',
      nombre: 'Canal KG',
      unidad_medida: 'KG',
      stock_actual: 0,
      costo_promedio: 0,
      es_transformable: true
    });
    const hijoKgA = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'HIJO-KG-A',
      nombre: 'Suave KG',
      unidad_medida: 'KG',
      stock_actual: 0,
      costo_promedio: 0,
      es_transformable: true
    });
    const hijoKgB = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'HIJO-KG-B',
      nombre: 'Molida KG',
      unidad_medida: 'KG',
      stock_actual: 0,
      costo_promedio: 0,
      es_transformable: false
    });
    const mermaKg = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'MERMA-KG',
      nombre: 'Merma KG',
      unidad_medida: 'KG',
      stock_actual: 0,
      costo_promedio: 0,
      es_vendible: false,
      es_transformable: false,
      es_merma: true
    });

    const padreUnd = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'PADRE-UND',
      nombre: 'Caja UND',
      unidad_medida: 'UND',
      stock_actual: 0,
      costo_promedio: 0,
      es_transformable: true
    });
    const hijoUndA = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'HIJO-UND-A',
      nombre: 'Pieza UND A',
      unidad_medida: 'UND',
      stock_actual: 0,
      costo_promedio: 0,
      es_transformable: true
    });
    const hijoUndB = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'HIJO-UND-B',
      nombre: 'Pieza UND B',
      unidad_medida: 'UND',
      stock_actual: 0,
      costo_promedio: 0,
      es_transformable: false
    });
    const mermaUnd = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'MERMA-UND',
      nombre: 'Merma UND',
      unidad_medida: 'UND',
      stock_actual: 0,
      costo_promedio: 0,
      es_vendible: false,
      es_transformable: false,
      es_merma: true
    });

    await receiveStock(cajero, proveedor.id, padreLb.id, 100, 250, 'RCV-LB-001');
    await receiveStock(cajero, proveedor.id, padreKg.id, 50, 400, 'RCV-KG-001');
    await receiveStock(cajero, proveedor.id, padreUnd.id, 20, 100, 'RCV-UND-001');

    try {
      const before = await db('productos').where({ id: padreLb.id }).first();
      const draft = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Borrador LB',
          insumo: { producto_id: padreLb.id, cantidad: 70 },
          resultados: [
            { producto_id: hijoLbA.id, cantidad: 40 },
            { producto_id: hijoLbB.id, cantidad: 20 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', producto_id: mermaLb.id, cantidad: 10, motivo: 'Merma obligatoria' }
          ]
        },
        admin
      );

      await transformacionesService.updateBorrador(
        draft.data.id,
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Borrador LB editado',
          insumo: { producto_id: padreLb.id, cantidad: 70 },
          resultados: [
            { producto_id: hijoLbA.id, cantidad: 35 },
            { producto_id: hijoLbB.id, cantidad: 25 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', producto_id: mermaLb.id, cantidad: 10, motivo: 'Merma editada' }
          ]
        },
        admin
      );

      const after = await db('productos').where({ id: padreLb.id }).first();
      const moves = await db('inventario_movimientos').where({ referencia: `TRANSFORMACION:${draft.data.id}` });
      assert(Number(before.stock_actual) === Number(after.stock_actual), 'El borrador no debe mover stock');
      assert(moves.length === 0, 'El borrador no debe generar kardex');
      add(1, 'Crea y edita borrador sin mover inventario', true);
    } catch (error) {
      add(1, 'Crea y edita borrador sin mover inventario', false, error.message);
    }

    try {
      const applied = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Aplicacion parcial LB',
          insumo: { producto_id: padreLb.id, cantidad: 70 },
          resultados: [
            { producto_id: hijoLbA.id, cantidad: 35 },
            { producto_id: hijoLbB.id, cantidad: 25 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', producto_id: mermaLb.id, cantidad: 10, motivo: 'Merma obligatoria' }
          ]
        },
        admin
      );
      const result = await transformacionesService.aplicarTransformacion(applied.data.id, {}, admin);

      const parent = await db('productos').where({ id: padreLb.id }).first();
      const childA = await db('productos').where({ id: hijoLbA.id }).first();
      const childB = await db('productos').where({ id: hijoLbB.id }).first();
      assert(Number(parent.stock_actual) === 30, 'El sobrante del padre debe quedar en inventario');
      assert(Number(childA.stock_actual) === 35, 'El hijo A debe ingresar');
      assert(Number(childB.stock_actual) === 25, 'El hijo B debe ingresar');
      assert(result.data.balance.en_rango === true, 'El balance de cantidad debe quedar exacto');
      add(2, 'Aplica transformación parcial y deja sobrante correcto', true);
    } catch (error) {
      add(2, 'Aplica transformación parcial y deja sobrante correcto', false, error.message);
    }

    try {
      const mermaZero = await expectThrows(
        () => transformacionesService.createBorrador(
          {
            tipo_proceso: 'DESPIECE',
            observacion: 'Merma cero',
            insumo: { producto_id: padreKg.id, cantidad: 10 },
            resultados: [
              { producto_id: hijoKgA.id, cantidad: 10 }
            ],
            mermas: [
              { tipo_merma: 'RECORTE', producto_id: mermaKg.id, cantidad: 0, motivo: 'No permitido' }
            ]
          },
          admin
        ),
        'merma'
      );
      assert(mermaZero.ok, 'Debe rechazar merma = 0');
      add(3, 'Rechaza merma igual a 0', true);
    } catch (error) {
      add(3, 'Rechaza merma igual a 0', false, error.message);
    }

    try {
      const borradorUnd = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Contrato v2 UND sin cantidad explícita',
          producto_padre_id: padreUnd.id,
          hijos: [
            { producto_id: hijoUndA.id, cantidad: 8 },
            { producto_id: hijoUndB.id, cantidad: 5 }
          ],
          merma: [
            { tipo_merma: 'ROTURA', producto_id: mermaUnd.id, cantidad: 2, motivo: 'Merma UND' }
          ]
        },
        admin
      );
      const aplicadaUnd = await transformacionesService.aplicarTransformacion(borradorUnd.data.id, {}, admin);
      const parentUndAfter = await db('productos').where({ id: padreUnd.id }).first();
      const childUndAAfter = await db('productos').where({ id: hijoUndA.id }).first();
      const childUndBAfter = await db('productos').where({ id: hijoUndB.id }).first();

      assert(Number(aplicadaUnd.data.insumo?.cantidad || 0) === 15, 'Debe derivar cantidad consumida desde hijos + merma');
      assert(Number(parentUndAfter.stock_actual) === 5, 'Debe dejar stock restante correcto para UND');
      assert(Number(childUndAAfter.stock_actual) === 8, 'Debe ingresar stock del hijo UND A');
      assert(Number(childUndBAfter.stock_actual) === 5, 'Debe ingresar stock del hijo UND B');
      assert(Number(aplicadaUnd.data.metricas?.total_consumido || 0) === 15, 'Debe exponer total consumido en respuesta');
      add(4, 'Soporta contrato v2 sin cantidad explícita y unidades UND', true);
    } catch (error) {
      add(4, 'Soporta contrato v2 sin cantidad explícita y unidades UND', false, error.message);
    }

    let primeraKgAplicada = null;
    try {
      const draftKg = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Transformacion KG',
          insumo: { producto_id: padreKg.id, cantidad: 50 },
          resultados: [
            { producto_id: hijoKgA.id, cantidad: 30, costo_total: 240 },
            { producto_id: hijoKgB.id, cantidad: 15, costo_total: 120 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', producto_id: mermaKg.id, cantidad: 5, motivo: 'Merma KG', costo_total: 40 }
          ]
        },
        admin
      );
      primeraKgAplicada = await transformacionesService.aplicarTransformacion(draftKg.data.id, {}, admin);
      const costos = primeraKgAplicada.data.costos;
      assert(costos.costo_total_padre_centavos === 40000, 'El costo total padre debe conservar 400.00');
      assert(costos.costo_total_distribuido_centavos === 40000, 'La distribución total debe conservar el costo exacto');
      assert(primeraKgAplicada.data.resultados.reduce((acc, row) => acc + Number(row.costo_asignado_centavos || 0), 0) +
        primeraKgAplicada.data.mermas.reduce((acc, row) => acc + Number(row.costo_total_centavos || 0), 0) === 40000,
      'La suma hijos + merma debe cuadrar exacta en centavos');
      add(5, 'Soporta KG y conserva costo exacto en centavos', true);
    } catch (error) {
      add(5, 'Soporta KG y conserva costo exacto en centavos', false, error.message);
    }

    try {
      const chainedDraft = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'MOLIENDA',
          observacion: 'Encadenada usando hijo como padre',
          insumo: { producto_id: hijoKgA.id, cantidad: 10 },
          resultados: [
            { producto_id: hijoKgB.id, cantidad: 8 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', producto_id: mermaKg.id, cantidad: 2, motivo: 'Subtransformacion' }
          ]
        },
        admin
      );
      const chainedApplied = await transformacionesService.aplicarTransformacion(chainedDraft.data.id, {}, admin);
      assert(chainedApplied.data.estado === 'APLICADA', 'La subtransformación debe aplicarse');
      add(6, 'Permite transformaciones encadenadas', true);
    } catch (error) {
      add(6, 'Permite transformaciones encadenadas', false, error.message);
    }

    try {
      const blocking = await expectThrows(
        () => transformacionesService.anularTransformacion(primeraKgAplicada.data.id, { novedad: 'Debe bloquear' }, admin),
        'movimientos posteriores'
      );
      assert(blocking.ok, 'Debe bloquear anulación con movimientos posteriores sobre hijos');
      add(7, 'Bloquea anulación insegura cuando ya hubo movimientos posteriores', true);
    } catch (error) {
      add(7, 'Bloquea anulación insegura cuando ya hubo movimientos posteriores', false, error.message);
    }

    try {
      const reversibleDraft = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Reversible',
          insumo: { producto_id: hijoLbA.id, cantidad: 10 },
          resultados: [
            { producto_id: hijoLbB.id, cantidad: 8 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', producto_id: mermaLb.id, cantidad: 2, motivo: 'Reversible' }
          ]
        },
        admin
      );
      const reversibleApplied = await transformacionesService.aplicarTransformacion(reversibleDraft.data.id, {}, admin);
      const beforeCancelChild = await db('productos').where({ id: hijoLbA.id }).first();
      const cancelled = await transformacionesService.anularTransformacion(reversibleApplied.data.id, { novedad: 'Reverso seguro' }, admin);
      const afterCancelParent = await db('productos').where({ id: hijoLbA.id }).first();
      assert(cancelled.data.estado === 'ANULADA', 'La transformación debe quedar anulada');
      assert(Number(afterCancelParent.stock_actual) > Number(beforeCancelChild.stock_actual), 'Debe restaurar stock del padre');
      add(8, 'Anula una transformación reversible restaurando inventario', true);
    } catch (error) {
      add(8, 'Anula una transformación reversible restaurando inventario', false, error.message);
    }
  } catch (fatalError) {
    add(999, 'Preparación de suite', false, fatalError.message);
  }

  const report = printSuiteReport('TESTS TRANSFORMACIONES MODULO 3', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando transformaciones-partial-despiece.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
