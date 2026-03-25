/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'modulo4-configuracion-sistema' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const comprasService = require('../../src/modules/compras/compras.service');
const clientesService = require('../../src/modules/clientes/clientes.service');
const proveedoresService = require('../../src/modules/proveedores/proveedores.service');
const cxpService = require('../../src/modules/cxp/cxp.service');
const configuracionService = require('../../src/modules/configuracion/configuracion.service');
const productosService = require('../../src/modules/productos/productos.service');
const { prepareDatabase } = require('../support/database');
const { addDays } = require('../../src/helpers/credit');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function loginAdmin() {
  return (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
}

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function prepareScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  const [admin, cajero] = await Promise.all([loginAdmin(), loginCajero()]);
  return { admin, cajero };
}

async function openTurno(cajero, observacion = 'Turno modulo 4') {
  return cajaService.abrirTurno({ fondo_inicial: 100, observacion }, cajero.id);
}

async function updateConfigAs(admin, patch) {
  const current = (await configuracionService.getConfiguracion()).data;
  return configuracionService.updateConfiguracion(
    {
      ...current,
      ...patch
    },
    admin
  );
}

async function updateMethodsAs(admin, updatesByCode) {
  const current = (await configuracionService.getMetodosPago()).data;
  return configuracionService.updateMetodosPago(
    {
      metodos: current.map((method) => ({
        id: method.id,
        habilitado: Object.prototype.hasOwnProperty.call(updatesByCode, method.codigo)
          ? Boolean(updatesByCode[method.codigo])
          : Boolean(method.habilitado)
      }))
    },
    admin
  );
}

async function createCreditSale(cajero, options = {}) {
  const monto = Number(options.monto || 6);
  const cantidad = Number(options.cantidad || 1);
  const precioVenta = Number((monto / cantidad).toFixed(2));
  let productoId = Number(options.producto_id || 0);

  if (!productoId) {
    const existing = await db('productos')
      .where({ activo: 1, unidad_medida: 'UND' })
      .andWhere('precio_venta', precioVenta)
      .andWhere('stock_actual', '>=', cantidad)
      .orderBy('id', 'asc')
      .first();

    if (existing) {
      productoId = existing.id;
    } else {
      const created = await productosService.create({
        codigo: `TST-CFG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        nombre: `Producto configuracion ${monto}`,
        unidad_medida: 'UND',
        precio_venta: precioVenta,
        stock_actual: Math.max(20, cantidad),
        activo: true
      });
      productoId = created.id;
    }
  }

  return ventasService.createVenta(
    {
      cliente_id: options.cliente_id ?? 1,
      items: [{ producto_id: productoId, cantidad }],
      pagos: { contado: 0, credito: monto },
      descuento_total: 0,
      referencia: options.referencia || null
    },
    cajero
  );
}

async function createCreditPurchase(cajero, options = {}) {
  const numeroFactura = options.numero_factura || `M4-CXP-${Date.now()}`;
  const cantidad = Number(options.cantidad || 2);
  const costoUnit = Number(options.costo_unit || 4);
  const proveedorId = Number(options.proveedor_id || 1);

  const orden = await comprasService.createOrden(
    {
      proveedor_id: proveedorId,
      observacion: `Compra credito ${numeroFactura}`,
      autorizacion: { usuario: 'admin', password: 'admin123' },
      items: [{ producto_id: options.producto_id || 2, cantidad }]
    },
    cajero
  );

  const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
  const recepcion = await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      factura: {
        numero_factura: numeroFactura,
        metodo_pago: options.metodo_pago || 'CREDITO'
      },
      items: [{ orden_detalle_id: detalle.id, cantidad, costo_unit_real: costoUnit }]
    },
    cajero
  );
  const factura = await db('compras_facturas').where({ numero_factura: numeroFactura }).first();

  return {
    orden,
    detalle,
    recepcion,
    factura
  };
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const { admin } = await prepareScenario();
    const config = (await configuracionService.getConfiguracion()).data;
    const methods = (await configuracionService.getMetodosPago()).data;
    assert(config.negocio_nombre === 'QKarnes POS', 'La configuracion por defecto no fue creada');
    assert(Array.isArray(methods) && methods.length >= 4, 'No se cargaron metodos de pago por defecto');
    assert(methods.some((method) => method.codigo === 'EFECTIVO' && method.habilitado), 'EFECTIVO no quedo habilitado');
    assert(methods.some((method) => method.codigo === 'CREDITO_CLIENTE' && method.habilitado), 'CREDITO_CLIENTE no quedo habilitado');
    add(1, 'Configuracion inicial y metodos de pago por defecto disponibles', true);
  } catch (error) {
    add(1, 'Configuracion inicial y metodos de pago por defecto disponibles', false, error.message);
  }

  try {
    const { admin } = await prepareScenario();
    await updateConfigAs(admin, {
      negocio_nombre: 'Carniceria Centro',
      moneda: 'USD',
      impuesto_porcentaje: 12,
      dias_credito_cliente_default: 12,
      dias_credito_proveedor_default: 18,
      ticket_prefijo: 'CC',
      ticket_mensaje: 'Gracias por preferirnos'
    });
    await updateMethodsAs(admin, { TARJETA: false, TRANSFERENCIA: true });
    const updatedConfig = (await configuracionService.getConfiguracion()).data;
    const updatedMethods = (await configuracionService.getMetodosPago()).data;
    const cliente = await clientesService.create({ nombre: 'Cliente config' });
    const proveedor = await proveedoresService.create({ nombre: 'Proveedor config', tiene_credito: true });
    assert(updatedConfig.negocio_nombre === 'Carniceria Centro', 'ADMIN no pudo actualizar configuracion');
    assert(updatedConfig.impuesto_porcentaje === 12, 'No se guardo impuesto configurado');
    assert(updatedMethods.some((method) => method.codigo === 'TARJETA' && !method.habilitado), 'No se guardo el cambio de metodo de pago');
    assert(Number(cliente.dias_credito) === 12, 'El cliente no tomo el plazo por defecto configurado');
    assert(Number(proveedor.dias_pago) === 18, 'El proveedor no tomo el plazo por defecto configurado');
    add(2, 'ADMIN puede actualizar configuracion, metodos y defaults de credito', true);
  } catch (error) {
    add(2, 'ADMIN puede actualizar configuracion, metodos y defaults de credito', false, error.message);
  }

  {
    const { admin, cajero } = await prepareScenario();
    const current = (await configuracionService.getConfiguracion()).data;
    const methods = (await configuracionService.getMetodosPago()).data;
    const r1 = await expectThrows(
      () => configuracionService.updateConfiguracion({ ...current, negocio_nombre: 'Caja sin permiso' }, cajero),
      'Solo ADMIN'
    );
    const r2 = await expectThrows(
      () => configuracionService.updateMetodosPago({ metodos: methods.map((method) => ({ id: method.id, habilitado: true })) }, cajero),
      'Solo ADMIN'
    );
    add(3, 'Solo ADMIN puede modificar configuracion y metodos de pago', r1.ok && r2.ok, `${r1.error} | ${r2.error}`);
  }

  {
    const { admin } = await prepareScenario();
    const r = await expectThrows(
      () => updateConfigAs(admin, { impuesto_porcentaje: 101 }),
      'Datos'
    );
    add(4, 'Impuesto fuera de rango falla', r.ok, r.error);
  }

  {
    const { admin } = await prepareScenario();
    const r = await expectThrows(
      () => updateConfigAs(admin, { dias_credito_cliente_default: -1 }),
      'Datos'
    );
    add(5, 'Dias de credito negativos fallan', r.ok, r.error);
  }

  {
    const { admin, cajero } = await prepareScenario();
    await updateConfigAs(admin, { permitir_ventas_credito: false });
    const r = await expectThrows(
      () => createCreditSale(cajero, { referencia: 'M4-VTA-001' }),
      'deshabilitadas'
    );
    add(6, 'Configurar ventas credito en OFF bloquea ventas a credito', r.ok, r.error);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    const productoTicket = await productosService.create({
      codigo: `TST-TICKET-${Date.now()}`,
      nombre: 'Producto ticket configuracion',
      unidad_medida: 'UND',
      precio_venta: 10,
      stock_actual: 10,
      activo: true
    });
    await updateConfigAs(admin, {
      negocio_nombre: 'Carniceria Centro',
      negocio_ruc: '0999999999001',
      negocio_direccion: 'Av. Principal 123',
      impuesto_porcentaje: 12,
      precio_incluye_impuesto: false,
      ticket_prefijo: 'CFG',
      ticket_mensaje: 'Gracias por su compra'
    });
    await openTurno(cajero, 'Ticket configurado');
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: productoTicket.id, cantidad: 1 }],
        pagos: { contado: 10, credito: 0 },
        descuento_total: 0,
        referencia: 'M4-TICKET-001'
      },
      cajero
    );
    const ticket = await ventasService.getTicket(venta.data.venta.id);
    assert(ticket.data.negocio.nombre === 'Carniceria Centro', 'El ticket no usa nombre de negocio configurado');
    assert(ticket.data.ticket_config.numero.startsWith('CFG-'), 'El ticket no usa prefijo configurado');
    assert(ticket.data.ticket_config.mensaje === 'Gracias por su compra', 'El ticket no usa mensaje configurado');
    assert(Number(ticket.data.totales.impuesto_estimado) === 1.2, `Impuesto estimado invalido: ${ticket.data.totales.impuesto_estimado}`);
    add(7, 'Ticket y totales leen configuracion activa sin reiniciar', true);
  } catch (error) {
    add(7, 'Ticket y totales leen configuracion activa sin reiniciar', false, error.message);
  }

  {
    const { admin, cajero } = await prepareScenario();
    await updateMethodsAs(admin, { CREDITO_CLIENTE: false });
    const r = await expectThrows(
      () => createCreditSale(cajero, { referencia: 'M4-VTA-002' }),
      'Metodo de pago no habilitado'
    );
    add(8, 'Deshabilitar CREDITO_CLIENTE bloquea venta a credito', r.ok, r.error);
  }

  {
    const { admin, cajero } = await prepareScenario();
    await updateConfigAs(admin, { permitir_compras_credito: false });
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Compra credito deshabilitada',
        autorizacion: { usuario: 'admin', password: 'admin123' },
          items: [{ producto_id: 2, cantidad: 1 }]
      },
      cajero
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    const r = await expectThrows(
      () => comprasService.receiveOrden(
        orden.data.orden.id,
        {
          factura: { numero_factura: 'M4-CXP-001', metodo_pago: 'CREDITO' },
          items: [{ orden_detalle_id: detalle.id, cantidad: 1, costo_unit_real: 4 }]
        },
        cajero
      ),
      'deshabilitadas'
    );
    add(9, 'Configurar compras credito en OFF bloquea recepcion a credito', r.ok, r.error);
  }

  {
    const { admin, cajero } = await prepareScenario();
    await updateMethodsAs(admin, { EFECTIVO: false });
    const r = await expectThrows(
      () => ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
          pagos: { contado: 4.5, credito: 0 },
          descuento_total: 0
        },
        cajero
      ),
      'Metodo de pago no habilitado'
    );
    add(10, 'Deshabilitar EFECTIVO bloquea ventas contado', r.ok, r.error);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await updateConfigAs(admin, { exigir_caja_abierta_para_cobros: false });
    const venta = await createCreditSale(cajero, { referencia: 'M4-VTA-003' });
    const abono = await clientesService.abono(
      1,
      {
        venta_id: venta.data.venta.id,
        monto: 6,
        referencia: 'ABONO-M4-001'
      },
      cajero
    );
    assert(abono.data.turno_id === null, 'El abono debio permitirse sin turno');
    assert(abono.data.movimiento_caja === null, 'No debio generar caja sin turno abierto');
    add(11, 'Config de cobros permite abono sin turno y sin contaminar caja', true);
  } catch (error) {
    add(11, 'Config de cobros permite abono sin turno y sin contaminar caja', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await updateConfigAs(admin, { exigir_caja_abierta_para_pagos: false });
    const { factura } = await createCreditPurchase(cajero, { numero_factura: 'M4-CXP-002' });
    const pago = await cxpService.pagarProveedor(
      1,
      {
        factura_id: factura.id,
        monto: 8,
        referencia: 'PAGO-M4-001'
      },
      cajero
    );
    assert(pago.data.turno_id === null, 'El pago debio permitirse sin turno');
    assert(pago.data.movimiento_caja === null, 'No debio generar caja sin turno abierto');
    add(12, 'Config de pagos permite pagar proveedor sin turno y sin contaminar caja', true);
  } catch (error) {
    add(12, 'Config de pagos permite pagar proveedor sin turno y sin contaminar caja', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await updateConfigAs(admin, { dias_credito_cliente_default: 21 });
    const cliente = await clientesService.create({ nombre: 'Cliente plazo config' });
    const venta = await createCreditSale(cajero, {
      cliente_id: cliente.id,
      referencia: 'M4-VTA-004'
    });
    const cargo = await db('cxc_movimientos').where({ venta_id: venta.data.venta.id, tipo: 'CARGO' }).first();
    assert(cargo.fecha_vencimiento === addDays(cargo.fecha_emision, 21), 'La venta no tomo el vencimiento configurado');
    add(13, 'Ventas a credito nuevas toman dias por defecto configurados', true);
  } catch (error) {
    add(13, 'Ventas a credito nuevas toman dias por defecto configurados', false, error.message);
  }

  const report = printSuiteReport('MODULO 4 - CONFIGURACION DEL SISTEMA', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando modulo4-configuracion-sistema.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
