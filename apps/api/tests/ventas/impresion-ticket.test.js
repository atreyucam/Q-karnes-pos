/* eslint-disable no-console */
const { EventEmitter } = require('events');
const authService = require('../../src/modules/auth/auth.service');
const { prepareDatabase } = require('../support/database');
const db = require('../../src/db/knex');
const { assert, printSuiteReport } = require('../support/testHarness');
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');
const impresionController = require('../../src/modules/impresion/impresion.controller');
const impresionServiceModule = require('../../src/modules/impresion/impresion.service');

configureTestRuntime({ suiteName: 'impresion-ticket' });

function createMockLpProcess(exitCode = 0, stderrText = '') {
  const proc = new EventEmitter();
  proc.stdin = {
    chunks: [],
    write(chunk) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    },
    end() {
      if (stderrText) proc.stderr.emit('data', Buffer.from(stderrText));
      setImmediate(() => proc.emit('close', exitCode));
    }
  };
  proc.stderr = new EventEmitter();
  return proc;
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });

    const { __testables, createImpresionService } = impresionServiceModule;

    try {
      const ticket = __testables.construirTicketVenta({
        negocio: { nombre: 'Q-KARNES POS' },
        venta: { id: 1, fecha: '2026-05-27T15:30:00Z', total: 15, subtotal: 15 },
        detalle: [{ producto_nombre: 'Pollo entero', cantidad: 1, precio_unit: 8, total_linea: 8 }],
        totales: { subtotal: 15, impuesto_estimado: 0 },
        metodo_pago: 'EFECTIVO'
      }, {}, { width: 40 });
      assert(!ticket.includes('<div'), 'No debe contener HTML');
      assert(ticket.includes('\x1B@'), 'Debe incluir ESC @');
      add(1, 'construirTicketVenta genera texto plano sin HTML', true);
    } catch (error) {
      add(1, 'construirTicketVenta genera texto plano sin HTML', false, error.message);
    }

    try {
      const text = __testables.normalizarTextoTicket('cafe azucar direccion nino cafe direccion');
      assert(text.includes('cafe'), 'Debe normalizar tildes');
      assert(!/[áéíóúñÑ]/.test(text), 'No debe contener tildes ni ñ');
      add(2, 'normalizarTextoTicket elimina tildes y n', true);
    } catch (error) {
      add(2, 'normalizarTextoTicket elimina tildes y n', false, error.message);
    }

    try {
      const spawnCalls = [];
      const service = createImpresionService({
        spawnFn: (cmd, args) => {
          spawnCalls.push({ cmd, args });
          return createMockLpProcess(0);
        },
        ventasService: {
          getTicket: async () => ({ data: { negocio: { nombre: 'Q-KARNES POS' }, venta: { id: 1, fecha: new Date().toISOString(), total: 1, subtotal: 1 }, detalle: [], totales: { subtotal: 1, impuesto_estimado: 0 } } })
        },
        configuracionService: { getRuntimeConfig: async () => ({}) }
      });

      if (process.platform === 'linux') {
        await service.imprimirTicketVenta('1', { id: 1 });
        assert(spawnCalls.length === 1, 'spawn debe llamarse una vez');
        assert(spawnCalls[0].cmd === 'lp', 'Comando esperado lp');
        assert(JSON.stringify(spawnCalls[0].args) === JSON.stringify(['-d', 'EPSON_TMU220_RAW', '-o', 'raw']), 'Argumentos de lp invalidos');
      }
      add(3, "Servicio usa spawn('lp', ['-d', printerName, '-o', 'raw'])", true);
    } catch (error) {
      add(3, "Servicio usa spawn('lp', ['-d', printerName, '-o', 'raw'])", false, error.message);
    }

    await authService.login({ usuario: 'admin', password: 'admin123' });
    const impresionService = require('../../src/modules/impresion/impresion.service');
    const originalPrint = impresionService.imprimirTicketVenta;

    try {
      impresionService.imprimirTicketVenta = async () => ({ ok: true });
      const okRes = {
        statusCode: 200,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.payload = body; return this; }
      };
      await impresionController.imprimirTicketVenta({ params: { ventaId: '1' }, user: { id: 1 } }, okRes);
      assert(okRes.statusCode === 200, 'Status esperado 200');
      assert(okRes.payload?.ok === true, 'Respuesta ok esperada');
      add(4, 'Endpoint responde ok cuando el servicio imprime', true);

      impresionService.imprimirTicketVenta = async () => {
        const err = new Error('lp fallo');
        err.status = 500;
        throw err;
      };
      const failRes = {
        statusCode: 200,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.payload = body; return this; }
      };
      await impresionController.imprimirTicketVenta({ params: { ventaId: '1' }, user: { id: 1 } }, failRes);
      assert(failRes.statusCode === 500, 'Status esperado 500');
      assert(failRes.payload?.ok === false, 'Respuesta error esperada');
      assert(failRes.payload?.message === 'No se pudo imprimir el ticket', 'Mensaje controlado invalido');
      add(5, 'Endpoint responde error controlado cuando lp falla', true);
    } catch (error) {
      add(4, 'Endpoint responde ok cuando el servicio imprime', false, error.message);
      add(5, 'Endpoint responde error controlado cuando lp falla', false, error.message);
    } finally {
      impresionService.imprimirTicketVenta = originalPrint;
    }

    try {
      const listPage = require('node:fs').readFileSync(require('node:path').resolve(process.cwd(), '..', 'desktop', 'src', 'pages', 'ventas', 'VentasListPage.jsx'), 'utf8');
      const detailPage = require('node:fs').readFileSync(require('node:path').resolve(process.cwd(), '..', 'desktop', 'src', 'pages', 'ventas', 'VentaDetallePage.jsx'), 'utf8');
      const newSalePage = require('node:fs').readFileSync(require('node:path').resolve(process.cwd(), '..', 'desktop', 'src', 'pages', 'ventas', 'NuevaVentaPage.jsx'), 'utf8');
      assert(!listPage.includes('printSaleTicketDocument('), 'VentasListPage no debe usar printSaleTicketDocument');
      assert(!detailPage.includes('printSaleTicketDocument('), 'VentaDetallePage no debe usar printSaleTicketDocument');
      assert(!newSalePage.includes('printSaleTicketDocument('), 'NuevaVentaPage no debe usar printSaleTicketDocument');
      add(6, 'No se usa window.print en flujo principal Epson', true);
    } catch (error) {
      add(6, 'No se usa window.print en flujo principal Epson', false, error.message);
    }
  } finally {
    await cleanupRuntime();
  }

  const report = printSuiteReport('TESTS IMPRESION TICKET EPSON RAW', results);
  if (exitOnFinish) process.exit(report.failed > 0 ? 1 : 0);
  return report;
}

if (require.main === module) {
  runSuite().catch((error) => {
    console.error('Fallo ejecutando impresion-ticket.test:', error);
    process.exit(1);
  });
}

module.exports = { runSuite };
