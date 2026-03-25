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

function approxEqual(actual, expected, tolerance = 0.001) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function asQty(value) {
  return Number(Number(value || 0).toFixed(3));
}

async function ensureOpenShift(cajero) {
  const current = await cajaService.turnoActual();
  if (current) return current;
  return cajaService.abrirTurno({ fondo_inicial: 200, observacion: 'Turno test despiece parcial' }, cajero.id);
}

async function createOrderAndReceive(actorUser, proveedorId, productoId, cantidad, costoTotalReal, documentoRespaldo = `RCV-DESP-${productoId}`) {
  const orden = await comprasService.createOrden(
    {
      proveedor_id: proveedorId,
      observacion: 'Compra canal para despiece parcial',
      items: [{ producto_id: productoId, cantidad }]
    },
    actorUser
  );

  const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();

  await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      documento_respaldo: documentoRespaldo,
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

    const categoriaPadre = await createCategoria(db, { nombre: 'Producto padre' });
    const categoriaCortes = await createCategoria(db, { nombre: 'Cortes res' });
    const proveedor = await createProveedor(db, { nombre: 'Proveedor canal res', tiene_credito: true, dias_pago: 15 });

    const canalRes = await createProducto(db, {
      categoria_id: categoriaPadre.id,
      codigo: 'CANAL-RES-225',
      nombre: 'Canal de res',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 2.2
    });

    const lomo = await createProducto(db, {
      categoria_id: categoriaCortes.id,
      codigo: 'LOMO-RES',
      nombre: 'Lomo',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 6.2
    });

    const costilla = await createProducto(db, {
      categoria_id: categoriaCortes.id,
      codigo: 'COSTILLA-RES',
      nombre: 'Costilla',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 5.4
    });

    const molida = await createProducto(db, {
      categoria_id: categoriaCortes.id,
      codigo: 'MOLIDA-RES',
      nombre: 'Molida',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 4.8
    });

    const canalResTotal = await createProducto(db, {
      categoria_id: categoriaPadre.id,
      codigo: 'CANAL-RES-226',
      nombre: 'Canal de res total',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 2.2
    });

    const aguja = await createProducto(db, {
      categoria_id: categoriaCortes.id,
      codigo: 'AGUJA-RES',
      nombre: 'Aguja',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 5.1
    });

    const falda = await createProducto(db, {
      categoria_id: categoriaCortes.id,
      codigo: 'FALDA-RES',
      nombre: 'Falda',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 4.7
    });

    await createOrderAndReceive(cajero, proveedor.id, canalRes.id, 225, 300);
    await createOrderAndReceive(cajero, proveedor.id, canalResTotal.id, 226, 300);

    const canalRecibido = await db('productos').where({ id: canalRes.id }).first();
    assert(Number(canalRecibido.stock_actual) === 225, 'El canal debe ingresar con 225 LB');
    assert(approxEqual(canalRecibido.costo_promedio, 1.333), `Costo esperado 1.333 y obtuvo ${canalRecibido.costo_promedio}`);

    try {
      const borrador = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Primer despiece parcial 120 LB',
          insumo: {
            producto_id: canalRes.id,
            cantidad: 120
          },
          resultados: [
            { producto_id: lomo.id, cantidad: 50 },
            { producto_id: costilla.id, cantidad: 40 },
            { producto_id: molida.id, cantidad: 20 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', cantidad: 10, motivo: 'Merma operativa' }
          ]
        },
        admin
      );

      const aplicada = await transformacionesService.aplicarTransformacion(borrador.data.id, {}, admin);
      const canalActual = await db('productos').where({ id: canalRes.id }).first();
      const lomoActual = await db('productos').where({ id: lomo.id }).first();
      const costillaActual = await db('productos').where({ id: costilla.id }).first();
      const molidaActual = await db('productos').where({ id: molida.id }).first();
      const movimientos = await db('inventario_movimientos').where({ referencia: `TRANSFORMACION:${aplicada.data.id}` }).orderBy('id', 'asc');
      const consumoPadre = movimientos.find((row) => row.tipo === 'TRANSFORMACION_CONSUMO');
      const mermaMovimiento = movimientos.find((row) => row.tipo === 'TRANSFORMACION_MERMA');
      const produccion = movimientos.filter((row) => row.tipo === 'TRANSFORMACION_PRODUCCION');

      assert(aplicada.data.balance.en_rango === true, 'El balance aplicado debe quedar en rango');
      assert(asQty(canalActual.stock_actual) === 105, 'El padre debe conservar 105 LB remanentes');
      assert(asQty(lomoActual.stock_actual) === 50, 'Lomo no ingresó correctamente');
      assert(asQty(costillaActual.stock_actual) === 40, 'Costilla no ingresó correctamente');
      assert(asQty(molidaActual.stock_actual) === 20, 'Molida no ingresó correctamente');
      assert(approxEqual(canalActual.costo_promedio, 1.333), 'El costo del padre restante debe mantenerse');
      assert(approxEqual(lomoActual.costo_promedio, 1.333), 'Lomo debe heredar costo base');
      assert(approxEqual(costillaActual.costo_promedio, 1.333), 'Costilla debe heredar costo base');
      assert(approxEqual(molidaActual.costo_promedio, 1.333), 'Molida debe heredar costo base');
      assert(Number(aplicada.data.insumo.stock_disponible_snapshot) === 225, 'Snapshot de stock disponible incorrecto');
      assert(Number(aplicada.data.insumo.stock_restante_snapshot) === 105, 'Snapshot de stock restante incorrecto');
      assert(consumoPadre && Number(consumoPadre.cantidad) === 120 && Number(consumoPadre.signo) === -1, 'La salida del padre no quedó registrada correctamente');
      assert(produccion.length === 3, 'Deben existir tres movimientos de entrada de hijos');
      assert(mermaMovimiento && Number(mermaMovimiento.cantidad) === 10, 'La merma no quedó registrada correctamente');
      add(1, 'Caso real 225/120 conserva 105 LB y registra hijos + merma + movimientos', true);
    } catch (error) {
      add(1, 'Caso real 225/120 conserva 105 LB y registra hijos + merma + movimientos', false, error.message);
    }

    try {
      const borradorUsoTotal = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Uso total del padre con merma 0',
          insumo: {
            producto_id: canalResTotal.id,
            cantidad: 226
          },
          resultados: [
            { producto_id: aguja.id, cantidad: 150 },
            { producto_id: falda.id, cantidad: 76 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', cantidad: 0, motivo: 'Sin merma operativa' }
          ]
        },
        admin
      );

      const aplicadaTotal = await transformacionesService.aplicarTransformacion(borradorUsoTotal.data.id, {}, admin);
      const canalTotalActual = await db('productos').where({ id: canalResTotal.id }).first();
      const agujaActual = await db('productos').where({ id: aguja.id }).first();
      const faldaActual = await db('productos').where({ id: falda.id }).first();
      const movimientosTotal = await db('inventario_movimientos')
        .where({ referencia: `TRANSFORMACION:${aplicadaTotal.data.id}` })
        .orderBy('id', 'asc');

      assert(asQty(canalTotalActual.stock_actual) === 0, 'El uso total debe dejar el padre en 0 LB');
      assert(asQty(agujaActual.stock_actual) === 150, 'Aguja no ingresó correctamente');
      assert(asQty(faldaActual.stock_actual) === 76, 'Falda no ingresó correctamente');
      assert(Number(aplicadaTotal.data.insumo.stock_disponible_snapshot) === 226, 'Snapshot inicial de uso total incorrecto');
      assert(Number(aplicadaTotal.data.insumo.stock_restante_snapshot) === 0, 'El uso total debe dejar snapshot restante en 0');
      assert(asQty(aplicadaTotal.data.resumen.merma_total) === 0, 'La merma 0 debe aceptarse y conservarse como 0');
      assert(!movimientosTotal.some((row) => row.tipo === 'TRANSFORMACION_MERMA'), 'No debe registrarse movimiento de merma cuando la merma es 0');
      add(2, 'Permite uso total del padre con merma 0 y deja stock restante en 0', true);
    } catch (error) {
      add(2, 'Permite uso total del padre con merma 0 y deja stock restante en 0', false, error.message);
    }

    try {
      const overStock = await expectThrows(
        () => transformacionesService.createBorrador(
          {
            tipo_proceso: 'DESPIECE',
            observacion: 'Intento inválido sobre stock disponible',
            insumo: {
              producto_id: canalRes.id,
              cantidad: 106
            },
            resultados: [
              { producto_id: lomo.id, cantidad: 90 }
            ],
            mermas: [
              { tipo_merma: 'RECORTE', cantidad: 16, motivo: 'Intento inválido' }
            ]
          },
          admin
        ),
        'excede el stock disponible'
      );

      assert(overStock.ok, 'No rechazó el despiece con cantidad mayor al stock disponible');
      add(3, 'Rechaza procesar más cantidad de la disponible', true);
    } catch (error) {
      add(3, 'Rechaza procesar más cantidad de la disponible', false, error.message);
    }

    try {
      const borradorDesbalanceado = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Despiece desbalanceado',
          insumo: {
            producto_id: canalRes.id,
            cantidad: 50
          },
          resultados: [
            { producto_id: lomo.id, cantidad: 20 },
            { producto_id: costilla.id, cantidad: 20 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', cantidad: 5, motivo: 'Balance inválido' }
          ]
        },
        admin
      );

      const invalidBalance = await expectThrows(
        () => transformacionesService.aplicarTransformacion(borradorDesbalanceado.data.id, {}, admin),
        'Balance inválido'
      );

      assert(invalidBalance.ok, 'No rechazó el despiece con balance inválido');
      add(4, 'Rechaza aplicar despiece cuando hijos + merma no cuadran con la cantidad procesada', true);
    } catch (error) {
      add(4, 'Rechaza aplicar despiece cuando hijos + merma no cuadran con la cantidad procesada', false, error.message);
    }

    try {
      const mermaNegativa = await expectThrows(
        () => transformacionesService.createBorrador(
          {
            tipo_proceso: 'DESPIECE',
            observacion: 'Merma negativa inválida',
            insumo: {
              producto_id: canalRes.id,
              cantidad: 10
            },
            resultados: [
              { producto_id: lomo.id, cantidad: 10 }
            ],
            mermas: [
              { tipo_merma: 'RECORTE', cantidad: -1, motivo: 'Valor inválido' }
            ]
          },
          admin
        ),
        'no puede ser negativa'
      );

      assert(mermaNegativa.ok, 'No rechazó la merma negativa');
      add(5, 'Rechaza merma negativa', true);
    } catch (error) {
      add(5, 'Rechaza merma negativa', false, error.message);
    }

    try {
      const segundoBorrador = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Segundo despiece sobre remanente',
          insumo: {
            producto_id: canalRes.id,
            cantidad: 60
          },
          resultados: [
            { producto_id: lomo.id, cantidad: 25 },
            { producto_id: costilla.id, cantidad: 20 },
            { producto_id: molida.id, cantidad: 10 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', cantidad: 5, motivo: 'Segundo proceso' }
          ]
        },
        admin
      );

      const segundaAplicada = await transformacionesService.aplicarTransformacion(segundoBorrador.data.id, {}, admin);
      const canalFinal = await db('productos').where({ id: canalRes.id }).first();
      const lomoFinal = await db('productos').where({ id: lomo.id }).first();
      const costillaFinal = await db('productos').where({ id: costilla.id }).first();
      const molidaFinal = await db('productos').where({ id: molida.id }).first();

      assert(Number(segundaAplicada.data.insumo.stock_disponible_snapshot) === 105, 'El segundo snapshot debe partir del remanente de 105 LB');
      assert(Number(segundaAplicada.data.insumo.stock_restante_snapshot) === 45, 'El segundo remanente debe quedar en 45 LB');
      assert(asQty(canalFinal.stock_actual) === 45, 'El segundo despiece debe dejar 45 LB remanentes');
      assert(asQty(lomoFinal.stock_actual) === 75, 'Lomo acumulado incorrecto tras segundo despiece');
      assert(asQty(costillaFinal.stock_actual) === 60, 'Costilla acumulada incorrecta tras segundo despiece');
      assert(asQty(molidaFinal.stock_actual) === 30, 'Molida acumulada incorrecta tras segundo despiece');
      add(6, 'Permite segundo despiece posterior sobre el stock remanente', true);
    } catch (error) {
      add(6, 'Permite segundo despiece posterior sobre el stock remanente', false, error.message);
    }

    try {
      const canalFinal = await db('productos').where({ id: canalRes.id }).first();
      const lomoFinal = await db('productos').where({ id: lomo.id }).first();
      const costillaFinal = await db('productos').where({ id: costilla.id }).first();
      const molidaFinal = await db('productos').where({ id: molida.id }).first();
      const canalTotalFinal = await db('productos').where({ id: canalResTotal.id }).first();
      const agujaFinal = await db('productos').where({ id: aguja.id }).first();
      const faldaFinal = await db('productos').where({ id: falda.id }).first();
      const costoCanal225 = 300 / 225;
      const costoCanal226 = 300 / 226;

      assert(approxEqual(canalFinal.costo_promedio, costoCanal225), 'El costo del padre restante no debe alterarse');
      assert(approxEqual(lomoFinal.costo_promedio, costoCanal225), 'Lomo no mantiene costo heredado esperado');
      assert(approxEqual(costillaFinal.costo_promedio, costoCanal225), 'Costilla no mantiene costo heredado esperado');
      assert(approxEqual(molidaFinal.costo_promedio, costoCanal225), 'Molida no mantiene costo heredado esperado');
      assert(approxEqual(canalTotalFinal.costo_promedio, costoCanal226), 'El padre de uso total debe conservar su costo base');
      assert(approxEqual(agujaFinal.costo_promedio, costoCanal226), 'Aguja no mantiene costo heredado esperado');
      assert(approxEqual(faldaFinal.costo_promedio, costoCanal226), 'Falda no mantiene costo heredado esperado');
      add(7, 'Mantiene costo del padre restante y redistribuye costo a hijos sin crear costo nuevo', true);
    } catch (error) {
      add(7, 'Mantiene costo del padre restante y redistribuye costo a hijos sin crear costo nuevo', false, error.message);
    }
  } catch (fatalError) {
    add(999, 'Preparación de suite', false, fatalError.message);
  }

  const report = printSuiteReport('TESTS DESPIECE PARCIAL', results);
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
