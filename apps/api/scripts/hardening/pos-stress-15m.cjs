/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const { configureTestRuntime, cleanupRuntime } = require('../../tests/support/runtime');
configureTestRuntime({ suiteName: 'pos-stress-15m' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const reportesService = require('../../src/modules/reportes/reportes.service');
const reportesController = require('../../src/modules/reportes/reportes.controller');
const configService = require('../../src/modules/configuracion/configuracion.service');
const { moneyToCents, centsToMoney } = require('../../src/helpers/unitPolicy');
const { redondearPrecioVentaCentavos } = require('../../src/helpers/salePriceRounding');
const { prepareDatabase } = require('../../tests/support/database');
const { createCategoria, createCliente, createProducto } = require('../../tests/support/factories');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const OUT_DIR = path.join(ROOT, 'apps', 'api', 'tmp', 'hardening');
const PROFILE_NAME = String(process.env.HARDENING_PROFILE_NAME || 'pos-stress-15m').trim();
const REPORT_TITLE = String(process.env.HARDENING_REPORT_TITLE || 'HARDENING REPORT').trim();
const REPORT_JSON = path.join(OUT_DIR, `${PROFILE_NAME}-report.json`);
const SUMMARY_TXT = path.join(OUT_DIR, `${PROFILE_NAME}-summary.txt`);
const OPS_LOG_NDJSON = path.join(OUT_DIR, `${PROFILE_NAME}-ops.ndjson`);

const DURATION_MS = Number(process.env.HARDENING_DURATION_MS || 15 * 60 * 1000);
const TARGET_OPS = Number(process.env.HARDENING_TARGET_OPS || 3000);
const SALES_SHARE = Number(process.env.HARDENING_SALES_SHARE || 0.78);
const VALIDATE_EVERY = Number(process.env.HARDENING_VALIDATE_EVERY || 100);
const LOG_EVERY = Number(process.env.HARDENING_LOG_EVERY || 150);
const WINDOW_EVERY = Number(process.env.HARDENING_WINDOW_EVERY || 300);
const LOG_FLUSH_EVERY = Number(process.env.HARDENING_LOG_FLUSH_EVERY || 100);
const KEEP_RECENT_LOGS = Number(process.env.HARDENING_KEEP_RECENT_LOGS || 250);
const ENABLE_HEAP_SNAPSHOTS = String(process.env.HARDENING_HEAP_SNAPSHOTS || '1') === '1';
const HEAP_SNAPSHOT_MARKS = String(process.env.HARDENING_HEAP_MARKS || '10,50,90')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0 && value < 100)
  .sort((a, b) => a - b);

function nowIso() { return new Date().toISOString(); }
function asMoney(v) { return Number(Number(v || 0).toFixed(2)); }
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
function pickWeighted(items) {
  const total = items.reduce((acc, row) => acc + row.weight, 0);
  let roll = Math.random() * total;
  for (const row of items) {
    roll -= row.weight;
    if (roll <= 0) return row.value;
  }
  return items[items.length - 1].value;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function buildEmptyWindow(atOp) {
  return {
    fromOp: atOp + 1,
    toOp: atOp,
    salesLat: [],
    reportLat: [],
    exportLat: [],
    errors: 0,
    ventas: 0,
    devoluciones: 0,
    anulaciones: 0,
    reportes: 0,
    exportaciones: 0,
    rssStart: process.memoryUsage().rss,
    rssEnd: process.memoryUsage().rss
  };
}

function finalizeWindow(window) {
  return {
    fromOp: window.fromOp,
    toOp: window.toOp,
    errors: window.errors,
    ventas: window.ventas,
    devoluciones: window.devoluciones,
    anulaciones: window.anulaciones,
    reportes: window.reportes,
    exportaciones: window.exportaciones,
    rssStartBytes: window.rssStart,
    rssEndBytes: window.rssEnd,
    rssGrowthBytes: window.rssEnd - window.rssStart,
    ventasP95: percentile(window.salesLat, 95),
    reportesP95: percentile(window.reportLat, 95),
    exportacionesP95: percentile(window.exportLat, 95),
    ventasAvg: window.salesLat.length ? Math.round(window.salesLat.reduce((a, b) => a + b, 0) / window.salesLat.length) : 0,
    reportesAvg: window.reportLat.length ? Math.round(window.reportLat.reduce((a, b) => a + b, 0) / window.reportLat.length) : 0,
    exportacionesAvg: window.exportLat.length ? Math.round(window.exportLat.reduce((a, b) => a + b, 0) / window.exportLat.length) : 0
  };
}

function writeHeapSnapshotIfNeeded(state, progressPct) {
  if (!ENABLE_HEAP_SNAPSHOTS) return;
  const nextMark = HEAP_SNAPSHOT_MARKS.find((mark) => mark <= progressPct && !state.heapSnapshots.some((h) => h.mark === mark));
  if (!nextMark) return;
  const v8 = require('v8');
  const filePath = path.join(OUT_DIR, `${PROFILE_NAME}-heap-${nextMark}pct-${Date.now()}.heapsnapshot`);
      const snapshotPath = v8.writeHeapSnapshot(filePath);
  state.heapSnapshots.push({
    mark: nextMark,
    at: nowIso(),
    progressPct,
    file: snapshotPath
  });
}

function createMockRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; }
  };
}

async function invokeExport(admin, reportKey, format, extraQuery = {}) {
  const req = { params: { reportKey }, query: { format, ...extraQuery }, user: admin };
  const res = createMockRes();
  let raised = null;
  await reportesController.exportReport(req, res, (error) => { raised = error; });
  if (raised) throw raised;
  if (res.statusCode >= 400) throw new Error(`Export ${reportKey}/${format} status=${res.statusCode}`);
  return res;
}

async function ensureOperationalSeed() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;

  const existingUsers = await db('usuarios').select('usuario');
  const userSet = new Set(existingUsers.map((r) => String(r.usuario || '').toLowerCase()));
  const newUsers = [];
  if (!userSet.has('cajero2')) newUsers.push({ nombre: 'Cajero Dos', usuario: 'cajero2', password_hash: bcrypt.hashSync('cajero2123', 10), rol_id: 2, activo: 1 });
  if (!userSet.has('cajero3')) newUsers.push({ nombre: 'Cajero Tres', usuario: 'cajero3', password_hash: bcrypt.hashSync('cajero3123', 10), rol_id: 2, activo: 1 });
  if (newUsers.length > 0) await db('usuarios').insert(newUsers);

  const cfg = await configService.getConfiguracion();
  await configService.updateConfiguracion({ ...cfg.data, redondeo_precios_venta_activo: true, redondeo_incremento_centavos: 5, redondeo_evitar_45: true, exigir_caja_abierta_para_cobros: true }, admin);

  const categoria = await createCategoria(db, { nombre: `Hardening-${Date.now()}` });
  const units = ['LB', 'KG', 'UND'];
  for (let i = 0; i < 80; i += 1) {
    const unit = units[i % units.length];
    const ref = i === 0 ? 2.12 : (i === 1 ? 2.45 : asMoney(2.1 + ((i % 17) * 0.33)));
    const stock = unit === 'UND' ? 300 + (i * 2) : 120 + i;
    const cost = asMoney(Math.max(0.5, ref * 0.62));
    await createProducto(db, { categoria_id: categoria.id, codigo: `HPR-${String(i + 1).padStart(3, '0')}`, nombre: `Producto hardening ${i + 1}`, unidad_medida: unit, stock_actual: stock, costo_promedio: cost, precio_referencia: ref, es_transformable: unit !== 'UND' });
  }

  const count = await db('clientes').count({ c: '*' }).first();
  for (let i = Number(count?.c || 0); i < 30; i += 1) {
    await createCliente(db, { nombre: `Cliente hardening ${i + 1}`, telefono: `09${String(80000000 + i).slice(-8)}`, direccion: `Sector ${i + 1}`, dias_credito: 7 + (i % 14) });
  }

  const cashiers = [
    (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user,
    (await authService.login({ usuario: 'cajero2', password: 'cajero2123' })).user,
    (await authService.login({ usuario: 'cajero3', password: 'cajero3123' })).user
  ];

  const turno = await cajaService.turnoActual();
  if (!turno) await cajaService.abrirTurno({ fondo_inicial: 200, observacion: 'Turno hardening principal' }, cashiers[0].id);

  const products = await db('productos').where({ activo: 1, es_vendible: 1 }).orderBy('id');
  const clients = await db('clientes').where({ activo: 1 }).orderBy('id');
  return { admin, cashiers, products, clients };
}

function randomSaleItems(products) {
  const qtyPool = [0.5, 1.25, 2.75, 1, 2, 3];
  const qtyUndPool = [1, 2, 3, 4];
  const lines = Math.random() < 0.65 ? 1 : (Math.random() < 0.88 ? 2 : 3);
  const picked = [];
  const used = new Set();
  for (let i = 0; i < lines; i += 1) {
    let product = products[Math.floor(Math.random() * products.length)];
    let guard = 0;
    while (used.has(product.id) && guard < 8) { product = products[Math.floor(Math.random() * products.length)]; guard += 1; }
    used.add(product.id);
    const unit = String(product.unidad_medida || product.unidad || 'UND').toUpperCase();
    const qty = unit === 'UND'
      ? qtyUndPool[Math.floor(Math.random() * qtyUndPool.length)]
      : qtyPool[Math.floor(Math.random() * qtyPool.length)];
    picked.push({ producto_id: product.id, cantidad: qty });
  }
  return picked;
}

function calcTotals(items, productsById, runtimeConfig) {
  return asMoney(items.reduce((acc, row) => {
    const p = productsById.get(row.producto_id);
    const basePriceCent = moneyToCents(Number(p.precio_venta ?? p.precio_referencia ?? 0), 'precio_venta');
    const finalPriceCent = redondearPrecioVentaCentavos(basePriceCent, runtimeConfig);
    const lineCent = moneyToCents(Number(row.cantidad || 0) * centsToMoney(finalPriceCent), 'linea_total');
    return acc + centsToMoney(lineCent);
  }, 0));
}

function paymentBreakdown(total) {
  const method = pickWeighted([{ value: 'CONTADO', weight: 65 }, { value: 'TRANSFERENCIA', weight: 20 }, { value: 'CREDITO', weight: 10 }, { value: 'MIXTO', weight: 5 }]);
  const totalCent = Math.round(Number(total || 0) * 100);
  const toMoney = (c) => Number((c / 100).toFixed(2));
  if (method === 'CONTADO') return { metodo: method, contado: total, transferencia: 0, credito: 0 };
  if (method === 'TRANSFERENCIA') return { metodo: method, contado: 0, transferencia: total, credito: 0 };
  if (method === 'CREDITO') return { metodo: method, contado: 0, transferencia: 0, credito: total };
  const contadoCent = Math.round(totalCent * 0.55);
  const transferenciaCent = Math.round(totalCent * 0.25);
  const creditoCent = totalCent - contadoCent - transferenciaCent;
  return { metodo: 'MIXTO', contado: toMoney(contadoCent), transferencia: toMoney(transferenciaCent), credito: toMoney(creditoCent) };
}

async function runValidationCheckpoint(state, label) {
  const fkRows = await db.raw('PRAGMA foreign_key_check;');
  const stockNegativeRow = await db('productos').where('stock_actual_base', '<', 0).count({ c: '*' }).first();
  const ventasSum = await db('ventas').whereNot({ estado: 'ANULADA' }).sum({ s: 'total_centavos' }).first();
  const pagosSum = await db('venta_pagos').join('ventas', 'ventas.id', 'venta_pagos.venta_id').whereNot('ventas.estado', 'ANULADA').sum({ s: 'venta_pagos.monto_centavos' }).first();
  const ventasCent = Number(ventasSum?.s || 0);
  const pagosCent = Number(pagosSum?.s || 0);
  const stockNegatives = Number(stockNegativeRow?.c || 0);
  if (ventasCent !== pagosCent) state.warnings.push(`Descuadre ventas/pagos en ${label}: ${ventasCent} vs ${pagosCent}`);
  if (stockNegatives > 0) state.warnings.push(`Stock negativo detectado (${stockNegatives}) en ${label}`);
  if (Array.isArray(fkRows) && fkRows.length > 0) throw new Error(`Corrupción crítica FK detectada en ${label}`);
  state.validationHistory.push({ at: nowIso(), label, ventasCent, pagosCent, stockNegatives, fkViolations: Array.isArray(fkRows) ? fkRows.length : -1 });
}

async function run() {
  const startedAt = Date.now();
  const state = {
    ops: 0, sales: 0, devoluciones: 0, anulaciones: 0, reportes: 0, exportaciones: 0, errores: 0,
    warnings: [], criticalErrors: [], logs: [], logBuffer: [],
    latSales: [], latReports: [], latExports: [], createdSales: [], validationHistory: [],
    windowSummaries: [], currentWindow: buildEmptyWindow(0), heapSnapshots: [],
    lastDevolucionSalesMark: 0, lastAnulacionSalesMark: 0
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(OPS_LOG_NDJSON)) fs.unlinkSync(OPS_LOG_NDJSON);

  try {
    const ctx = await ensureOperationalSeed();
    const productsById = new Map(ctx.products.map((p) => [Number(p.id), p]));
    const runtimeConfig = await configService.getRuntimeConfig();
    const targetIntervalMs = Math.max(1, Math.floor(DURATION_MS / TARGET_OPS));
    const memStart = process.memoryUsage().rss;
    const dbStartSize = fs.existsSync(process.env.DB_FILE) ? fs.statSync(process.env.DB_FILE).size : 0;

    await runValidationCheckpoint(state, 'inicio');

    while ((Date.now() - startedAt) < DURATION_MS && state.ops < TARGET_OPS) {
      const opStarted = Date.now();
      const opType = (() => {
        if (state.ops > 0 && state.ops % 60 === 0) return 'EXPORT';
        if (state.ops > 0 && state.ops % 25 === 0) return 'REPORTE';
        if (state.sales > 0 && state.sales % 40 === 0 && state.lastAnulacionSalesMark !== state.sales) return 'ANULACION';
        if (state.sales > 0 && state.sales % 20 === 0 && state.lastDevolucionSalesMark !== state.sales) return 'DEVOLUCION';
        return Math.random() < SALES_SHARE ? 'VENTA' : 'REPORTE';
      })();

      const actor = ctx.cashiers[0];
      let result = 'OK';
      let errMsg = null;

      try {
        if (opType === 'VENTA') {
          const items = randomSaleItems(ctx.products);
          const total = calcTotals(items, productsById, runtimeConfig);
          const pagos = paymentBreakdown(total);
          const venta = await ventasService.createVenta({ cliente_id: pagos.credito > 0 ? ctx.clients[state.ops % ctx.clients.length].id : null, items, pagos, descuento_total: 0, observacion: `Stress op ${state.ops + 1}` }, actor);
          state.sales += 1;
          const rows = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).select('id');
          state.createdSales.push({ id: venta.data.venta.id, actor, detailIds: rows.map((r) => r.id) });
          state.latSales.push(Date.now() - opStarted);
        } else if (opType === 'DEVOLUCION') {
          const candidate = state.createdSales.find((s) => s && s.detailIds.length > 0);
          if (candidate) {
            const detail = await db('venta_detalle')
              .join('productos', 'productos.id', 'venta_detalle.producto_id')
              .where('venta_detalle.id', candidate.detailIds[0])
              .select('venta_detalle.id', 'venta_detalle.cantidad', 'productos.unidad_medida', 'productos.unidad')
              .first();
            if (detail) {
              const unit = String(detail.unidad_medida || detail.unidad || 'UND').toUpperCase();
              const rawQty = Math.min(Number(detail.cantidad || 0), 0.5);
              const qty = unit === 'UND' ? 1 : rawQty;
              await ventasService.createDevolucion(candidate.id, { motivo: 'Devolucion stress', items: [{ venta_detalle_id: detail.id, cantidad: qty }] }, candidate.actor);
              state.devoluciones += 1;
              state.lastDevolucionSalesMark = state.sales;
              candidate.detailIds = [];
            }
          }
        } else if (opType === 'ANULACION') {
          const candidate = state.createdSales.find((s) => s && s.detailIds.length > 0);
          if (candidate) {
            await ventasService.anularVenta(candidate.id, { motivo: 'Anulacion stress', novedad: 'Operacion reversada por hardening', autorizacion: { usuario: 'admin', password: 'admin123' } }, ctx.admin);
            state.anulaciones += 1;
            state.lastAnulacionSalesMark = state.sales;
            candidate.detailIds = [];
          }
        } else if (opType === 'REPORTE') {
          await reportesService.ventasPeriodo({ fecha_inicio: '2000-01-01', fecha_fin: '2100-01-01' });
          await reportesService.cajaDiaria({ fecha: new Date().toISOString().slice(0, 10) });
          await reportesService.redondeoComercial({ fecha_inicio: '2000-01-01', fecha_fin: '2100-01-01' });
          state.reportes += 1;
          state.latReports.push(Date.now() - opStarted);
        } else {
          await invokeExport(ctx.admin, 'ventas_periodo', 'csv', { fecha_inicio: '2000-01-01', fecha_fin: '2100-01-01' });
          await invokeExport(ctx.admin, 'redondeo_comercial', 'pdf', { vista: 'resumen', fecha_inicio: '2000-01-01', fecha_fin: '2100-01-01' });
          state.exportaciones += 1;
          state.latExports.push(Date.now() - opStarted);
        }
      } catch (error) {
        state.errores += 1;
        result = 'ERROR';
        errMsg = String(error.message || error);
        state.warnings.push(`[${opType}] ${errMsg}`);
      }

      state.ops += 1;
      const mem = process.memoryUsage();
      const opDuration = Date.now() - opStarted;
      const logRow = { timestamp: nowIso(), op: state.ops, tipoOperacion: opType, duracionMs: opDuration, resultado: result, memoriaRssBytes: mem.rss, error: errMsg };
      state.logBuffer.push(logRow);
      state.logs.push(logRow);
      if (state.logs.length > KEEP_RECENT_LOGS) state.logs.shift();
      if (state.logBuffer.length >= LOG_FLUSH_EVERY) {
        fs.appendFileSync(OPS_LOG_NDJSON, `${state.logBuffer.map((row) => JSON.stringify(row)).join('\n')}\n`);
        state.logBuffer = [];
      }

      state.currentWindow.toOp = state.ops;
      state.currentWindow.rssEnd = mem.rss;
      if (result !== 'OK') state.currentWindow.errors += 1;
      if (opType === 'VENTA') {
        state.currentWindow.ventas += 1;
        state.currentWindow.salesLat.push(opDuration);
      } else if (opType === 'DEVOLUCION') {
        state.currentWindow.devoluciones += 1;
      } else if (opType === 'ANULACION') {
        state.currentWindow.anulaciones += 1;
      } else if (opType === 'REPORTE') {
        state.currentWindow.reportes += 1;
        state.currentWindow.reportLat.push(opDuration);
      } else if (opType === 'EXPORT') {
        state.currentWindow.exportaciones += 1;
        state.currentWindow.exportLat.push(opDuration);
      }

      if (state.ops % VALIDATE_EVERY === 0) await runValidationCheckpoint(state, `op-${state.ops}`);
      if (state.ops % LOG_EVERY === 0) {
        const dbSize = fs.existsSync(process.env.DB_FILE) ? fs.statSync(process.env.DB_FILE).size : 0;
        console.log(`[HARDENING] ops=${state.ops} err=${state.errores} rssMB=${(mem.rss / 1024 / 1024).toFixed(1)} dbMB=${(dbSize / 1024 / 1024).toFixed(1)} p95VentaMs=${percentile(state.latSales, 95)}`);
      }
      if (state.ops % WINDOW_EVERY === 0) {
        state.windowSummaries.push(finalizeWindow(state.currentWindow));
        state.currentWindow = buildEmptyWindow(state.ops);
      }
      const progressByOps = (state.ops / TARGET_OPS) * 100;
      const progressByTime = ((Date.now() - startedAt) / DURATION_MS) * 100;
      writeHeapSnapshotIfNeeded(state, Math.max(progressByOps, progressByTime));

      const elapsed = Date.now() - opStarted;
      if (elapsed < targetIntervalMs) await sleep(targetIntervalMs - elapsed);
    }

    if (state.logBuffer.length > 0) {
      fs.appendFileSync(OPS_LOG_NDJSON, `${state.logBuffer.map((row) => JSON.stringify(row)).join('\n')}\n`);
      state.logBuffer = [];
    }
    if (state.currentWindow.toOp >= state.currentWindow.fromOp) {
      state.windowSummaries.push(finalizeWindow(state.currentWindow));
    }

    const integrityRows = await db.raw('PRAGMA integrity_check;');
    const fkRows = await db.raw('PRAGMA foreign_key_check;');
    const integrityOk = Array.isArray(integrityRows) && String(integrityRows[0]?.integrity_check || '').toLowerCase() === 'ok';
    const fkEmpty = Array.isArray(fkRows) && fkRows.length === 0;

    const ventasValidas = await db('ventas').whereNot({ estado: 'ANULADA' }).sum({ s: 'total_centavos' }).first();
    const pagosValidos = await db('venta_pagos').join('ventas', 'ventas.id', 'venta_pagos.venta_id').whereNot('ventas.estado', 'ANULADA').sum({ s: 'venta_pagos.monto_centavos' }).first();
    const stockNegRow = await db('productos').where('stock_actual_base', '<', 0).count({ c: '*' }).first();
    const kardexCount = await db('inventario_movimientos').count({ c: '*' }).first();

    const memEnd = process.memoryUsage().rss;
    const dbEndSize = fs.existsSync(process.env.DB_FILE) ? fs.statSync(process.env.DB_FILE).size : 0;
    const durationMs = Date.now() - startedAt;

    const financialMatch = Number(ventasValidas?.s || 0) === Number(pagosValidos?.s || 0);
    const status = integrityOk && fkEmpty && financialMatch && Number(stockNegRow?.c || 0) === 0 && state.criticalErrors.length === 0 ? 'PASS' : 'FAIL';

    const report = {
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs,
      config: { durationMsTarget: DURATION_MS, targetOps: TARGET_OPS, targetOpsPerSec: Number((TARGET_OPS / (DURATION_MS / 1000)).toFixed(2)), validateEvery: VALIDATE_EVERY },
      execution: { operaciones: state.ops, ventas: state.sales, devoluciones: state.devoluciones, anulaciones: state.anulaciones, reportes: state.reportes, exportaciones: state.exportaciones, errores: state.errores, warnings: state.warnings.slice(0, 500) },
      latencias: {
        ventas: { p50: percentile(state.latSales, 50), p95: percentile(state.latSales, 95), avg: state.latSales.length ? Math.round(state.latSales.reduce((a, b) => a + b, 0) / state.latSales.length) : 0 },
        reportes: { p50: percentile(state.latReports, 50), p95: percentile(state.latReports, 95), avg: state.latReports.length ? Math.round(state.latReports.reduce((a, b) => a + b, 0) / state.latReports.length) : 0 },
        exportaciones: { p50: percentile(state.latExports, 50), p95: percentile(state.latExports, 95), avg: state.latExports.length ? Math.round(state.latExports.reduce((a, b) => a + b, 0) / state.latExports.length) : 0 }
      },
      memoria: { rssInicialBytes: memStart, rssFinalBytes: memEnd, crecimientoBytes: memEnd - memStart },
      sqlite: { dbFile: process.env.DB_FILE, sizeInicialBytes: dbStartSize, sizeFinalBytes: dbEndSize, integrityCheck: integrityRows, foreignKeyCheck: fkRows },
      validacionesFinales: { ventasCentavos: Number(ventasValidas?.s || 0), pagosCentavos: Number(pagosValidos?.s || 0), financialMatch, stockNegativos: Number(stockNegRow?.c || 0), kardexRegistros: Number(kardexCount?.c || 0) },
      diagnosticoMemoria: {
        heapSnapshots: state.heapSnapshots,
        windowSummaries: state.windowSummaries
      },
      validationHistory: state.validationHistory,
      status,
      logsRecent: state.logs,
      logsFile: OPS_LOG_NDJSON
    };

    fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

    const summary = [
      `=== ${REPORT_TITLE} ===`,
      `Duración total: ${durationMs} ms`,
      `Operaciones totales: ${state.ops}`,
      `Ventas: ${state.sales}`,
      `Devoluciones: ${state.devoluciones}`,
      `Anulaciones: ${state.anulaciones}`,
      `Reportes: ${state.reportes}`,
      `Exportaciones: ${state.exportaciones}`,
      `Errores críticos: ${state.criticalErrors.length}`,
      `Warnings: ${state.warnings.length}`,
      `Memoria inicial/final (MB): ${(memStart / 1024 / 1024).toFixed(2)} / ${(memEnd / 1024 / 1024).toFixed(2)}`,
      `DB inicial/final (MB): ${(dbStartSize / 1024 / 1024).toFixed(2)} / ${(dbEndSize / 1024 / 1024).toFixed(2)}`,
      `p50/p95 ventas (ms): ${percentile(state.latSales, 50)} / ${percentile(state.latSales, 95)}`,
      `p50/p95 reportes (ms): ${percentile(state.latReports, 50)} / ${percentile(state.latReports, 95)}`,
      `p50/p95 exportaciones (ms): ${percentile(state.latExports, 50)} / ${percentile(state.latExports, 95)}`,
      `Snapshots heap: ${state.heapSnapshots.length}`,
      `Logs NDJSON: ${OPS_LOG_NDJSON}`,
      `Integrity check: ${integrityOk ? 'ok' : 'fail'}`,
      `Foreign key check: ${fkEmpty ? 'empty' : `${fkRows.length} violation(s)`}`,
      `Resultado financiero final: ${financialMatch ? 'CONSISTENTE' : 'INCONSISTENTE'}`,
      `STATUS: ${status}`
    ].join('\n');

    fs.writeFileSync(SUMMARY_TXT, `${summary}\n`);
    console.log(summary);
    return status === 'PASS' ? 0 : 1;
  } catch (error) {
    console.error('Hardening stress fatal:', error);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(SUMMARY_TXT, `STATUS: FAIL\nERROR: ${String(error.message || error)}\n`);
    return 1;
  } finally {
    await cleanupRuntime({ db });
  }
}

if (require.main === module) {
  run().then((code) => process.exit(code));
}

module.exports = { run };
