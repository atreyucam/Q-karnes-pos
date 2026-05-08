const bcrypt = require('bcryptjs');
const db = require('../src/db/knex');

const categoriasService = require('../src/modules/categorias/categorias.service');
const productosService = require('../src/modules/productos/productos.service');
const clientesService = require('../src/modules/clientes/clientes.service');
const proveedoresService = require('../src/modules/proveedores/proveedores.service');
const cajaService = require('../src/modules/caja/caja.service');
const comprasService = require('../src/modules/compras/compras.service');
const ventasService = require('../src/modules/ventas/ventas.service');
const transformacionesService = require('../src/modules/transformaciones/transformaciones.service');
const cxpService = require('../src/modules/cxp/cxp.service');
const { buildPaymentMethodsRows, buildSystemConfigRow } = require('../src/modules/configuracion/configuracion.defaults');

const USER_ADMIN = { id: 1, usuario: 'admin', rol: { nombre: 'ADMIN' } };
const USER_CAJERO = { id: 2, usuario: 'cajero', rol: { nombre: 'CAJERO' } };

const CLEAN_TABLES = [
  'inventario_conteo_detalle',
  'inventario_conteos',
  'transformacion_mermas',
  'transformacion_resultados',
  'transformacion_insumos',
  'transformaciones',
  'auditoria_eventos',
  'ventas_anulaciones',
  'cxp_movimientos',
  'cxc_movimientos',
  'devolucion_detalle',
  'devoluciones',
  'venta_pagos',
  'venta_detalle',
  'ventas',
  'compras_recepcion_detalle',
  'compras_recepciones',
  'compras_facturas',
  'compras_orden_detalle',
  'compras_ordenes',
  'proveedor_precios_historial',
  'caja_movimientos',
  'caja_turnos',
  'mermas',
  'inventario_valorizacion',
  'inventario_movimientos',
  'productos',
  'categorias',
  'proveedores',
  'clientes'
];

const FECHAS = Array.from({ length: 10 }, (_, idx) => {
  const day = String(idx + 1).padStart(2, '0');
  return `2026-05-${day}`;
});

const TURNO_PLAN = FECHAS.map((fecha, idx) => ({
  fecha,
  apertura: `${fecha} ${String(8 + (idx % 2)).padStart(2, '0')}:${idx % 2 === 0 ? '10' : '35'}:00`,
  cierre: `${fecha} ${String(19 + (idx % 3 === 0 ? 1 : 0)).padStart(2, '0')}:${idx % 2 === 0 ? '10' : '40'}:00`,
  fondo: Number((42 + (idx * 3.7)).toFixed(2))
}));

const CLIENTES_DATA = [
  { nombre: 'Alex Camacho', dias_credito: 15 },
  { nombre: 'Belen Morales', dias_credito: 10 },
  { nombre: 'Daniela Perez', dias_credito: 21 },
  { nombre: 'Carlos Rivas', dias_credito: 0 },
  { nombre: 'Maria Cardenas', dias_credito: 30 },
  { nombre: 'Jorge Salazar', dias_credito: 0 },
  { nombre: 'Andrea Torres', dias_credito: 14 },
  { nombre: 'Luis Montalvo', dias_credito: 20 },
  { nombre: 'Paola Herrera', dias_credito: 0 },
  { nombre: 'Miguel Andrade', dias_credito: 12 }
];

const PROVEEDORES_DATA = [
  { nombre: 'Distribuidora La Sierra', tiene_credito: true, dias_pago: 30 },
  { nombre: 'Carnes El Ganadero', tiene_credito: true, dias_pago: 21 },
  { nombre: 'Avicola San Pedro', tiene_credito: false, dias_pago: 0 },
  { nombre: 'Lacteos Andinos', tiene_credito: true, dias_pago: 20 },
  { nombre: 'Insumos Comerciales Quito', tiene_credito: false, dias_pago: 0 },
  { nombre: 'Proveedor El Porcino', tiene_credito: true, dias_pago: 18 },
  { nombre: 'Frigorifico Central', tiene_credito: true, dias_pago: 25 },
  { nombre: 'Embutidos Don Luis', tiene_credito: false, dias_pago: 0 },
  { nombre: 'Granja Santa Rosa', tiene_credito: true, dias_pago: 15 },
  { nombre: 'Mercado Mayorista Ambato', tiene_credito: false, dias_pago: 0 }
];

const CATEGORIAS = ['Res', 'Cerdo', 'Pollo', 'Insumos', 'Lacteos'];

const PRODUCTOS_PLAN = {
  Res: [
    ['Media res', 'LB', false, true, false],
    ['Lomo fino', 'LB', true, false, false],
    ['Costilla de res', 'LB', true, false, false],
    ['Carne molida de res', 'LB', true, false, false],
    ['Falda', 'LB', true, false, false],
    ['Pulpa negra', 'LB', true, false, false],
    ['Pulpa blanca', 'LB', true, false, false],
    ['Higado de res', 'LB', true, false, false],
    ['Osobuco', 'LB', true, false, false],
    ['Pecho de res', 'LB', true, false, false]
  ],
  Cerdo: [
    ['Pierna de cerdo', 'LB', true, true, false],
    ['Costilla de cerdo', 'LB', true, true, false],
    ['Chuleta de cerdo', 'LB', true, false, false],
    ['Lomo de cerdo', 'LB', true, false, false],
    ['Tocino', 'LB', true, false, false],
    ['Panza de cerdo', 'LB', true, false, false],
    ['Carne molida de cerdo', 'LB', true, false, false],
    ['Espinazo', 'LB', true, false, false],
    ['Manitas de cerdo', 'LB', true, false, false],
    ['Chorizo artesanal', 'LB', true, false, false]
  ],
  Pollo: [
    ['Pollo entero', 'LB', true, true, false],
    ['Pechuga de pollo', 'LB', true, false, false],
    ['Pierna de pollo', 'LB', true, false, false],
    ['Muslo de pollo', 'LB', true, false, false],
    ['Alas de pollo', 'LB', true, false, false],
    ['Menudencia de pollo', 'LB', true, false, false],
    ['Filete de pollo', 'LB', true, false, false],
    ['Mollejas', 'LB', true, false, false],
    ['Higado de pollo', 'LB', true, false, false],
    ['Nuggets de pollo', 'UND', true, false, false]
  ],
  Insumos: [
    ['Fundas plasticas', 'UND', true, false, true],
    ['Bandejas termicas', 'UND', true, false, true],
    ['Platos desechables', 'UND', true, false, true],
    ['Guantes', 'UND', true, false, true],
    ['Servilletas', 'UND', true, false, true],
    ['Sal', 'UND', true, false, true],
    ['Condimento', 'UND', true, false, true],
    ['Carbon', 'UND', true, false, true],
    ['Papel film', 'UND', true, false, true],
    ['Etiquetas', 'UND', true, false, true]
  ],
  Lacteos: [
    ['Leche entera', 'UND', true, false, false],
    ['Leche semidescremada', 'UND', true, false, false],
    ['Queso fresco', 'UND', true, false, false],
    ['Queso mozzarella', 'UND', true, false, false],
    ['Queso maduro', 'UND', true, false, false],
    ['Yogur natural', 'UND', true, false, false],
    ['Mantequilla', 'UND', true, false, false],
    ['Crema de leche', 'UND', true, false, false],
    ['Manjar', 'UND', true, false, false],
    ['Leche condensada', 'UND', true, false, false]
  ]
};

const COMPRA_METODOS = ['CONTADO', 'CREDITO', 'CONTADO', 'CREDITO', 'CONTADO', 'TRANSFERENCIA', 'CREDITO', 'CONTADO', 'CONTADO', 'CREDITO'];
const VENTA_PLAN = [
  [['EFECTIVO'], 2], [['EFECTIVO', 'TRANSFERENCIA'], 5],
  [['CREDITO'], 3], [['EFECTIVO'], 1],
  [['TRANSFERENCIA'], 4], [['EFECTIVO'], 8],
  [['CREDITO'], 6], [['EFECTIVO', 'CREDITO'], 2],
  [['EFECTIVO'], 10], [['TRANSFERENCIA'], 3],
  [['CREDITO'], 4], [['EFECTIVO'], 7],
  [['EFECTIVO', 'TRANSFERENCIA'], 5], [['EFECTIVO'], 2],
  [['TRANSFERENCIA'], 6], [['CREDITO'], 1],
  [['EFECTIVO'], 9], [['EFECTIVO', 'CREDITO'], 4],
  [['TRANSFERENCIA'], 2], [['EFECTIVO'], 6]
];

function dayDateOnly(dayIndex) {
  return FECHAS[dayIndex];
}

function dayDateTime(dayIndex, hour, minute) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${dayDateOnly(dayIndex)} ${hh}:${mm}:00`;
}

function buildCodigo(nombre, categoria, idx) {
  const base = `${categoria.slice(0, 3)}-${idx + 1}-${nombre}`.toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base}-${String(idx + 1).padStart(2, '0')}`;
}

function cents(v) {
  return Math.round(Number(v) * 100) / 100;
}

async function cleanDemoData(knex) {
  await knex.transaction(async (trx) => {
    for (const table of CLEAN_TABLES) {
      await trx(table).del();
    }
    await trx.raw('DELETE FROM sqlite_sequence');
  });
}

async function ensureBaseSecurity(knex) {
  const hasAdminRole = await knex('roles').where({ nombre: 'ADMIN' }).first();
  const hasCajeroRole = await knex('roles').where({ nombre: 'CAJERO' }).first();
  if (!hasAdminRole) await knex('roles').insert({ nombre: 'ADMIN' });
  if (!hasCajeroRole) await knex('roles').insert({ nombre: 'CAJERO' });

  const adminRole = await knex('roles').where({ nombre: 'ADMIN' }).first();
  const cajeroRole = await knex('roles').where({ nombre: 'CAJERO' }).first();
  const configExists = await knex('configuracion_sistema').first();
  if (!configExists) await knex('configuracion_sistema').insert(buildSystemConfigRow());

  const paymentCount = await knex('metodos_pago').count({ c: '*' }).first();
  if (Number(paymentCount?.c || 0) === 0) await knex('metodos_pago').insert(buildPaymentMethodsRows());

  const adminHash = bcrypt.hashSync('admin123', 10);
  const cajeroHash = bcrypt.hashSync('cajero123', 10);
  const admin = await knex('usuarios').where({ usuario: 'admin' }).first();
  if (!admin) {
    await knex('usuarios').insert({
      nombre: 'Administrador General',
      usuario: 'admin',
      password_hash: adminHash,
      rol_id: adminRole.id,
      activo: 1
    });
  } else {
    await knex('usuarios').where({ id: admin.id }).update({ password_hash: adminHash, rol_id: adminRole.id, activo: 1 });
  }

  const cajero = await knex('usuarios').where({ usuario: 'cajero' }).first();
  if (!cajero) {
    await knex('usuarios').insert({
      nombre: 'Cajero',
      usuario: 'cajero',
      password_hash: cajeroHash,
      rol_id: cajeroRole.id,
      activo: 1
    });
  } else {
    await knex('usuarios').where({ id: cajero.id }).update({ password_hash: cajeroHash, rol_id: cajeroRole.id, activo: 1 });
  }
}

async function createMasters() {
  for (const nombre of CATEGORIAS) {
    await categoriasService.create({ nombre, activo: true });
  }

  for (let i = 0; i < CLIENTES_DATA.length; i += 1) {
    await clientesService.create({
      nombre: CLIENTES_DATA[i].nombre,
      cedula: `11000000${String(i + 10).padStart(2, '0')}`,
      telefono: `0991000${String(i + 1).padStart(3, '0')}`,
      direccion: `Sector ${i + 1}, Quito`,
      observacion: 'Cliente demo',
      dias_credito: CLIENTES_DATA[i].dias_credito,
      activo: true
    });
  }

  for (const proveedor of PROVEEDORES_DATA) {
    await proveedoresService.create({
      nombre: proveedor.nombre,
      telefono: '022500000',
      direccion: 'Zona comercial',
      observacion: 'Proveedor demo',
      tiene_credito: proveedor.tiene_credito,
      dias_pago: proveedor.dias_pago,
      activo: true
    });
  }

  const categoriasRows = await db('categorias').select('id', 'nombre');
  const categoriasMap = new Map(categoriasRows.map((c) => [c.nombre, c.id]));
  for (const categoria of CATEGORIAS) {
    const productos = PRODUCTOS_PLAN[categoria];
    for (let i = 0; i < productos.length; i += 1) {
      const [nombre, unidad, esVendible, esTransformable, esInsumo] = productos[i];
      const basePrice = categoria === 'Insumos' ? cents(0.5 + (i * 0.35)) : cents(2.8 + (i * 0.7));
      await productosService.create({
        codigo: buildCodigo(nombre, categoria, i),
        nombre,
        categoria_id: categoriasMap.get(categoria),
        unidad_medida: unidad,
        costo_promedio: 0,
        precio_venta: esVendible ? cents(basePrice + 1.1) : 0,
        precio_referencia: esVendible ? cents(basePrice + 1.1) : 0,
        stock_actual: 0,
        stock_minimo: unidad === 'UND' ? 8 : 12,
        activo: true,
        es_vendible: esVendible,
        es_transformable: esTransformable,
        es_insumo: esInsumo,
        es_merma: false
      });
    }
  }
}

function pickProductRows(productosPorCategoria, categoria, quantity) {
  const source = productosPorCategoria[categoria];
  const rows = [];
  for (let i = 0; i < quantity; i += 1) {
    rows.push(source[i % source.length]);
  }
  return rows;
}

function compraCostoPorCategoria(categoria, idx) {
  if (categoria === 'Res') return cents(4.2 + (idx * 0.35));
  if (categoria === 'Cerdo') return cents(3.4 + (idx * 0.3));
  if (categoria === 'Pollo') return cents(2.3 + (idx * 0.25));
  if (categoria === 'Lacteos') return cents(1.8 + (idx * 0.28));
  return cents(0.4 + (idx * 0.09));
}

function compraCantidad(unidad, idx) {
  if (unidad === 'UND') return 20 + (idx * 4);
  if (unidad === 'KG') return cents(30 + (idx * 3.5));
  return cents(36 + (idx * 2.75));
}

function ventaCantidad(unidad, idx) {
  if (unidad === 'UND') return 1 + (idx % 3);
  if (unidad === 'KG') return cents(0.8 + ((idx % 4) * 0.35));
  return cents(1 + ((idx % 5) * 0.4));
}

function buildPagos(methods, total) {
  const cash = methods.includes('EFECTIVO');
  const transfer = methods.includes('TRANSFERENCIA');
  const credit = methods.includes('CREDITO');
  let contado = 0;
  let transferencia = 0;
  let credito = 0;

  if (methods.length === 1 && cash) contado = total;
  if (methods.length === 1 && transfer) transferencia = total;
  if (methods.length === 1 && credit) credito = total;
  if (methods.length === 2 && cash && transfer) {
    contado = cents(total * 0.55);
    transferencia = cents(total - contado);
  }
  if (methods.length === 2 && cash && credit) {
    contado = cents(total * 0.45);
    credito = cents(total - contado);
  }
  if (methods.length === 2 && transfer && credit) {
    transferencia = cents(total * 0.5);
    credito = cents(total - transferencia);
  }

  return {
    metodo: methods.length > 1 ? 'MIXTO' : (credit ? 'CREDITO' : (transfer ? 'TRANSFERENCIA' : 'CONTADO')),
    contado,
    transferencia,
    credito
  };
}

async function setHistoricalDatesForDay(dayIndex, ctx) {
  const fecha = FECHAS[dayIndex];
  const turn = TURNO_PLAN[dayIndex];
  await db('caja_turnos').where({ id: ctx.turnoId }).update({
    fecha_apertura: turn.apertura,
    fecha_cierre: turn.cierre
  });

  await db('caja_movimientos').where({ turno_id: ctx.turnoId }).update({ fecha: dayDateTime(dayIndex, 12, 0) });
  await db('ventas').whereIn('id', ctx.ventaIds).update({ fecha: dayDateTime(dayIndex, 14, 30) });
  await db('cxc_movimientos').whereIn('venta_id', ctx.ventaIds).update({ fecha: dayDateTime(dayIndex, 14, 31) });
  await db('compras_ordenes').whereIn('id', ctx.ordenIds).update({ fecha: dayDateTime(dayIndex, 9, 30) });
  await db('compras_facturas').whereIn('id', ctx.facturaIds).update({ fecha: dayDateTime(dayIndex, 11, 30) });
  await db('compras_recepciones').whereIn('id', ctx.recepcionIds).update({ fecha: dayDateTime(dayIndex, 11, 35) });
  await db('inventario_movimientos').whereRaw("referencia LIKE 'RECEPCION:%'").andWhere('fecha', 'like', `${fecha}%`).update({ fecha: dayDateTime(dayIndex, 11, 40) });
  await db('inventario_movimientos').whereRaw("referencia LIKE 'VENTA:%'").andWhere('fecha', 'like', `${fecha}%`).update({ fecha: dayDateTime(dayIndex, 14, 35) });
  await db('inventario_movimientos').whereRaw("referencia LIKE 'TRANSFORMACION:%'").andWhere('fecha', 'like', `${fecha}%`).update({ fecha: dayDateTime(dayIndex, 13, 20) });
  await db('inventario_valorizacion').whereRaw("referencia LIKE 'RECEPCION:%'").andWhere('fecha', 'like', `${fecha}%`).update({ fecha: dayDateTime(dayIndex, 11, 41) });
  await db('inventario_valorizacion').whereRaw("referencia LIKE 'VENTA:%'").andWhere('fecha', 'like', `${fecha}%`).update({ fecha: dayDateTime(dayIndex, 14, 36) });
  await db('inventario_valorizacion').whereRaw("referencia LIKE 'TRANSFORMACION:%'").andWhere('fecha', 'like', `${fecha}%`).update({ fecha: dayDateTime(dayIndex, 13, 21) });
  await db('transformaciones').whereIn('id', ctx.transformacionIds).update({
    fecha: dayDateTime(dayIndex, 13, 0),
    fecha_aplicacion: dayDateTime(dayIndex, 13, 15)
  });
}

async function validateFinalState() {
  const totalClientes = Number((await db('clientes').count({ c: '*' }).first()).c || 0);
  const totalProveedores = Number((await db('proveedores').count({ c: '*' }).first()).c || 0);
  const totalCategorias = Number((await db('categorias').count({ c: '*' }).first()).c || 0);
  const totalProductos = Number((await db('productos').count({ c: '*' }).first()).c || 0);
  const totalTurnos = Number((await db('caja_turnos').count({ c: '*' }).first()).c || 0);
  const totalCompras = Number((await db('compras_ordenes').count({ c: '*' }).first()).c || 0);
  const totalTransform = Number((await db('transformaciones').where({ estado: 'APLICADA' }).count({ c: '*' }).first()).c || 0);
  const totalVentas = Number((await db('ventas').count({ c: '*' }).first()).c || 0);

  if (totalClientes !== 10) throw new Error(`Validacion fallida: clientes=${totalClientes}`);
  if (totalProveedores !== 10) throw new Error(`Validacion fallida: proveedores=${totalProveedores}`);
  if (totalCategorias !== 5) throw new Error(`Validacion fallida: categorias=${totalCategorias}`);
  if (totalProductos < 50) throw new Error(`Validacion fallida: productos=${totalProductos}`);
  if (totalTurnos !== 10) throw new Error(`Validacion fallida: turnos=${totalTurnos}`);
  if (totalCompras !== 10) throw new Error(`Validacion fallida: compras=${totalCompras}`);
  if (totalTransform !== 8) throw new Error(`Validacion fallida: transformaciones_aplicadas=${totalTransform}`);
  if (totalVentas < 20) throw new Error(`Validacion fallida: ventas=${totalVentas}`);
}

exports.seed = async function seed(knex) {
  await cleanDemoData(knex);
  await ensureBaseSecurity(knex);
  await createMasters();

  const productos = await db('productos').select('id', 'nombre', 'codigo', 'unidad_medida', 'categoria_id', 'precio_venta', 'stock_actual', 'es_vendible');
  const categorias = await db('categorias').select('id', 'nombre');
  const categoriaById = new Map(categorias.map((c) => [c.id, c.nombre]));
  const productosPorCategoria = { Res: [], Cerdo: [], Pollo: [], Insumos: [], Lacteos: [] };
  const productosVendiblesPorCategoria = { Res: [], Cerdo: [], Pollo: [], Insumos: [], Lacteos: [] };
  for (const p of productos) productosPorCategoria[categoriaById.get(p.categoria_id)].push(p);
  for (const p of productos.filter((row) => Number(row.es_vendible || 0) === 1)) {
    productosVendiblesPorCategoria[categoriaById.get(p.categoria_id)].push(p);
  }

  const proveedores = await db('proveedores').orderBy('id');
  const proveedoresCredito = proveedores.filter((p) => Number(p.tiene_credito || 0) === 1);
  const proveedoresContado = proveedores.filter((p) => Number(p.tiene_credito || 0) === 0);
  const clientes = await db('clientes').orderBy('id');

  const ventasCreditoClienteIds = new Set();
  const comprasCreditoProveedorIds = new Set();
  const ventaIdsAll = [];
  const recepcionFacturaByProveedor = new Map();

  let saleCursor = 0;

  for (let day = 0; day < 10; day += 1) {
    const turnoCtx = { ventaIds: [], ordenIds: [], facturaIds: [], recepcionIds: [], transformacionIds: [] };
    const turno = await cajaService.abrirTurno({ fondo_inicial: TURNO_PLAN[day].fondo, observacion: `Turno demo ${dayDateOnly(day)}` }, USER_CAJERO.id);
    turnoCtx.turnoId = turno.id;

    const metodoCompra = COMPRA_METODOS[day] === 'TRANSFERENCIA' ? 'CONTADO' : COMPRA_METODOS[day];
    const compraCategoria = ['Res', 'Cerdo', 'Pollo', 'Lacteos', 'Insumos', 'Res', 'Res', 'Pollo', 'Insumos', 'Lacteos'][day];
    const proveedor = metodoCompra === 'CREDITO'
      ? proveedoresCredito[day % proveedoresCredito.length]
      : (proveedoresContado[day % Math.max(1, proveedoresContado.length)] || proveedores[day % proveedores.length]);
    const compraProductos = pickProductRows(productosPorCategoria, compraCategoria, 3 + (day % 4));
    const orderRes = await comprasService.createOrden({
      proveedor_id: proveedor.id,
      fecha_emision: dayDateTime(day, 9, 30),
      observacion: `OC demo ${dayDateOnly(day)}`,
      items: compraProductos.map((p, idx) => ({
        producto_id: p.id,
        cantidad: compraCantidad(p.unidad_medida, idx + day)
      }))
    }, USER_ADMIN);
    const ordenId = orderRes.data.orden.id;
    turnoCtx.ordenIds.push(ordenId);

    const ordenData = await comprasService.getOrden(ordenId);
    const recepcion = await comprasService.receiveOrden(ordenId, {
      fecha_recepcion: dayDateTime(day, 11, 30),
      documento_respaldo: `DOC-${day + 1}`,
      observacion: `Recepcion demo ${dayDateOnly(day)}`,
      factura: {
        numero_factura: `F${String(day + 1).padStart(4, '0')}`,
        metodo_pago: metodoCompra
      },
      items: ordenData.data.detalle.map((d, idx) => ({
        orden_detalle_id: d.id,
        cantidad: d.cantidad_pendiente,
        costo_unit_real: compraCostoPorCategoria(compraCategoria, idx + 1)
      }))
    }, USER_ADMIN);

    turnoCtx.recepcionIds.push(recepcion.recepcion_id);
    const factura = await db('compras_facturas').where({ orden_id: ordenId }).first();
    turnoCtx.facturaIds.push(factura.id);
    if (factura.metodo_pago === 'CREDITO') comprasCreditoProveedorIds.add(proveedor.id);
    recepcionFacturaByProveedor.set(proveedor.id, factura.id);

    if (day < 8) {
      const transformDefs = [
        ['Media res', [['Lomo fino', 2], ['Costilla de res', 3], ['Carne molida de res', 2], ['Falda', 2]], 1, 10],
        ['Media res', [['Pulpa negra', 2], ['Pulpa blanca', 2], ['Osobuco', 2], ['Pecho de res', 2]], 1, 9],
        ['Pierna de cerdo', [['Chuleta de cerdo', 2], ['Lomo de cerdo', 2], ['Tocino', 2]], 1, 7],
        ['Costilla de cerdo', [['Costilla de cerdo', 2], ['Espinazo', 2]], 1, 5],
        ['Pollo entero', [['Pechuga de pollo', 2], ['Muslo de pollo', 2], ['Alas de pollo', 2], ['Menudencia de pollo', 1]], 1, 8],
        ['Pollo entero', [['Filete de pollo', 2], ['Mollejas', 1], ['Higado de pollo', 1]], 1, 5],
        ['Media res', [['Pulpa negra', 2], ['Costilla de res', 2], ['Carne molida de res', 2]], 1, 7],
        ['Pierna de cerdo', [['Chorizo artesanal', 2], ['Carne molida de cerdo', 2]], 1, 5]
      ][day];

      const parent = productos.find((p) => p.nombre === transformDefs[0]);
      const resultados = transformDefs[1].map(([nombre, cantidad]) => {
        const pr = productos.find((p) => p.nombre === nombre);
        return { producto_id: pr.id, cantidad };
      });
      const transformCreate = await transformacionesService.createBorrador({
        fecha: dayDateTime(day, 13, 0),
        tipo_proceso: 'DESPIECE',
        referencia_lote: `LOT-${day + 1}`,
        observacion: `Despiece demo ${dayDateOnly(day)}`,
        producto_padre_id: parent.id,
        cantidad_padre_consumida: transformDefs[3],
        hijos: resultados,
        merma: [
          { tipo_merma: 'OPERATIVA', cantidad: transformDefs[2], motivo: 'Merma operativa demo' }
        ]
      }, USER_ADMIN);
      await transformacionesService.aplicarTransformacion(transformCreate.data.id, {}, USER_ADMIN);
      turnoCtx.transformacionIds.push(transformCreate.data.id);
    }

    for (let n = 0; n < 2; n += 1) {
      const plan = VENTA_PLAN[saleCursor];
      saleCursor += 1;
      const [methods, lineCount] = plan;
      const cliente = methods.includes('CREDITO') ? clientes[(day + n) % clientes.length] : (n % 2 === 0 ? null : clientes[(day + n + 2) % clientes.length]);
      const categoriesRotation = ['Res', 'Cerdo', 'Pollo', 'Insumos', 'Lacteos'];
      const stockSnapshotRows = await db('productos').select('id', 'stock_actual');
      const stockById = new Map(stockSnapshotRows.map((r) => [r.id, Number(r.stock_actual || 0)]));
      const items = [];
      for (let i = 0; i < lineCount; i += 1) {
        const cat = categoriesRotation[(day + n + i) % categoriesRotation.length];
        const options = productosVendiblesPorCategoria[cat];
        const fallbackPool = Object.values(productosVendiblesPorCategoria).flat();
        if (!options || options.length === 0) continue;
        const candidate = options[(i + day + n) % options.length];
        const qtyCandidate = ventaCantidad(candidate.unidad_medida, i + day);
        let product = candidate;
        let qty = qtyCandidate;
        if (Number(stockById.get(candidate.id) || 0) < qtyCandidate) {
          const replacement = options.find((p) => Number(stockById.get(p.id) || 0) >= ventaCantidad(p.unidad_medida, i + day))
            || fallbackPool.find((p) => Number(stockById.get(p.id) || 0) >= ventaCantidad(p.unidad_medida, i + day))
            || candidate;
          product = replacement;
          qty = Math.min(ventaCantidad(product.unidad_medida, i + day), Number(stockById.get(product.id) || 0));
        }
        const safeQty = Math.max(cents(qty), product.unidad_medida === 'UND' ? 1 : 0.25);
        if (Number(stockById.get(product.id) || 0) >= safeQty) {
          items.push({ producto_id: product.id, cantidad: safeQty });
          stockById.set(product.id, Number(stockById.get(product.id) || 0) - safeQty);
        }
      }
      if (items.length === 0) continue;

      const previewTotal = items.reduce((acc, it) => {
        const product = productos.find((p) => p.id === it.producto_id);
        return acc + (Number(product.precio_venta || 0) * Number(it.cantidad));
      }, 0);
      const pagos = buildPagos(methods, cents(previewTotal));

      const sale = await ventasService.createVenta({
        cliente_id: cliente ? cliente.id : null,
        items,
        pagos,
        observacion: `Venta demo dia ${day + 1}`,
        referencia: methods.includes('TRANSFERENCIA') ? `TRX-${day + 1}-${n + 1}` : undefined
      }, USER_CAJERO);
      const ventaId = sale.data.venta.id;
      turnoCtx.ventaIds.push(ventaId);
      ventaIdsAll.push(ventaId);
      if (methods.includes('CREDITO') && cliente) ventasCreditoClienteIds.add(cliente.id);
    }

    await cajaService.movimientoManual({
      tipo: 'INGRESO',
      concepto: 'Cambio de efectivo',
      monto: cents(20 + day),
      observacion: 'Ingreso manual demo'
    }, USER_CAJERO);
    await cajaService.movimientoManual({
      tipo: 'EGRESO',
      concepto: day % 2 === 0 ? 'Limpieza' : 'Transporte',
      monto: cents(6 + (day % 3)),
      observacion: 'Egreso manual demo'
    }, USER_CAJERO);

    if (day === 4 || day === 7 || day === 9) {
      const clienteConDeuda = [...ventasCreditoClienteIds][0];
      if (clienteConDeuda) {
        const deuda = await db('cxc_movimientos').where({ cliente_id: clienteConDeuda, tipo: 'CARGO' }).first();
        if (deuda) {
          await clientesService.abono(clienteConDeuda, {
            venta_id: deuda.venta_id,
            monto: cents(Number(deuda.monto) * 0.25),
            metodo_pago: 'EFECTIVO',
            observacion: 'Abono parcial demo'
          }, USER_ADMIN);
        }
      }
    }

    if (day === 5 || day === 8) {
      const proveedorConDeuda = [...comprasCreditoProveedorIds][0];
      const facturaId = recepcionFacturaByProveedor.get(proveedorConDeuda);
      if (proveedorConDeuda && facturaId) {
        const deuda = await db('cxp_movimientos').where({ proveedor_id: proveedorConDeuda, factura_id: facturaId, tipo: 'CARGO' }).first();
        if (deuda) {
          await cxpService.pagarProveedor(proveedorConDeuda, {
            factura_id: facturaId,
            monto: cents(Number(deuda.monto) * 0.2),
            observacion: 'Pago parcial demo'
          }, USER_ADMIN);
        }
      }
    }

    const corte = await cajaService.corteX(USER_CAJERO);
    const efectivoContado = Math.max(0, Math.min(4999, cents(corte.efectivo_esperado + (day % 2 === 0 ? 0.5 : -0.25))));
    await cajaService.corteZ({
      efectivo_contado: efectivoContado,
      observacion: 'Cierre demo con ajuste minimo',
      autorizacion: { usuario: 'admin', password: 'admin123' }
    }, USER_CAJERO);

    await setHistoricalDatesForDay(day, turnoCtx);
  }

  const allVendibles = await db('productos').where({ es_vendible: 1 }).orderBy('id');
  for (let i = 0; i < allVendibles.length; i += 1) {
    const p = allVendibles[i];
    if (i < 3) {
      await db('productos').where({ id: p.id }).update({ stock_actual: 0 });
    } else if (i < 8) {
      await db('productos').where({ id: p.id }).update({ stock_actual: p.stock_minimo > 0 ? cents(Number(p.stock_minimo) * 0.6) : 0.2 });
    }
  }

  await validateFinalState();
};
