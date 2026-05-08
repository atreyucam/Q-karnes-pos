/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'modulo6-auditoria-operativa' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const inventarioService = require('../../src/modules/inventario/inventario.service');
const comprasService = require('../../src/modules/compras/compras.service');
const transformacionesService = require('../../src/modules/transformaciones/transformaciones.service');
const auditoriaService = require('../../src/modules/auditoria/auditoria.service');
const { prepareDatabase } = require('../support/database');
const { createCategoria, createProducto, createProveedor } = require('../support/factories');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function prepareScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  return { admin, cajero };
}

async function ensureOpenShift(cajero, fondoInicial = 50) {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: fondoInicial, observacion: 'Turno modulo 6' }, cajero.id);
}

async function createTransformacionAplicada(admin, cajero, suffix) {
  const categoria = await createCategoria(db, { nombre: `Auditoria ${suffix}` });
  const proveedor = await createProveedor(db, {
    nombre: `Proveedor auditoria ${suffix}`,
    tiene_credito: true,
    dias_pago: 15
  });

  const padre = await createProducto(db, {
    categoria_id: categoria.id,
    codigo: `AUD-P-${suffix}`,
    nombre: `Padre ${suffix}`,
    unidad_medida: 'LB',
    stock_actual: 0,
    costo_promedio: 0,
    es_transformable: true
  });
  const hijo = await createProducto(db, {
    categoria_id: categoria.id,
    codigo: `AUD-H-${suffix}`,
    nombre: `Hijo ${suffix}`,
    unidad_medida: 'LB',
    stock_actual: 0,
    costo_promedio: 0,
    es_transformable: false
  });
  const merma = await createProducto(db, {
    categoria_id: categoria.id,
    codigo: `AUD-M-${suffix}`,
    nombre: `Merma ${suffix}`,
    unidad_medida: 'LB',
    stock_actual: 0,
    costo_promedio: 0,
    es_vendible: false,
    es_transformable: false,
    es_merma: true
  });

  const orden = await comprasService.createOrden(
    {
      proveedor_id: proveedor.id,
      observacion: `Compra auditoria ${suffix}`,
      items: [{ producto_id: padre.id, cantidad: 10 }]
    },
    cajero
  );

  const detalleOrden = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
  await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      factura: {
        numero_factura: `AUD-FAC-${suffix}`,
        metodo_pago: 'CREDITO'
      },
      items: [{
        orden_detalle_id: detalleOrden.id,
        cantidad: 10,
        costo_unit_real: 4
      }]
    },
    cajero
  );

  const borrador = await transformacionesService.createBorrador(
    {
      tipo_proceso: 'DESPIECE',
      observacion: `Auditoria ${suffix}`,
      insumo: { producto_id: padre.id, cantidad: 10 },
      resultados: [
        { producto_id: hijo.id, cantidad: 8 }
      ],
      mermas: [
        { tipo_merma: 'RECORTE', producto_id: merma.id, cantidad: 2, motivo: 'Auditoria' }
      ]
    },
    admin
  );

  return transformacionesService.aplicarTransformacion(borrador.data.id, {}, admin);
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 40);

    const ventaResult = await ventasService.createVenta(
      {
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 5 }],
        pagos: { contado: 5, credito: 0 },
        observacion: 'Venta auditada'
      },
      cajero
    );

    const ventaId = Number(ventaResult.data.venta.id);
    const auditVenta = await db('auditoria_eventos')
      .where({ entidad: 'VENTA', entidad_id: String(ventaId), accion: 'VENTA' })
      .orderBy('id', 'desc')
      .first();

    assert(auditVenta, 'No se registró evento de venta');
    assert(auditVenta.tipo_evento === 'CREACION', `Tipo evento inválido: ${auditVenta?.tipo_evento}`);
    assert(Boolean(auditVenta.despues), 'La auditoría de venta no guardó después');
    add(1, 'Venta registra evento auditado con tipo_evento y payload posterior', true);
  } catch (error) {
    add(1, 'Venta registra evento auditado con tipo_evento y payload posterior', false, error.message);
  }

  try {
    const { admin } = await prepareScenario();
    await inventarioService.ajustesMasivo(
      {
        observacion: 'Ajuste modulo 6',
        items: [{
          producto_id: 1,
          cantidad: 2,
          referencia: 'AJUSTE-M6',
          costo_origen_tipo: 'MANUAL',
          costo_unitario_manual: 5
        }]
      },
      admin
    );

    const auditInventario = await db('auditoria_eventos')
      .where({ entidad: 'INVENTARIO', accion: 'AJUSTE_MASIVO' })
      .orderBy('id', 'desc')
      .first();

    assert(auditInventario, 'No se registró auditoría de ajuste');
    assert(auditInventario.tipo_evento === 'AJUSTE', `Tipo evento de ajuste inválido: ${auditInventario?.tipo_evento}`);
    assert(Boolean(auditInventario.despues), 'La auditoría de ajuste no guardó payload posterior');
    add(2, 'Ajuste inventario positivo queda auditado con trazabilidad financiera', true);
  } catch (error) {
    add(2, 'Ajuste inventario positivo queda auditado con trazabilidad financiera', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 40);
    const aplicada = await createTransformacionAplicada(admin, cajero, 'M6');
    const auditTransformacion = await db('auditoria_eventos')
      .where({ entidad: 'TRANSFORMACION', entidad_id: String(aplicada.data.id), accion: 'APLICAR' })
      .orderBy('id', 'desc')
      .first();

    assert(auditTransformacion, 'No se registró auditoría de transformación aplicada');
    assert(auditTransformacion.tipo_evento === 'APLICACION', `Tipo evento transformación inválido: ${auditTransformacion?.tipo_evento}`);
    add(3, 'Transformación aplicada deja evento de auditoría operativo', true);
  } catch (error) {
    add(3, 'Transformación aplicada deja evento de auditoría operativo', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 40);
    await ventasService.createVenta(
      {
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 5 }],
        pagos: { contado: 5, credito: 0 }
      },
      cajero
    );

    const resumen = await auditoriaService.resumen(admin);
    assert(Array.isArray(resumen.data.errores_criticos), 'Resumen no devolvió errores críticos');
    assert(Array.isArray(resumen.data.advertencias), 'Resumen no devolvió advertencias');
    assert(resumen.data.estado_general === 'OK', `Estado general limpio inválido: ${resumen.data.estado_general}`);
    add(4, 'Auditoría automática limpia reporta estado general OK', true);
  } catch (error) {
    add(4, 'Auditoría automática limpia reporta estado general OK', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 40);
    const venta = await ventasService.createVenta(
      {
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 5 }],
        pagos: { contado: 5, credito: 0 }
      },
      cajero
    );

    await db('venta_detalle').where({ venta_id: venta.data.venta.id }).update({
      costo_unit_snapshot: null,
      subtotal_costo_centavos: 0
    });

    await db('inventario_movimientos').insert({
      tipo: 'AJUSTE_MANUAL_INVALIDO',
      producto_id: 1,
      cantidad: 1,
      referencia: null,
      signo: 1,
      fecha: '2026-04-06 14:00:00'
    });

    const resumen = await auditoriaService.resumen(admin);
    const criticalCodes = resumen.data.errores_criticos.map((item) => item.codigo);
    const warningCodes = resumen.data.advertencias.map((item) => item.codigo);

    assert(criticalCodes.includes('COSTO_VENTA_SIN_SNAPSHOT'), 'No detectó venta sin snapshot');
    assert(warningCodes.includes('INVENTARIO_MOVIMIENTO_SIN_ORIGEN'), 'No detectó movimiento sin origen');
    assert(resumen.data.estado_general === 'CRITICO', `Estado general inválido: ${resumen.data.estado_general}`);
    add(5, 'Auditoría automática detecta errores críticos y advertencias de trazabilidad', true);
  } catch (error) {
    add(5, 'Auditoría automática detecta errores críticos y advertencias de trazabilidad', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 40);
    const venta = await ventasService.createVenta(
      {
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 5 }],
        pagos: { contado: 5, credito: 0 }
      },
      cajero
    );

    const eventos = await auditoriaService.listarEventos(
      { modulo: 'VENTAS', accion: 'VENTA' },
      admin
    );
    const evento = eventos.data.find((item) => Number(item.entidad_id) === Number(venta.data.venta.id));
    const denied = await expectThrows(() => auditoriaService.resumen(cajero), 'Solo ADMIN');

    assert(evento, 'Listado de auditoría no devolvió la venta');
    assert(evento.tipo_evento === 'CREACION', 'Listado no normalizó tipo_evento');
    assert(denied.ok, 'Resumen de auditoría debe rechazar usuarios no ADMIN');
    add(6, 'Consulta de auditoría expone eventos normalizados y respeta autorización ADMIN', true);
  } catch (error) {
    add(6, 'Consulta de auditoría expone eventos normalizados y respeta autorización ADMIN', false, error.message);
  }

  try {
    const { admin } = await prepareScenario();

    await db('productos').where({ id: 1 }).update({
      stock_actual: -1,
      stock_actual_base: -1
    });

    const resumen = await auditoriaService.resumen(admin);
    const criticalCodes = resumen.data.errores_criticos.map((item) => item.codigo);

    assert(criticalCodes.includes('INVENTARIO_STOCK_NEGATIVO'), 'No detectó stock negativo');
    assert(
      resumen.data.resumen_areas.inventario.errores_criticos.some((item) => item.codigo === 'INVENTARIO_STOCK_NEGATIVO'),
      'Inventario no reflejó el hallazgo crítico de stock negativo'
    );
    add(7, 'Auditoría automática detecta stock negativo y lo clasifica en inventario', true);
  } catch (error) {
    add(7, 'Auditoría automática detecta stock negativo y lo clasifica en inventario', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 40);
    const aplicada = await createTransformacionAplicada(admin, cajero, 'M6-COSTO');

    const resultado = await db('transformacion_resultados')
      .where({ transformacion_id: aplicada.data.id })
      .first();

    await db('transformacion_resultados')
      .where({ id: resultado.id })
      .update({
        costo_asignado_centavos: Number(resultado.costo_asignado_centavos || 0) - 100
      });

    const resumen = await auditoriaService.resumen(admin);
    const criticalCodes = resumen.data.errores_criticos.map((item) => item.codigo);

    assert(criticalCodes.includes('COSTO_TRANSFORMACION_NO_CONSERVADO'), 'No detectó transformación sin conservación de costo');
    assert(
      resumen.data.resumen_areas.transformaciones.errores_criticos.some((item) => item.codigo === 'COSTO_TRANSFORMACION_NO_CONSERVADO'),
      'Transformaciones no reflejó el descuadre de costo'
    );
    add(8, 'Auditoría automática detecta transformación con costo no conservado', true);
  } catch (error) {
    add(8, 'Auditoría automática detecta transformación con costo no conservado', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 40);
    const venta = await ventasService.createVenta(
      {
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 5 }],
        pagos: { contado: 5, credito: 0 }
      },
      cajero
    );

    await db('caja_movimientos').where({ origen_id: venta.data.venta.id, tipo: 'VENTA_CONTADO' }).del();

    const resumen = await auditoriaService.resumen(admin);
    const criticalCodes = resumen.data.errores_criticos.map((item) => item.codigo);

    assert(criticalCodes.includes('CAJA_VENTA_CONTADO_SIN_MOVIMIENTO'), 'No detectó venta contado sin movimiento de caja');
    assert(criticalCodes.includes('CAJA_INGRESOS_DESCUADRADOS'), 'No detectó descuadre de caja versus ventas');
    assert(
      resumen.data.resumen_dominios.ventas.errores_criticos.some((item) => item.codigo === 'CAJA_VENTA_CONTADO_SIN_MOVIMIENTO'),
      'Dominio ventas no reflejó el hallazgo de caja'
    );
    add(9, 'Auditoría automática detecta descuadre de caja por venta contado sin movimiento', true);
  } catch (error) {
    add(9, 'Auditoría automática detecta descuadre de caja por venta contado sin movimiento', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 40);
    const aplicada = await createTransformacionAplicada(admin, cajero, 'M6-OBS');

    await db('transformacion_mermas')
      .where({ transformacion_id: aplicada.data.id })
      .del();

    const resumen = await auditoriaService.resumen(admin);
    assert(Array.isArray(resumen.data.advertencias), 'Clasificación de advertencias no devolvió arreglo');
    assert(Array.isArray(resumen.data.observaciones), 'Clasificación de observaciones no devolvió arreglo');

    const warningCodes = resumen.data.advertencias.map((item) => item.codigo);
    const observationCodes = resumen.data.observaciones.map((item) => item.codigo);

    assert(warningCodes.length >= 0, 'Clasificación de advertencias inválida');
    assert(observationCodes.includes('TRANSFORMACION_MERMA_CERO'), 'No clasificó merma cero como observación');
    assert(
      resumen.data.resumen_areas.transformaciones.observaciones.some((item) => item.codigo === 'TRANSFORMACION_MERMA_CERO'),
      'Área de transformaciones no reflejó la observación esperada'
    );
    add(10, 'Auditoría automática clasifica correctamente observaciones por transformaciones', true);
  } catch (error) {
    add(10, 'Auditoría automática clasifica correctamente observaciones por transformaciones', false, error.message);
  }

  const report = printSuiteReport('MODULO 6 - AUDITORIA OPERATIVA', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando modulo6-auditoria-operativa.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
