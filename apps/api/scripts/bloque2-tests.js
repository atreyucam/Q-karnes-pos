/* eslint-disable no-console */
const db = require('../src/db/knex');
const authService = require('../src/modules/auth/auth.service');
const ventasService = require('../src/modules/ventas/ventas.service');
const cajaService = require('../src/modules/caja/caja.service');
const comprasService = require('../src/modules/compras/compras.service');
const { assert, expectThrows, printSuiteReport } = require('./test-harness');

async function getProducto(id) {
  return db('productos').where({ id }).first();
}

async function getVenta(id) {
  return db('ventas').where({ id }).first();
}

async function getCxcByVenta(ventaId) {
  return db('cxc_movimientos').where({ venta_id: ventaId }).orderBy('id', 'asc');
}

async function getCajaByConceptoLike(texto) {
  return db('caja_movimientos').where('concepto', 'like', `%${texto}%`).orderBy('id', 'desc');
}

async function getUltimoTurno() {
  return db('caja_turnos').orderBy('id', 'desc').first();
}

async function getDetallesVenta(ventaId) {
  return db('venta_detalle').where({ venta_id: ventaId }).orderBy('id', 'asc');
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;

  // Normalizar turno inicial seed: cerrarlo para empezar pruebas controladas
  const turnoInicial = await cajaService.turnoActual();
  if (turnoInicial) {
    const resumen = await cajaService.corteX(cajero);
    const contadoInicial = Math.max(0, Number(resumen.efectivo_esperado || 0));
    const requiereAuth = Number(contadoInicial) !== Number(resumen.efectivo_esperado || 0);
    await cajaService.corteZ(
      {
        efectivo_contado: contadoInicial,
        observacion: requiereAuth ? 'Cierre inicial para pruebas (ajuste por esperado negativo)' : 'Cierre inicial para pruebas',
        ...(requiereAuth ? { autorizacion: { usuario: 'admin', password: 'admin123' } } : {})
      },
      cajero
    );
  }

  // 18 apertura caja
  try {
    const abierto = await cajaService.abrirTurno({ fondo_inicial: 100, observacion: 'Bloque 2 test' }, cajero.id);
    assert(abierto?.id, 'No abrió turno');
    add(18, 'Apertura de caja por usuario permitido', true);
  } catch (e) {
    add(18, 'Apertura de caja por usuario permitido', false, e.message);
  }

  // 19 cierre por usuario distinto
  {
    const resumen = await cajaService.corteX(cajero);
    const r = await expectThrows(
      () => cajaService.corteZ({ efectivo_contado: Number(resumen.efectivo_esperado), observacion: 'intento admin' }, admin),
      'Solo quien abrió el turno puede cerrarlo'
    );
    add(19, 'Cierre por usuario distinto al que abrió falla', r.ok, r.error);
  }

  // 20 cierre normal sin diferencia
  try {
    const resumen = await cajaService.corteX(cajero);
    const close = await cajaService.corteZ({ efectivo_contado: Number(resumen.efectivo_esperado), observacion: 'cierre normal' }, cajero);
    assert(close?.data?.turno?.estado === 'CERRADO', 'No cerró turno');
    add(20, 'Cierre normal sin diferencia', true);
  } catch (e) {
    add(20, 'Cierre normal sin diferencia', false, e.message);
  }

  // reabrir turno para resto de pruebas
  await cajaService.abrirTurno({ fondo_inicial: 120, observacion: 'Turno pruebas dominio' }, cajero.id);

  // 1 venta normal contado
  let ventaNormalId;
  try {
    const p = await getProducto(10);
    const out = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 10, cantidad: 1, precio_unit: 2.2 }],
        pagos: { contado: 2.2, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    ventaNormalId = out.data.venta.id;
    const p2 = await getProducto(10);
    assert(Number(p2.stock_actual) === Number((Number(p.stock_actual) - 1).toFixed(3)), 'Stock no descontó');
    add(1, 'Venta normal con stock suficiente', true);
  } catch (e) {
    add(1, 'Venta normal con stock suficiente', false, e.message);
  }

  // 2 venta con ítems repetidos
  let ventaRepetidaId;
  try {
    const p = await getProducto(11);
    const out = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [
          { producto_id: 11, cantidad: 1, precio_unit: 2.0 },
          { producto_id: 11, cantidad: 2, precio_unit: 2.0 }
        ],
        pagos: { contado: 6.0, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    ventaRepetidaId = out.data.venta.id;
    const p2 = await getProducto(11);
    assert(Number(p2.stock_actual) === Number((Number(p.stock_actual) - 3).toFixed(3)), 'No consolidó repetidos');
    add(2, 'Venta con ítems repetidos del mismo producto', true);
  } catch (e) {
    add(2, 'Venta con ítems repetidos del mismo producto', false, e.message);
  }

  // 3 actor desde sesión y no payload externo
  let ventaActorId;
  try {
    const out = await ventasService.createVenta(
      {
        usuario_id: cajero.id,
        cliente_id: null,
        items: [{ producto_id: 17, cantidad: 1, precio_unit: 2.1 }],
        pagos: { contado: 2.1, credito: 0 },
        descuento_total: 0
      },
      admin
    );
    ventaActorId = out.data.venta.id;
    const venta = await getVenta(ventaActorId);
    assert(Number(venta.usuario_id) === Number(admin.id), 'Tomó usuario_id del payload en lugar de sesión');
    add(3, 'Usuario responsable de venta proviene de sesión', true);
  } catch (e) {
    add(3, 'Usuario responsable de venta proviene de sesión', false, e.message);
  }

  // 4 contado impacta caja
  try {
    const rows = await getCajaByConceptoLike(`Venta #${ventaNormalId}`);
    assert(rows.length > 0 && rows[0].tipo === 'VENTA', 'No registró movimiento de caja por contado');
    add(4, 'Venta contado impacta caja', true);
  } catch (e) {
    add(4, 'Venta contado impacta caja', false, e.message);
  }

  // 5 crédito impacta CxC
  let ventaCreditoId;
  try {
    const out = await ventasService.createVenta(
      {
        cliente_id: 2,
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 8 }],
        pagos: { contado: 0, credito: 8 },
        descuento_total: 0
      },
      cajero
    );
    ventaCreditoId = out.data.venta.id;
    const cxc = await getCxcByVenta(ventaCreditoId);
    assert(cxc.some((m) => m.tipo === 'CARGO' && Number(m.monto) === 8), 'No registró CxC CARGO');
    add(5, 'Venta crédito impacta CxC', true);
  } catch (e) {
    add(5, 'Venta crédito impacta CxC', false, e.message);
  }

  // preparar venta mixta para anulación admin
  const prodAntesAnul = await getProducto(6);
  const ventaMixta = await ventasService.createVenta(
    {
      cliente_id: 2,
      items: [{ producto_id: 6, cantidad: 2, precio_unit: 6 }],
      pagos: { contado: 6, credito: 6 },
      descuento_total: 0
    },
    cajero
  );
  const ventaMixtaId = ventaMixta.data.venta.id;

  // 6 anulación por admin
  try {
    const out = await ventasService.anularVenta(
      ventaMixtaId,
      { motivo: 'Error de registro', novedad: 'Ticket duplicado' },
      admin
    );
    assert(out?.data?.estado === 'ANULADA', 'No anuló');
    add(6, 'Anulación por Administrador con novedad', true);
  } catch (e) {
    add(6, 'Anulación por Administrador con novedad', false, e.message);
  }

  // 9 reversión de stock por anulación
  try {
    const prodDespues = await getProducto(6);
    assert(Number(prodDespues.stock_actual) === Number(prodAntesAnul.stock_actual), 'No revirtió stock');
    add(9, 'Anulación revierte stock', true);
  } catch (e) {
    add(9, 'Anulación revierte stock', false, e.message);
  }

  // 10 reversión caja/CxC por anulación
  try {
    const caja = await getCajaByConceptoLike(`Anulación venta #${ventaMixtaId}`);
    const cxc = await getCxcByVenta(ventaMixtaId);
    assert(caja.some((m) => m.tipo === 'ANULACION_VENTA' && Number(m.monto) === 6), 'No revirtió caja');
    assert(cxc.some((m) => m.tipo === 'ABONO' && Number(m.monto) === 6), 'No revirtió CxC');
    add(10, 'Anulación revierte caja/CxC', true);
  } catch (e) {
    add(10, 'Anulación revierte caja/CxC', false, e.message);
  }

  // 11 doble anulación falla
  {
    const r = await expectThrows(
      () => ventasService.anularVenta(ventaMixtaId, { motivo: 'retry', novedad: 'retry' }, admin),
      'ya fue anulada'
    );
    add(11, 'Doble anulación falla', r.ok, r.error);
  }

  // preparar venta para pruebas 7 y 8
  const ventaCajeroAnular = await ventasService.createVenta(
    {
      cliente_id: null,
      items: [{ producto_id: 19, cantidad: 2, precio_unit: 1.4 }],
      pagos: { contado: 2.8, credito: 0 },
      descuento_total: 0
    },
    cajero
  );
  const ventaCajeroAnularId = ventaCajeroAnular.data.venta.id;

  // 7 cajero sin clave admin falla
  {
    const r = await expectThrows(
      () => ventasService.anularVenta(ventaCajeroAnularId, { motivo: 'Error', novedad: 'sin clave' }, cajero),
      'autorización ADMIN'
    );
    add(7, 'Cajero sin clave admin no puede anular', r.ok, r.error);
  }

  // 8 cajero con autorización admin válida
  try {
    const out = await ventasService.anularVenta(
      ventaCajeroAnularId,
      {
        motivo: 'Error',
        novedad: 'autorizado',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    assert(out.data.estado === 'ANULADA', 'No anuló con autorización');
    add(8, 'Cajero con autorización admin puede anular', true);
  } catch (e) {
    add(8, 'Cajero con autorización admin puede anular', false, e.message);
  }

  // preparar venta para devoluciones
  const stockAntesDevP1 = await getProducto(10);
  const ventaDev = await ventasService.createVenta(
    {
      cliente_id: 3,
      items: [
        { producto_id: 10, cantidad: 2, precio_unit: 2.2 },
        { producto_id: 17, cantidad: 1, precio_unit: 2.1 }
      ],
      pagos: { contado: 3.25, credito: 3.25 },
      descuento_total: 0
    },
    cajero
  );
  const ventaDevId = ventaDev.data.venta.id;
  const detallesDev = await getDetallesVenta(ventaDevId);

  // 12 devolución parcial válida
  try {
    const out = await ventasService.createDevolucion(
      ventaDevId,
      {
        motivo: 'Producto no conforme',
        observacion: 'Parcial',
        items: [{ venta_detalle_id: detallesDev[0].id, cantidad: 1 }],
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    assert(out.data.total_devuelto > 0, 'No devolvió');
    const venta = await getVenta(ventaDevId);
    assert(venta.estado === 'DEVUELTA_PARCIAL', 'Estado no parcial');
    add(12, 'Devolución parcial válida', true);
  } catch (e) {
    add(12, 'Devolución parcial válida', false, e.message);
  }

  // 14 devolución mayor a vendida falla
  {
    const r = await expectThrows(
      () => ventasService.createDevolucion(
        ventaDevId,
        {
          motivo: 'Exceso',
          observacion: 'Exceso',
          items: [{ venta_detalle_id: detallesDev[0].id, cantidad: 99 }],
          autorizacion: { usuario: 'admin', password: 'admin123' }
        },
        cajero
      ),
      'No puede devolver más de lo vendido'
    );
    add(14, 'No permite devolver más de lo vendido', r.ok, r.error);
  }

  // 15 impacto stock devolución
  try {
    const stockDespuesParcial = await getProducto(10);
    assert(Number(stockDespuesParcial.stock_actual) === Number((Number(stockAntesDevP1.stock_actual) - 1).toFixed(3)), 'Stock devolución parcial incorrecto');
    add(15, 'Devolución impacta stock correctamente', true);
  } catch (e) {
    add(15, 'Devolución impacta stock correctamente', false, e.message);
  }

  // 16 impacto caja/CxC devolución
  try {
    const cajaRows = await getCajaByConceptoLike(`Devolucion venta #${ventaDevId}`);
    const cxcRows = await getCxcByVenta(ventaDevId);
    assert(cajaRows.some((m) => m.tipo === 'DEVOLUCION'), 'No movió caja por devolución');
    assert(cxcRows.some((m) => m.tipo === 'ABONO' && String(m.referencia || '').includes('DEVOLUCION')), 'No movió CxC por devolución');
    add(16, 'Devolución impacta caja/CxC correctamente', true);
  } catch (e) {
    add(16, 'Devolución impacta caja/CxC correctamente', false, e.message);
  }

  // 17 auditoría con actor/autorizador
  try {
    const eventos = await db('auditoria_eventos').where({ entidad: 'VENTA', entidad_id: String(ventaDevId), accion: 'DEVOLUCION' }).orderBy('id', 'desc');
    const detalle = JSON.parse(eventos[0].detalle);
    assert(detalle.actor?.id && detalle.autorizador?.id, 'No registró actor/autorizador');
    add(17, 'Auditoría de devolución registra actor/autorizador', true);
  } catch (e) {
    add(17, 'Auditoría de devolución registra actor/autorizador', false, e.message);
  }

  // 13 devolución total válida (completar remanente)
  try {
    const freshDetails = await getDetallesVenta(ventaDevId);
    await ventasService.createDevolucion(
      ventaDevId,
      {
        motivo: 'Devolución final',
        observacion: 'Total',
        items: freshDetails.map((d) => ({ venta_detalle_id: d.id, cantidad: Number(d.cantidad) - (d.id === detallesDev[0].id ? 1 : 0) })),
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    const venta = await getVenta(ventaDevId);
    assert(venta.estado === 'DEVUELTA_TOTAL', 'No quedó en DEVUELTA_TOTAL');
    add(13, 'Devolución total válida', true);
  } catch (e) {
    add(13, 'Devolución total válida', false, e.message);
  }

  // caja pruebas diferencia y fórmula
  try {
    await cajaService.movimientoManual({ tipo: 'INGRESO', concepto: 'Ingreso test', monto: 30 }, cajero);
    await cajaService.movimientoManual({ tipo: 'EGRESO', concepto: 'Egreso test', monto: 10 }, cajero);
    const resumen = await cajaService.corteX(cajero);
    const esperadoCalculado = Number(
      Number(resumen.fondo_inicial)
      + Number(resumen.ventas_efectivo)
      + Number(resumen.ingresos_manuales)
      + Number(resumen.otros_ingresos || 0)
      - Number(resumen.egresos_manuales)
      - Number(resumen.compras_efectivo || 0)
      - Number(resumen.devoluciones_efectivo || 0)
      - Number(resumen.anulaciones_efectivo || 0)
      - Number(resumen.otros_egresos || 0)
    ).toFixed(2);
    assert(Number(resumen.efectivo_esperado) === Number(esperadoCalculado), 'Fórmula de efectivo esperado inconsistente');
    add(23, 'Cálculo de efectivo esperado considera movimientos aplicables', true);

    const rNoAuth = await expectThrows(
      () => cajaService.corteZ(
        {
          efectivo_contado: Number(resumen.efectivo_esperado) + 5,
          observacion: 'Diferencia sin auth'
        },
        cajero
      ),
      'autorización ADMIN'
    );
    add(21, 'Cierre con diferencia sin clave admin falla', rNoAuth.ok, rNoAuth.error);

    const closed = await cajaService.corteZ(
      {
        efectivo_contado: Number(resumen.efectivo_esperado) + 5,
        observacion: 'Diferencia autorizada',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    assert(closed.data.turno.estado === 'CERRADO', 'No cerró con diferencia autorizada');
    add(22, 'Cierre con diferencia con clave admin y novedad', true);
  } catch (e) {
    add(23, 'Cálculo de efectivo esperado considera movimientos aplicables', false, e.message);
    if (!results.find((r) => r.id === 21)) add(21, 'Cierre con diferencia sin clave admin falla', false, e.message);
    if (!results.find((r) => r.id === 22)) add(22, 'Cierre con diferencia con clave admin y novedad', false, e.message);
  }

  // abrir turno para compras contado
  await cajaService.abrirTurno({ fondo_inicial: 80, observacion: 'Turno compras' }, cajero.id);

  // 25 compra sin autorización falla
  {
    const r = await expectThrows(
      () => comprasService.createOrden(
        {
          proveedor_id: 1,
          observacion: 'sin auth',
          items: [{ producto_id: 13, cantidad: 2, costo_unit_est: 3 }]
        },
        cajero
      ),
      'autorización ADMIN'
    );
    add(25, 'Registrar compra sin autorización admin falla', r.ok, r.error);
  }

  // 24 compra con autorización válida
  let ordenId;
  try {
    const out = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'OC bloque2',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [
          { producto_id: 13, cantidad: 2, costo_unit_est: 3 },
          { producto_id: 14, cantidad: 1, costo_unit_est: 2.4 }
        ]
      },
      cajero
    );
    ordenId = out.data.orden.id;
    assert(ordenId, 'No creó orden');
    add(24, 'Registro de compra con autorización válida', true);
  } catch (e) {
    add(24, 'Registro de compra con autorización válida', false, e.message);
  }

  // 27 recepción con detalle repetido falla
  {
    const orden = await db('compras_orden_detalle').where({ orden_id: ordenId }).orderBy('id', 'asc');
    const od = orden[0];
    const r = await expectThrows(
      () => comprasService.receiveOrden(
        ordenId,
        {
          factura: { numero_factura: 'B2-DUP-01', metodo_pago: 'CONTADO' },
          items: [
            { orden_detalle_id: od.id, cantidad: 1, costo_unit_real: 3 },
            { orden_detalle_id: od.id, cantidad: 1, costo_unit_real: 3 }
          ]
        },
        cajero
      ),
      'Detalle repetido'
    );
    add(27, 'Recepción con detalle repetido inconsistente falla', r.ok, r.error);
  }

  // 28 recepción excede pendiente falla
  {
    const orden = await db('compras_orden_detalle').where({ orden_id: ordenId }).orderBy('id', 'asc');
    const od = orden[0];
    const r = await expectThrows(
      () => comprasService.receiveOrden(
        ordenId,
        {
          factura: { numero_factura: 'B2-EXC-01', metodo_pago: 'CONTADO' },
          items: [{ orden_detalle_id: od.id, cantidad: Number(od.cantidad) + 10, costo_unit_real: 3 }]
        },
        cajero
      ),
      'excede pendiente'
    );
    add(28, 'Recepción que excede pendiente falla', r.ok, r.error);
  }

  // 26 recepción válida
  let recepcionContado;
  try {
    const ordenDet = await db('compras_orden_detalle').where({ orden_id: ordenId }).orderBy('id', 'asc');
    const pBefore = await getProducto(13);
    recepcionContado = await comprasService.receiveOrden(
      ordenId,
      {
        factura: { numero_factura: 'B2-CONT-01', metodo_pago: 'CONTADO' },
        items: ordenDet.map((d) => ({ orden_detalle_id: d.id, cantidad: Number(d.cantidad), costo_unit_real: Number(d.costo_unit_est || 0) || 1 }))
      },
      cajero
    );
    const pAfter = await getProducto(13);
    assert(Number(pAfter.stock_actual) > Number(pBefore.stock_actual), 'No aumentó stock por recepción');
    add(26, 'Recepción válida dentro del pendiente', true);
    add(29, 'Recepción impacta stock correctamente', true);
  } catch (e) {
    add(26, 'Recepción válida dentro del pendiente', false, e.message);
    add(29, 'Recepción impacta stock correctamente', false, e.message);
  }

  // 30 impacto caja o CxP según pago
  try {
    const cajaRows = await getCajaByConceptoLike(`Compra OC #${ordenId}`);
    assert(cajaRows.some((m) => m.tipo === 'COMPRA'), 'No impactó caja en compra contado');

    const ordenCredito = await comprasService.createOrden(
      {
        proveedor_id: 2,
        observacion: 'OC credito',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 1, cantidad: 1, costo_unit_est: 5 }]
      },
      cajero
    );
    const odCredito = await db('compras_orden_detalle').where({ orden_id: ordenCredito.data.orden.id }).first();
    await comprasService.receiveOrden(
      ordenCredito.data.orden.id,
      {
        factura: { numero_factura: 'B2-CRED-01', metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: odCredito.id, cantidad: 1, costo_unit_real: 5 }]
      },
      cajero
    );
    const factura = await db('compras_facturas').where({ numero_factura: 'B2-CRED-01' }).first();
    const cxp = await db('cxp_movimientos').where({ factura_id: factura.id, tipo: 'CARGO' });
    assert(cxp.length > 0, 'No impactó CxP en compra crédito');
    add(30, 'Recepción impacta caja/CxP según método de pago', true);
  } catch (e) {
    add(30, 'Recepción impacta caja/CxP según método de pago', false, e.message);
  }

  // cierre final de turno para no dejar caja abierta en pruebas
  const turnoAbierto = await cajaService.turnoActual();
  if (turnoAbierto) {
    const resumen = await cajaService.corteX(cajero);
    await cajaService.corteZ({ efectivo_contado: Number(resumen.efectivo_esperado), observacion: 'cierre final test' }, cajero);
  }

  // Reporte
  const report = printSuiteReport('BLOQUE 2 TESTS', results);
  const { sorted, passed, failed } = report;

  if (destroyDb) await db.destroy();
  const summary = { total: sorted.length, passed, failed, results: sorted };
  if (exitOnFinish) process.exit(failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando bloque2-tests:', error);
    await db.destroy();
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
