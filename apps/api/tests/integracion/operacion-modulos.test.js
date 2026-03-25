/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'operacion-modulos' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const inventarioService = require('../../src/modules/inventario/inventario.service');
const transformacionesService = require('../../src/modules/transformaciones/transformaciones.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const { prepareDatabase } = require('../support/database');
const { seedOperationalFixtures } = require('../support/operationalFixtures');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function openTurno(cajero) {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: 300, observacion: 'Turno operación módulos' }, cajero.id);
}

async function closeTurno(cajero) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;
  const resumen = await cajaService.corteX(cajero);
  await cajaService.corteZ({
    efectivo_contado: Number(resumen.efectivo_esperado),
    observacion: 'Cierre operación módulos'
  }, cajero);
}

async function getProduct(id) {
  return db('productos').where({ id }).first();
}

function asQty(value) {
  return Number(Number(value || 0).toFixed(3));
}

async function purchaseAndReceive({ actorUser, proveedorId, items, numeroFactura, metodoPago = 'CREDITO' }) {
  const orden = await comprasService.createOrden({
    proveedor_id: proveedorId,
    observacion: `Orden ${numeroFactura}`,
    items: items.map((item) => ({
      producto_id: item.producto_id,
      cantidad: item.cantidad
    }))
  }, actorUser);

  const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).orderBy('id', 'asc');
  const recepcion = await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      documento_respaldo: numeroFactura,
      factura: {
        numero_factura: numeroFactura,
        metodo_pago: metodoPago
      },
      items: detalle.map((row, index) => ({
        orden_detalle_id: row.id,
        cantidad: items[index].cantidad,
        costo_unit_real: items[index].costo_unit
      }))
    },
    actorUser
  );

  return { orden, recepcion, detalle };
}

async function createAndApplyTransform({ actorUser, adminUser, parentProductId, parentQty, resultados, mermas, referencia }) {
  const borrador = await transformacionesService.createBorrador(
    {
      tipo_proceso: 'DESPIECE',
      referencia_lote: referencia,
      observacion: `Proceso ${referencia}`,
      insumo: {
        producto_id: parentProductId,
        cantidad: parentQty
      },
      resultados,
      mermas
    },
    actorUser
  );

  const aplicada = await transformacionesService.aplicarTransformacion(
    borrador.data.id,
    {
      autorizacion: {
        usuario: adminUser.usuario || 'admin',
        password: 'admin123'
      }
    },
    actorUser
  );

  return {
    borrador: borrador.data,
    aplicada: aplicada.data
  };
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });

  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  await openTurno(cajero);

  const fixture = await seedOperationalFixtures(db);

  try {
    const stockResAntes = await getProduct(fixture.productos.base.res.id);
    const stockPlatosAntes = await getProduct(fixture.productos.simples.platos.id);

    const ordenBase = await comprasService.createOrden({
      proveedor_id: fixture.proveedores.ganado.id,
      observacion: 'Orden bases cárnicas',
      items: [
        { producto_id: fixture.productos.base.res.id, cantidad: 225 },
        { producto_id: fixture.productos.base.cerdo.id, cantidad: 90 },
        { producto_id: fixture.productos.base.pollo.id, cantidad: 60 }
      ]
    }, cajero);

    const stockResPostOrden = await getProduct(fixture.productos.base.res.id);
    assert(Number(stockResPostOrden.stock_actual) === Number(stockResAntes.stock_actual), 'Crear orden no debe mover stock');

    await purchaseAndReceive({
      actorUser: cajero,
      proveedorId: fixture.proveedores.ganado.id,
      numeroFactura: 'OC-BASE-001',
      metodoPago: 'CREDITO',
      items: [
        { producto_id: fixture.productos.base.res.id, cantidad: 225, costo_unit: 4.1 },
        { producto_id: fixture.productos.base.cerdo.id, cantidad: 90, costo_unit: 3.4 },
        { producto_id: fixture.productos.base.pollo.id, cantidad: 60, costo_unit: 2.2 }
      ]
    });

    await purchaseAndReceive({
      actorUser: cajero,
      proveedorId: fixture.proveedores.insumos.id,
      numeroFactura: 'OC-DIRECTO-001',
      metodoPago: 'CONTADO',
      items: [
        { producto_id: fixture.productos.simples.chorizo.id, cantidad: 10, costo_unit: 0.9 },
        { producto_id: fixture.productos.simples.chorizoArgentino.id, cantidad: 8, costo_unit: 1.15 },
        { producto_id: fixture.productos.simples.milanesaPollo.id, cantidad: 24, costo_unit: 2.35 }
      ]
    });

    await purchaseAndReceive({
      actorUser: cajero,
      proveedorId: fixture.proveedores.insumos.id,
      numeroFactura: 'OC-SIMPLE-001',
      metodoPago: 'CONTADO',
      items: [
        { producto_id: fixture.productos.simples.platos.id, cantidad: 200, costo_unit: 0.12 },
        { producto_id: fixture.productos.simples.condimento.id, cantidad: 50, costo_unit: 0.35 },
        { producto_id: fixture.productos.simples.queso.id, cantidad: 35.5, costo_unit: 2.8 },
        { producto_id: fixture.productos.simples.leche.id, cantidad: 60, costo_unit: 0.8 }
      ]
    });

    const stockRes = await getProduct(fixture.productos.base.res.id);
    const stockCerdo = await getProduct(fixture.productos.base.cerdo.id);
    const stockPollo = await getProduct(fixture.productos.base.pollo.id);
    const stockChorizo = await getProduct(fixture.productos.simples.chorizo.id);
    const stockChorizoArg = await getProduct(fixture.productos.simples.chorizoArgentino.id);
    const stockMilanesa = await getProduct(fixture.productos.simples.milanesaPollo.id);
    const stockPlatos = await getProduct(fixture.productos.simples.platos.id);
    const facturaContado = await db('compras_facturas').where({ numero_factura: 'OC-SIMPLE-001' }).first();
    const cashCompra = await db('caja_movimientos')
      .where({
        modulo_origen: 'COMPRAS',
        origen_id: facturaContado.id,
        tipo: 'COMPRA_CONTADO'
      })
      .first();
    const movimientosCompra = await db('inventario_movimientos').where({ tipo: 'COMPRA' });

    assert(asQty(stockRes.stock_actual) === 225, 'Res no ingresó a inventario');
    assert(asQty(stockCerdo.stock_actual) === 90, 'Cerdo no ingresó a inventario');
    assert(asQty(stockPollo.stock_actual) === 60, 'Pollo no ingresó a inventario');
    assert(asQty(stockChorizo.stock_actual) === 10, 'Chorizo no ingresó a inventario');
    assert(asQty(stockChorizoArg.stock_actual) === 8, 'Chorizo argentino no ingresó a inventario');
    assert(asQty(stockMilanesa.stock_actual) === 24, 'Milanesa de pollo no ingresó a inventario');
    assert(asQty(stockPlatos.stock_actual) === asQty(stockPlatosAntes.stock_actual) + 200, 'Producto simple no ingresó a inventario');
    assert(Boolean(cashCompra), 'Compra contado no generó efecto en caja');
    assert(movimientosCompra.length >= 10, 'No se registraron movimientos de compra esperados');
    add(1, 'Compras y recepciones cargan productos base y simples sin mover stock al emitir orden', true);
  } catch (error) {
    add(1, 'Compras y recepciones cargan productos base y simples sin mover stock al emitir orden', false, error.message);
  }

  try {
    await createAndApplyTransform({
      actorUser: cajero,
      adminUser: admin,
      parentProductId: fixture.productos.base.res.id,
      parentQty: 120,
      referencia: 'DESP-RES-001',
      resultados: [
        { producto_id: fixture.productos.hijos.lomoFino.id, cantidad: 25 },
        { producto_id: fixture.productos.hijos.costillaRes.id, cantidad: 35 },
        { producto_id: fixture.productos.hijos.molida.id, cantidad: 45 },
        { producto_id: fixture.productos.hijos.hueso.id, cantidad: 10 }
      ],
      mermas: [{ tipo_merma: 'RECORTE', cantidad: 5, motivo: 'Recorte operativo' }]
    });

    await createAndApplyTransform({
      actorUser: cajero,
      adminUser: admin,
      parentProductId: fixture.productos.base.cerdo.id,
      parentQty: 90,
      referencia: 'DESP-CERDO-001',
      resultados: [
        { producto_id: fixture.productos.hijos.chuleta.id, cantidad: 30 },
        { producto_id: fixture.productos.hijos.costillaCerdo.id, cantidad: 20 },
        { producto_id: fixture.productos.hijos.fritada.id, cantidad: 25 },
        { producto_id: fixture.productos.hijos.grasa.id, cantidad: 10 }
      ],
      mermas: [{ tipo_merma: 'MERMA_GRASA', cantidad: 5, motivo: 'Merma operativa de cerdo' }]
    });

    await createAndApplyTransform({
      actorUser: cajero,
      adminUser: admin,
      parentProductId: fixture.productos.base.pollo.id,
      parentQty: 60,
      referencia: 'DESP-POLLO-001',
      resultados: [
        { producto_id: fixture.productos.hijos.pechuga.id, cantidad: 24 },
        { producto_id: fixture.productos.hijos.muslo.id, cantidad: 18 },
        { producto_id: fixture.productos.hijos.alas.id, cantidad: 10 },
        { producto_id: fixture.productos.hijos.menudencia.id, cantidad: 4 }
      ],
      mermas: [{ tipo_merma: 'MERMA_AVES', cantidad: 4, motivo: 'Proceso de limpieza' }]
    });

    const transformError = await expectThrows(
      () => createAndApplyTransform({
        actorUser: cajero,
        adminUser: admin,
        parentProductId: fixture.productos.base.res.id,
        parentQty: 106,
        referencia: 'DESP-RES-ERR',
        resultados: [{ producto_id: fixture.productos.hijos.lomoFino.id, cantidad: 106 }],
        mermas: []
      }),
      'Stock insuficiente'
    );

    const resBase = await getProduct(fixture.productos.base.res.id);
    const pechuga = await getProduct(fixture.productos.hijos.pechuga.id);
    const chuleta = await getProduct(fixture.productos.hijos.chuleta.id);
    const movimientosTransform = await db('inventario_movimientos').whereIn('tipo', [
      'TRANSFORMACION_CONSUMO',
      'TRANSFORMACION_PRODUCCION',
      'TRANSFORMACION_MERMA'
    ]);

    assert(asQty(resBase.stock_actual) === 105, 'El producto base de res debe conservar el saldo no procesado');
    assert(asQty(pechuga.stock_actual) === 24, 'Pechuga no se produjo correctamente');
    assert(asQty(chuleta.stock_actual) === 30, 'Chuleta no se produjo correctamente');
    assert(movimientosTransform.length >= 15, 'No se registraron movimientos suficientes de despiece');
    assert(transformError.ok, 'No falló el despiece con stock insuficiente');
    add(2, 'Despiece genera hijos, merma y movimientos; bloquea consumo mayor al stock disponible', true);
  } catch (error) {
    add(2, 'Despiece genera hijos, merma y movimientos; bloquea consumo mayor al stock disponible', false, error.message);
  }

  try {
    await inventarioService.ajustesMasivo(
      {
        observacion: 'Ajustes operativos',
        items: [
          {
            producto_id: fixture.productos.simples.platos.id,
            cantidad: 20,
            referencia: 'AJUSTE_ENTRADA'
          },
          {
            producto_id: fixture.productos.simples.condimento.id,
            cantidad: -3,
            referencia: 'AJUSTE_SALIDA'
          }
        ]
      },
      cajero
    );

    const conteo = await inventarioService.crearConteo(
      {
        observacion: 'Conteo leche fría',
        items: [
          {
            producto_id: fixture.productos.simples.leche.id,
            stock_conteo: 55
          }
        ]
      },
      cajero.id
    );

    await inventarioService.aplicarConteo(conteo.data.conteo.id, cajero);
    await inventarioService.createMerma(
      {
        producto_id: fixture.productos.simples.queso.id,
        cantidad: 1.5,
        motivo: 'Merma por corte'
      },
      cajero
    );

    const platos = await getProduct(fixture.productos.simples.platos.id);
    const condimento = await getProduct(fixture.productos.simples.condimento.id);
    const leche = await getProduct(fixture.productos.simples.leche.id);
    const queso = await getProduct(fixture.productos.simples.queso.id);
    const conteos = await inventarioService.conteos();
    const movimientos = await db('inventario_movimientos').whereIn('tipo', ['AJUSTE', 'AJUSTE_CONTEO', 'MERMA']);

    assert(asQty(platos.stock_actual) === 220, 'Entrada manual no se aplicó en platos');
    assert(asQty(condimento.stock_actual) === 47, 'Salida manual no se aplicó en condimento');
    assert(asQty(leche.stock_actual) === 55, 'Conteo no ajustó stock de leche');
    assert(asQty(queso.stock_actual) === 34, 'Merma no descontó queso correctamente');
    assert(conteos.data.some((row) => Number(row.id) === Number(conteo.data.conteo.id) && row.estado === 'APLICADO'), 'El conteo aplicado no aparece en historial');
    assert(movimientos.some((row) => row.tipo === 'AJUSTE'), 'No hay movimiento AJUSTE');
    assert(movimientos.some((row) => row.tipo === 'AJUSTE_CONTEO'), 'No hay movimiento AJUSTE_CONTEO');
    assert(movimientos.some((row) => row.tipo === 'MERMA'), 'No hay movimiento MERMA');
    add(3, 'Inventario aplica ajustes, conteos y mermas con trazabilidad y stock consistente', true);
  } catch (error) {
    add(3, 'Inventario aplica ajustes, conteos y mermas con trazabilidad y stock consistente', false, error.message);
  }

  try {
    const venta1 = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [
          { producto_id: fixture.productos.hijos.pechuga.id, cantidad: 5 },
          { producto_id: fixture.productos.hijos.costillaRes.id, cantidad: 3 },
          { producto_id: fixture.productos.simples.queso.id, cantidad: 2.5 },
          { producto_id: fixture.productos.simples.leche.id, cantidad: 8 },
          { producto_id: fixture.productos.simples.condimento.id, cantidad: 4 }
        ],
        pagos: { contado: 67.7, credito: 0 },
        descuento_total: 0
      },
      cajero
    );

    const venta2 = await ventasService.createVenta(
      {
        cliente_id: fixture.cliente.id,
        items: [
          { producto_id: fixture.productos.hijos.chuleta.id, cantidad: 2 },
          { producto_id: fixture.productos.simples.platos.id, cantidad: 10 }
        ],
        pagos: { contado: 0, credito: 15.3 },
        descuento_total: 0
      },
      cajero
    );

    const venta3 = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [
          { producto_id: fixture.productos.simples.chorizo.id, cantidad: 3 },
          { producto_id: fixture.productos.simples.chorizoArgentino.id, cantidad: 2 },
          { producto_id: fixture.productos.simples.milanesaPollo.id, cantidad: 1.5 }
        ],
        pagos: { metodo: 'CONTADO', codigo: 'TRANSFERENCIA', contado: 13.8, credito: 0 },
        descuento_total: 0
      },
      cajero
    );

    const pechuga = await getProduct(fixture.productos.hijos.pechuga.id);
    const costillaRes = await getProduct(fixture.productos.hijos.costillaRes.id);
    const queso = await getProduct(fixture.productos.simples.queso.id);
    const leche = await getProduct(fixture.productos.simples.leche.id);
    const condimento = await getProduct(fixture.productos.simples.condimento.id);
    const chuleta = await getProduct(fixture.productos.hijos.chuleta.id);
    const platos = await getProduct(fixture.productos.simples.platos.id);
    const chorizo = await getProduct(fixture.productos.simples.chorizo.id);
    const chorizoArgentino = await getProduct(fixture.productos.simples.chorizoArgentino.id);
    const milanesaPollo = await getProduct(fixture.productos.simples.milanesaPollo.id);
    const ventaMovs = await db('inventario_movimientos').where({ tipo: 'SALIDA_VENTA' });
    const cxc = await db('cxc_movimientos').where({ venta_id: venta2.data.venta.id, tipo: 'CARGO' }).first();
    const ticketTransfer = await ventasService.getTicket(venta3.data.venta.id);

    assert(asQty(pechuga.stock_actual) === 19, 'Venta no descontó pechuga');
    assert(asQty(costillaRes.stock_actual) === 32, 'Venta no descontó costilla de res');
    assert(asQty(queso.stock_actual) === 31.5, 'Venta no descontó queso');
    assert(asQty(leche.stock_actual) === 47, 'Venta no descontó fundas de leche');
    assert(asQty(condimento.stock_actual) === 43, 'Venta no descontó condimento');
    assert(asQty(chuleta.stock_actual) === 28, 'Venta crédito no descontó chuleta');
    assert(asQty(platos.stock_actual) === 210, 'Venta crédito no descontó platos');
    assert(asQty(chorizo.stock_actual) === 7, 'Venta por transferencia no descontó chorizo');
    assert(asQty(chorizoArgentino.stock_actual) === 6, 'Venta por transferencia no descontó chorizo argentino');
    assert(asQty(milanesaPollo.stock_actual) === 22.5, 'Venta por transferencia no descontó milanesa de pollo');
    assert(ticketTransfer.data.metodo_pago_codigo === 'TRANSFERENCIA', 'La venta por transferencia no preservó el método de pago');
    assert(ventaMovs.length >= 10, 'No se registraron movimientos de salida por venta');
    assert(Number(cxc.monto) === 15.3, 'Venta a crédito no generó CxC esperado');
    add(4, 'Ventas de productos hijos y simples descuentan stock y dejan movimientos/CxC correctos', true);
  } catch (error) {
    add(4, 'Ventas de productos hijos y simples descuentan stock y dejan movimientos/CxC correctos', false, error.message);
  }

  await closeTurno(cajero);
  const report = printSuiteReport('TESTS OPERACION MODULOS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando operacion-modulos.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
