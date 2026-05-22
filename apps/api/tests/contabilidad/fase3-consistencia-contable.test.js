/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');
const fs = require('node:fs');

configureTestRuntime({ suiteName: 'fase3-consistencia-contable' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const clientesService = require('../../src/modules/clientes/clientes.service');
const cxpService = require('../../src/modules/cxp/cxp.service');
const reportesService = require('../../src/modules/reportes/reportes.service');
const productosService = require('../../src/modules/productos/productos.service');
const inventarioService = require('../../src/modules/inventario/inventario.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function loginAdmin() {
  return (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
}

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function openTurno(actorUser, fondo = 100, observacion = 'Turno fase 3') {
  return cajaService.abrirTurno({ fondo_inicial: fondo, observacion }, actorUser.id);
}

async function prepareScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  const [admin, cajero] = await Promise.all([loginAdmin(), loginCajero()]);
  return { admin, cajero };
}

async function createPurchase(actorUser, options = {}) {
  const proveedorId = Number(options.proveedor_id || 1);
  const productoId = Number(options.producto_id || 2);
  const cantidad = Number(options.cantidad || 2);
  const costoUnit = Number(options.costo_unit_real || 4);
  const numeroFactura = options.numero_factura || `F3-COMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const orden = await comprasService.createOrden(
    {
      proveedor_id: proveedorId,
      observacion: options.observacion || numeroFactura,
      items: [{ producto_id: productoId, cantidad }]
    },
    actorUser
  );

  const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
  const recepcion = await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      factura: {
        numero_factura: numeroFactura,
        metodo_pago: options.metodo_pago || 'CONTADO',
        metodo_pago_real: options.metodo_pago_real
      },
      items: [{ orden_detalle_id: detalle.id, cantidad, costo_unit_real: costoUnit }]
    },
    actorUser
  );

  const factura = await db('compras_facturas').where({ numero_factura: numeroFactura }).first();
  return { orden, recepcion, factura };
}

async function createCreditSale(actorUser, options = {}) {
  const monto = Number(options.monto || 6);
  let productoId = Number(options.producto_id || 0);

  if (!productoId) {
    const existing = await db('productos')
      .where({ activo: 1, unidad_medida: 'UND' })
      .andWhere('precio_venta', monto)
      .andWhere('stock_actual', '>=', Number(options.cantidad || 1))
      .orderBy('id', 'asc')
      .first();

    if (existing) {
      productoId = existing.id;
    } else {
      const admin = await loginAdmin();
      const created = await productosService.create({
        codigo: `F3-CRED-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        nombre: `Producto crédito ${monto}`,
        unidad_medida: 'UND',
        precio_venta: monto,
        activo: true
      });
      await inventarioService.ajustesMasivo(
        {
          observacion: 'Stock inicial fase 3',
          items: [{
            producto_id: created.id,
            cantidad: Math.max(20, Number(options.cantidad || 1)),
            referencia: `AJ-F3-${created.id}`,
            costo_origen_tipo: 'MANUAL',
            costo_unitario_manual: Math.max(monto / 2, 0.5)
          }]
        },
        admin
      );
      productoId = created.id;
    }
  }

  return ventasService.createVenta(
    {
      cliente_id: Number(options.cliente_id || 1),
      items: [{ producto_id: productoId, cantidad: Number(options.cantidad || 1), precio_unit: monto }],
      pagos: { contado: 0, credito: monto },
      descuento_total: 0,
      referencia: options.referencia || `F3-CXC-${Date.now()}`
    },
    actorUser
  );
}

async function createCashSale(actorUser, monto = 9, referencia = null) {
  return ventasService.createVenta(
    {
      cliente_id: null,
      items: [{ producto_id: 1, cantidad: 2, precio_unit: monto / 2 }],
      pagos: { codigo: 'EFECTIVO', contado: monto, credito: 0 },
      descuento_total: 0,
      referencia
    },
    actorUser
  );
}

async function createTransferSale(actorUser, monto = 4.5, referencia = null) {
  return ventasService.createVenta(
    {
      cliente_id: null,
      items: [{ producto_id: 1, cantidad: 1, precio_unit: monto }],
      pagos: { codigo: 'TRANSFERENCIA', contado: monto, credito: 0 },
      descuento_total: 0,
      referencia
    },
    actorUser
  );
}

async function cajaDiariaFromLatestMovement() {
  const latest = await db('caja_movimientos').orderBy('id', 'desc').first();
  const fecha = String(latest?.fecha || new Date().toISOString()).slice(0, 10);
  return reportesService.cajaDiaria({ fecha });
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const { admin } = await prepareScenario();
    await openTurno(admin, 100, 'Compra contado efectivo');
    const { factura } = await createPurchase(admin, {
      numero_factura: 'F3-CE-001',
      metodo_pago: 'CONTADO',
      metodo_pago_real: 'EFECTIVO',
      costo_unit_real: 4,
      cantidad: 2
    });
    const reporte = await cajaDiariaFromLatestMovement();
    const movimiento = await db('caja_movimientos')
      .where({ tipo: 'COMPRA_CONTADO', origen_id: factura.id, modulo_origen: 'COMPRAS' })
      .first();

    assert(movimiento && Number(movimiento.afecta_saldo) === 1, 'La compra contado en efectivo no afectó saldo');
    assert(reporte.data.resumen.compras_efectivo_centavos === 800, `Compras efectivo inválidas: ${reporte.data.resumen.compras_efectivo_centavos}`);
    assert(reporte.data.resumen.saldo_esperado_centavos === 9200, `Saldo esperado inválido: ${reporte.data.resumen.saldo_esperado_centavos}`);
    add(1, 'Compra contado efectivo reduce caja física en centavos', true);
  } catch (error) {
    add(1, 'Compra contado efectivo reduce caja física en centavos', false, error.message);
  }

  try {
    const { admin } = await prepareScenario();
    await openTurno(admin, 100, 'Compra contado transferencia');
    const { factura } = await createPurchase(admin, {
      numero_factura: 'F3-CT-001',
      metodo_pago: 'CONTADO',
      metodo_pago_real: 'TRANSFERENCIA',
      costo_unit_real: 4,
      cantidad: 2
    });
    const reporte = await cajaDiariaFromLatestMovement();
    const movimiento = await db('caja_movimientos')
      .where({ tipo: 'COMPRA_CONTADO', origen_id: factura.id, modulo_origen: 'COMPRAS' })
      .first();

    assert(movimiento && Number(movimiento.afecta_saldo) === 0, 'La compra contado por transferencia contaminó efectivo');
    assert(reporte.data.resumen.compras_transferencia_centavos === 800, `Compras transferencia inválidas: ${reporte.data.resumen.compras_transferencia_centavos}`);
    assert(reporte.data.resumen.saldo_esperado_centavos === 10000, `Saldo esperado inválido: ${reporte.data.resumen.saldo_esperado_centavos}`);
    add(2, 'Compra contado transferencia no reduce caja física', true);
  } catch (error) {
    add(2, 'Compra contado transferencia no reduce caja física', false, error.message);
  }

  try {
    const { admin } = await prepareScenario();
    const { factura } = await createPurchase(admin, {
      numero_factura: 'F3-CR-001',
      metodo_pago: 'CREDITO',
      costo_unit_real: 4,
      cantidad: 2
    });
    const deudas = await cxpService.deudasProveedor(1);
    const deuda = deudas.data.find((row) => Number(row.id) === Number(factura.id));

    assert(deuda && Number(deuda.saldo_centavos) === 800, `Saldo CxP inválido: ${deuda?.saldo_centavos}`);
    add(3, 'Compra a crédito genera CxP en centavos', true);
  } catch (error) {
    add(3, 'Compra a crédito genera CxP en centavos', false, error.message);
  }

  try {
    const { admin } = await prepareScenario();
    await openTurno(admin, 100, 'Pago proveedor efectivo');
    const { factura } = await createPurchase(admin, {
      numero_factura: 'F3-PE-001',
      metodo_pago: 'CREDITO',
      costo_unit_real: 4,
      cantidad: 2
    });
    await cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 8, metodo_pago: 'EFECTIVO', referencia: 'F3-PAGO-EF' }, admin);
    const reporte = await cajaDiariaFromLatestMovement();

    assert(reporte.data.resumen.pagos_proveedor_efectivo_centavos === 800, `Pago efectivo inválido: ${reporte.data.resumen.pagos_proveedor_efectivo_centavos}`);
    assert(reporte.data.resumen.saldo_esperado_centavos === 9200, `Saldo esperado inválido: ${reporte.data.resumen.saldo_esperado_centavos}`);
    add(4, 'Pago proveedor efectivo reduce caja física', true);
  } catch (error) {
    add(4, 'Pago proveedor efectivo reduce caja física', false, error.message);
  }

  try {
    const { admin } = await prepareScenario();
    await openTurno(admin, 100, 'Pago proveedor transferencia');
    const { factura } = await createPurchase(admin, {
      numero_factura: 'F3-PT-001',
      metodo_pago: 'CREDITO',
      costo_unit_real: 4,
      cantidad: 2
    });
    await cxpService.pagarProveedor(1, {
      factura_id: factura.id,
      monto: 8,
      metodo_pago: 'TRANSFERENCIA',
      banco: 'Banco Test',
      referencia: 'F3-PAGO-TRX'
    }, admin);
    const reporte = await cajaDiariaFromLatestMovement();

    assert(reporte.data.resumen.pagos_proveedor_transferencia_centavos === 800, `Pago transferencia inválido: ${reporte.data.resumen.pagos_proveedor_transferencia_centavos}`);
    assert(reporte.data.resumen.saldo_esperado_centavos === 10000, `Saldo esperado inválido: ${reporte.data.resumen.saldo_esperado_centavos}`);
    add(5, 'Pago proveedor transferencia no reduce caja física', true);
  } catch (error) {
    add(5, 'Pago proveedor transferencia no reduce caja física', false, error.message);
  }

  try {
    const { cajero } = await prepareScenario();
    await openTurno(cajero, 100, 'Venta crédito base');
    const venta = await createCreditSale(cajero, { monto: 6, referencia: 'F3-CXC-001' });
    const deudas = await clientesService.deudas(1);
    const deuda = deudas.data.find((row) => Number(row.id) === Number(venta.data.venta.id));

    assert(deuda && Number(deuda.saldo_centavos) === 600, `Saldo CxC inválido: ${deuda?.saldo_centavos}`);
    add(6, 'Venta a crédito genera CxC en centavos', true);
  } catch (error) {
    add(6, 'Venta a crédito genera CxC en centavos', false, error.message);
  }

  try {
    const { cajero } = await prepareScenario();
    await openTurno(cajero, 100, 'Abono cliente efectivo');
    const venta = await createCreditSale(cajero, { monto: 6, referencia: 'F3-AB-EF-001' });
    await clientesService.abono(1, { venta_id: venta.data.venta.id, monto: 6, metodo_pago: 'EFECTIVO', referencia: 'F3-ABONO-EF' }, cajero);
    const reporte = await cajaDiariaFromLatestMovement();

    assert(reporte.data.resumen.abonos_efectivo_centavos === 600, `Abono efectivo inválido: ${reporte.data.resumen.abonos_efectivo_centavos}`);
    assert(reporte.data.resumen.saldo_esperado_centavos === 10600, `Saldo esperado inválido: ${reporte.data.resumen.saldo_esperado_centavos}`);
    add(7, 'Abono cliente efectivo aumenta caja física', true);
  } catch (error) {
    add(7, 'Abono cliente efectivo aumenta caja física', false, error.message);
  }

  try {
    const { cajero } = await prepareScenario();
    await openTurno(cajero, 100, 'Abono cliente transferencia');
    const venta = await createCreditSale(cajero, { monto: 6, referencia: 'F3-AB-TRX-001' });
    await clientesService.abono(1, {
      venta_id: venta.data.venta.id,
      monto: 6,
      metodo_pago: 'TRANSFERENCIA',
      banco: 'Banco Test',
      referencia: 'F3-ABONO-TRX'
    }, cajero);
    const reporte = await cajaDiariaFromLatestMovement();

    assert(reporte.data.resumen.abonos_transferencia_centavos === 600, `Abono transferencia inválido: ${reporte.data.resumen.abonos_transferencia_centavos}`);
    assert(reporte.data.resumen.saldo_esperado_centavos === 10000, `Saldo esperado inválido: ${reporte.data.resumen.saldo_esperado_centavos}`);
    add(8, 'Abono cliente transferencia no aumenta caja física', true);
  } catch (error) {
    add(8, 'Abono cliente transferencia no aumenta caja física', false, error.message);
  }

  {
    const { admin } = await prepareScenario();
    const { factura } = await createPurchase(admin, {
      numero_factura: 'F3-CXP-ERR',
      metodo_pago: 'CREDITO',
      costo_unit_real: 4,
      cantidad: 2
    });
    const result = await expectThrows(
      () => cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 999, metodo_pago: 'EFECTIVO' }, admin),
      'exced'
    );
    add(9, 'No permite pago proveedor mayor al saldo pendiente', result.ok, result.error);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await openTurno(cajero, 100, 'Escenario combinado caja');
    await createCashSale(cajero, 9, 'F3-VENTA-EF');
    await createTransferSale(cajero, 4.5, 'F3-VENTA-TRX');
    const ventaCreditoEfectivo = await createCreditSale(cajero, { monto: 6, referencia: 'F3-CXC-EF' });
    const ventaCreditoTransfer = await createCreditSale(cajero, { monto: 4, referencia: 'F3-CXC-TRX' });
    await clientesService.abono(1, { venta_id: ventaCreditoEfectivo.data.venta.id, monto: 6, metodo_pago: 'EFECTIVO', referencia: 'F3-AB-EF' }, cajero);
    await clientesService.abono(1, { venta_id: ventaCreditoTransfer.data.venta.id, monto: 4, metodo_pago: 'TRANSFERENCIA', banco: 'Banco Test', referencia: 'F3-AB-TRX' }, cajero);

    await createPurchase(admin, { numero_factura: 'F3-COMB-EF', metodo_pago: 'CONTADO', metodo_pago_real: 'EFECTIVO', costo_unit_real: 4, cantidad: 2 });
    await createPurchase(admin, { numero_factura: 'F3-COMB-TRX', metodo_pago: 'CONTADO', metodo_pago_real: 'TRANSFERENCIA', costo_unit_real: 2.5, cantidad: 2 });
    const { factura: facturaPagoEf } = await createPurchase(admin, { numero_factura: 'F3-COMB-CRED-EF', metodo_pago: 'CREDITO', costo_unit_real: 3.5, cantidad: 2 });
    const { factura: facturaPagoTrx } = await createPurchase(admin, { numero_factura: 'F3-COMB-CRED-TRX', metodo_pago: 'CREDITO', costo_unit_real: 1.5, cantidad: 2 });
    await cxpService.pagarProveedor(1, { factura_id: facturaPagoEf.id, monto: 7, metodo_pago: 'EFECTIVO', referencia: 'F3-PG-EF' }, admin);
    await cxpService.pagarProveedor(1, { factura_id: facturaPagoTrx.id, monto: 2, metodo_pago: 'TRANSFERENCIA', banco: 'Banco Test', referencia: 'F3-PG-TRX' }, admin);

    const caja = await cajaDiariaFromLatestMovement();
    const compras = await reportesService.compras({ fecha_inicio: '2000-01-01', fecha_fin: '2100-12-31' });
    const cxc = await reportesService.cxc();
    const cxp = await reportesService.cxp();

    assert(caja.data.resumen.ventas_efectivo_centavos === 900, `Ventas efectivo inválidas: ${caja.data.resumen.ventas_efectivo_centavos}`);
    assert(caja.data.resumen.ventas_transferencia_centavos === 450, `Ventas transferencia inválidas: ${caja.data.resumen.ventas_transferencia_centavos}`);
    assert(caja.data.resumen.ventas_credito_centavos === 1000, `Ventas crédito inválidas: ${caja.data.resumen.ventas_credito_centavos}`);
    assert(caja.data.resumen.abonos_efectivo_centavos === 600, `Abonos efectivo inválidos: ${caja.data.resumen.abonos_efectivo_centavos}`);
    assert(caja.data.resumen.abonos_transferencia_centavos === 400, `Abonos transferencia inválidos: ${caja.data.resumen.abonos_transferencia_centavos}`);
    assert(caja.data.resumen.compras_efectivo_centavos === 800, `Compras efectivo inválidas: ${caja.data.resumen.compras_efectivo_centavos}`);
    assert(caja.data.resumen.compras_transferencia_centavos === 500, `Compras transferencia inválidas: ${caja.data.resumen.compras_transferencia_centavos}`);
    assert(caja.data.resumen.pagos_proveedor_efectivo_centavos === 700, `Pagos proveedor efectivo inválidos: ${caja.data.resumen.pagos_proveedor_efectivo_centavos}`);
    assert(caja.data.resumen.pagos_proveedor_transferencia_centavos === 200, `Pagos proveedor transferencia inválidos: ${caja.data.resumen.pagos_proveedor_transferencia_centavos}`);
    assert(caja.data.resumen.saldo_esperado_centavos === 10000, `Saldo esperado combinado inválido: ${caja.data.resumen.saldo_esperado_centavos}`);
    assert(Number(compras.data.resumen.total_compras_centavos || 0) >= 2300, 'Reporte de compras no usa centavos acumulados');
    assert(Number(cxc.data.resumen.saldo_total_pendiente_centavos || 0) === 0, 'Reporte CxC no cerró saldo esperado');
    assert(Number(cxp.data.resumen.saldo_total_pendiente_centavos || 0) > 0, 'Reporte CxP no refleja saldo pendiente residual');
    add(10, 'Caja y reportes separan efectivo, transferencia y crédito en centavos', true);
  } catch (error) {
    add(10, 'Caja y reportes separan efectivo, transferencia y crédito en centavos', false, error.message);
  }

  {
    const { admin } = await prepareScenario();
    const orden = await comprasService.createOrden(
      { proveedor_id: 1, observacion: 'Sin turno compra transferencia', items: [{ producto_id: 2, cantidad: 1 }] },
      admin
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    const r = await expectThrows(
      () => comprasService.receiveOrden(
        orden.data.orden.id,
        {
          factura: { numero_factura: 'F31-NOTURNO-COMP', metodo_pago: 'CONTADO', metodo_pago_real: 'TRANSFERENCIA' },
          items: [{ orden_detalle_id: detalle.id, cantidad: 1, costo_unit_real: 3 }]
        },
        admin
      ),
      'turno abierto'
    );
    add(11, 'Compra transferencia sin turno abierto se bloquea', r.ok, r.error);
  }

  {
    const { admin } = await prepareScenario();
    const { factura } = await createPurchase(admin, { numero_factura: 'F31-NOTURNO-CXP', metodo_pago: 'CREDITO', costo_unit_real: 4, cantidad: 2 });
    const r = await expectThrows(
      () => cxpService.pagarProveedor(
        1,
        { factura_id: factura.id, monto: 4, metodo_pago: 'TRANSFERENCIA', banco: 'Banco Test', referencia: 'F31-NOTURNO-PAGO' },
        admin
      ),
      'turno abierto'
    );
    add(12, 'Pago proveedor transferencia sin turno abierto se bloquea', r.ok, r.error);
  }

  {
    const { cajero } = await prepareScenario();
    await openTurno(cajero, 100, 'Generar deuda para abono');
    const venta = await createCreditSale(cajero, { monto: 6, referencia: 'F31-NOTURNO-ABONO-BASE' });
    await cajaService.corteZ({ efectivo_contado: 100, observacion: 'Cierre para prueba sin turno' }, cajero);
    const r = await expectThrows(
      () => clientesService.abono(
        1,
        { venta_id: venta.data.venta.id, monto: 2, metodo_pago: 'TRANSFERENCIA', banco: 'Banco Test', referencia: 'F31-NOTURNO-ABONO' },
        cajero
      ),
      'turno abierto'
    );
    add(13, 'Abono cliente transferencia sin turno abierto se bloquea', r.ok, r.error);
  }

  {
    const { cajero } = await prepareScenario();
    const rTransfer = await expectThrows(
      () => createTransferSale(cajero, 4.5, 'F31-NOTURNO-VTA-TRX'),
      'turno abierto'
    );
    const rCredito = await expectThrows(
      () => createCreditSale(cajero, { monto: 6, referencia: 'F31-NOTURNO-VTA-CRED' }),
      'turno abierto'
    );
    add(14, 'Venta transferencia/crédito sin turno abierto se bloquea', rTransfer.ok && rCredito.ok, `${rTransfer.error} | ${rCredito.error}`);
  }

  {
    const { admin } = await prepareScenario();
    const saldoAntes = await reportesService.cxp();
    const orden = await comprasService.createOrden(
      { proveedor_id: 1, observacion: 'Rechazo mixto', items: [{ producto_id: 2, cantidad: 1 }] },
      admin
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    const reject = await expectThrows(
      () => comprasService.receiveOrden(
        orden.data.orden.id,
        {
          factura: { numero_factura: 'F31-MIXTO-001', metodo_pago: 'CONTADO', metodo_pago_real: 'MIXTO' },
          items: [{ orden_detalle_id: detalle.id, cantidad: 1, costo_unit_real: 5 }]
        },
        admin
      ),
      'Datos inválidos'
    );
    const saldoDespues = await reportesService.cxp();
    const cajaMov = await db('caja_movimientos').where({ modulo_origen: 'COMPRAS' }).first();
    const totalAntes = Number(saldoAntes.data?.resumen?.saldo_total_pendiente_centavos || 0);
    const totalDespues = Number(saldoDespues.data?.resumen?.saldo_total_pendiente_centavos || 0);
    const ok = reject.ok && totalAntes === totalDespues && !cajaMov;
    add(15, 'Compra mixta se rechaza explícitamente sin alterar CxP ni caja', ok, reject.error);
  }

  {
    const reportesRepoPath = 'c:/Users/alexc/Proyectos/Q-karnes-pos/apps/api/src/modules/reportes/reportes.repository.js';
    const source = fs.readFileSync(reportesRepoPath, 'utf8');
    const bannedPatterns = [
      /SUM\(CAST\(v\.total AS REAL\)/,
      /SUM\(CASE WHEN cm\.tipo = 'CARGO' THEN CAST\(cm\.monto AS REAL\)/,
      /SUM\(CAST\(rd\.subtotal AS REAL\)\)/,
      /SUM\(vp\.monto\)/
    ];
    const found = bannedPatterns.filter((pattern) => pattern.test(source));
    add(16, 'Consultas financieras críticas del repositorio de reportes evitan REAL legacy', found.length === 0, found.map((p) => p.toString()).join(', '));
  }

  printSuiteReport('FASE 3 - CONSISTENCIA CONTABLE', results);

  if (destroyDb) {
    try {
      await cleanupRuntime({ destroyDb: true });
    } catch (_) {
      // better-sqlite3 can keep the temp DB locked for a short window on Windows
    }
  }

  const failed = results.filter((item) => !item.ok).length;
  if (exitOnFinish) {
    process.exit(failed > 0 ? 1 : 0);
  }

  return { failed, results };
}

if (require.main === module) {
  runSuite().catch(async (error) => {
    console.error('Fallo ejecutando fase3-consistencia-contable:', error);
    try {
      await cleanupRuntime({ destroyDb: true });
    } catch (_) {
      // ignore cleanup races on Windows test runs
    }
    process.exit(1);
  });
}

module.exports = { runSuite };
