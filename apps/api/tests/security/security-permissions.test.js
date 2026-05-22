/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const knexFactory = require('knex');
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'security-permissions' });

const db = require('../../src/db/knex');
const knexConfig = require('../../knexfile');
const authService = require('../../src/modules/auth/auth.service');
const configService = require('../../src/modules/configuracion/configuracion.service');
const demoSeed = require('../../seeds/001_demo');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');
const { createApp, startServer } = require('../../src/server');
const {
  buildCorsOptions,
  ensureUsersReadyForRuntime
} = require('../../src/config/runtimeSecurity');

function tempArtifacts(filePath) {
  return [filePath, `${filePath}-wal`, `${filePath}-shm`];
}

async function createIsolatedDb(label) {
  const filePath = path.resolve(process.cwd(), 'data', 'test-runs', `${label}-${Date.now()}.sqlite`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const isolatedDb = knexFactory({
    ...knexConfig.test,
    connection: { filename: filePath }
  });
  await isolatedDb.migrate.latest({ directory: path.resolve(process.cwd(), 'migrations') });
  return { isolatedDb, filePath };
}

async function destroyIsolatedDb(isolatedDb, filePath) {
  if (isolatedDb) await isolatedDb.destroy();
  for (const artifact of tempArtifacts(filePath)) {
    if (fs.existsSync(artifact)) fs.unlinkSync(artifact);
  }
}

async function loginUsers() {
  const admin = await authService.login({ usuario: 'admin', password: 'admin123' });
  const cajero = await authService.login({ usuario: 'cajero', password: 'cajero123' });
  return {
    adminToken: admin.token,
    cajeroToken: cajero.token
  };
}

async function listenApp(port = 0) {
  const app = createApp({ port, host: '127.0.0.1' });
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function serverUrl(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function apiRequest(server, requestPath, options = {}) {
  const headers = {
    Accept: 'application/json'
  };

  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.origin) headers.Origin = options.origin;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${serverUrl(server)}${requestPath}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const rawBody = await response.text();
  let body = rawBody;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch (_) {
    body = rawBody;
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body
  };
}

function evaluateCors(origin, options) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => {
      if (error) reject(error);
      else resolve(allowed);
    });
  });
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });
  let server = null;

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const { adminToken, cajeroToken } = await loginUsers();
    server = await listenApp();

    {
      const response = await apiRequest(server, '/api/productos', {
        method: 'GET',
        token: cajeroToken
      });
      add(1, 'CAJERO puede consultar catálogo mínimo para venta', response.status === 200 && Array.isArray(response.body), JSON.stringify({ status: response.status, length: Array.isArray(response.body) ? response.body.length : null }));
    }

    {
      const response = await apiRequest(server, '/api/productos', {
        method: 'POST',
        token: cajeroToken,
        body: {
          nombre: 'Producto bloqueado cajero',
          categoria_id: 1,
          unidad_medida: 'UND',
          precio_venta: 5
        }
      });
      add(2, 'CAJERO no puede crear producto', response.status === 403, JSON.stringify(response.body));
    }

    let productoCreadoId = null;
    {
      const response = await apiRequest(server, '/api/productos', {
        method: 'POST',
        token: adminToken,
        body: {
          nombre: 'Producto seguridad admin',
          categoria_id: 1,
          unidad_medida: 'UND',
          precio_venta: 6.5
        }
      });
      productoCreadoId = Number(response.body?.id || 0);
      add(3, 'ADMIN sí puede crear producto', response.status === 200 && productoCreadoId > 0, JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, `/api/productos/${productoCreadoId}`, {
        method: 'PATCH',
        token: cajeroToken,
        body: { precio_venta: 8.75 }
      });
      add(4, 'CAJERO no puede editar precio', response.status === 403, JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, `/api/productos/${productoCreadoId}`, {
        method: 'PATCH',
        token: adminToken,
        body: { precio_venta: 8.75 }
      });
      add(5, 'ADMIN sí puede editar precio', response.status === 200 && Number(response.body?.precio_venta || 0) === 8.75, JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, '/api/compras/ordenes', {
        method: 'POST',
        token: cajeroToken,
        body: {
          proveedor_id: 1,
          observacion: 'Bloqueo cajero compras',
          items: [{ producto_id: 2, cantidad: 1 }]
        }
      });
      add(6, 'CAJERO no puede registrar compra', response.status === 403, JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, '/api/compras/ordenes', {
        method: 'POST',
        token: adminToken,
        body: {
          proveedor_id: 1,
          observacion: 'Compra admin seguridad',
          items: [{ producto_id: 2, cantidad: 1 }]
        }
      });
      add(7, 'ADMIN sí puede registrar compra', response.status === 200 && Boolean(response.body?.data?.orden?.id), JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, '/api/inventario/productos/1/stock-minimo', {
        method: 'PATCH',
        token: cajeroToken,
        body: { stock_minimo: 3 }
      });
      add(8, 'CAJERO no puede ajustar inventario', response.status === 403, JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, '/api/inventario/productos/1/stock-minimo', {
        method: 'PATCH',
        token: adminToken,
        body: { stock_minimo: 3 }
      });
      add(9, 'ADMIN sí puede ajustar inventario', response.status === 200 && Number(response.body?.stock_minimo || 0) === 3, JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, '/api/reportes/resumen-operativo', {
        method: 'GET',
        token: adminToken
      });
      add(10, 'ADMIN sí puede acceder a reportes sensibles', response.status === 200 && response.body?.ok === true, JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, '/api/sistema/backups', {
        method: 'GET',
        token: cajeroToken
      });
      add(11, 'CAJERO no puede acceder a sistema/backups', response.status === 403, JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, '/api/sistema/backups', {
        method: 'GET',
        token: adminToken
      });
      add(12, 'ADMIN sí puede acceder a sistema/backups', response.status === 200 && response.body?.ok === true, JSON.stringify(response.body));
    }

    const configSnapshot = await configService.getConfiguracion();
    {
      const response = await apiRequest(server, '/api/configuracion', {
        method: 'PUT',
        token: cajeroToken,
        body: {
          ...configSnapshot.data,
          negocio_nombre: 'Intento cajero'
        }
      });
      add(13, 'CAJERO no puede cambiar configuración', response.status === 403, JSON.stringify(response.body));
    }

    {
      const response = await apiRequest(server, '/api/configuracion', {
        method: 'PUT',
        token: adminToken,
        body: {
          ...configSnapshot.data,
          negocio_nombre: 'QKarnes POS Seguro'
        }
      });
      add(14, 'ADMIN sí puede cambiar configuración', response.status === 200 && response.body?.ok === true, JSON.stringify(response.body));
    }

    {
      const corsOptions = buildCorsOptions({ port: 3000, host: '127.0.0.1' });
      const [allowLoopback, allowLocalhost, allowElectron, denyLan] = await Promise.all([
        evaluateCors('http://127.0.0.1:3000', corsOptions),
        evaluateCors('http://localhost:3000', corsOptions),
        evaluateCors('null', corsOptions),
        evaluateCors('http://192.168.1.10:3000', corsOptions)
      ]);
      add(
        15,
        'CORS queda restringido a loopback/Electron local',
        allowLoopback === true && allowLocalhost === true && allowElectron === true && denyLan === false,
        JSON.stringify({ allowLoopback, allowLocalhost, allowElectron, denyLan })
      );
    }

    {
      const previousHost = process.env.HOST;
      delete process.env.HOST;
      let bindServer;
      try {
        bindServer = await startServer({ port: 0 });
        const address = bindServer.address();
        add(16, 'La API arranca por defecto en 127.0.0.1', address?.address === '127.0.0.1', JSON.stringify(address));
      } finally {
        if (bindServer) {
          await new Promise((resolve, reject) => bindServer.close((error) => (error ? reject(error) : resolve())));
        }
        if (previousHost === undefined) delete process.env.HOST;
        else process.env.HOST = previousHost;
      }
    }

    {
      const { isolatedDb, filePath } = await createIsolatedDb('seed-prod-block');
      try {
        const result = await expectThrows(
          () => ensureUsersReadyForRuntime({ knex: isolatedDb, nodeEnv: 'production', context: 'test-prod' }),
          'Arranque bloqueado por seguridad'
        );
        add(17, 'Los seeds demo no se ejecutan en producción', result.ok, result.error);
      } finally {
        await destroyIsolatedDb(isolatedDb, filePath);
      }
    }

    {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousAllowDemoSeed = process.env.ALLOW_DEMO_SEED;
      const { isolatedDb, filePath } = await createIsolatedDb('seed-dev-allow');

      try {
        process.env.NODE_ENV = 'development';
        process.env.ALLOW_DEMO_SEED = 'true';
        const seeded = await ensureUsersReadyForRuntime({
          knex: isolatedDb,
          nodeEnv: 'development',
          context: 'test-dev'
        });
        const [{ totalUsuarios }] = await isolatedDb('usuarios').count({ totalUsuarios: '*' });
        add(
          18,
          'El seed demo solo corre en desarrollo/testing explícito',
          seeded.seededDemo === true && Number(totalUsuarios || 0) >= 2,
          JSON.stringify({ seeded, totalUsuarios: Number(totalUsuarios || 0) })
        );
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousAllowDemoSeed === undefined) delete process.env.ALLOW_DEMO_SEED;
        else process.env.ALLOW_DEMO_SEED = previousAllowDemoSeed;
        await destroyIsolatedDb(isolatedDb, filePath);
      }
    }

    {
      const previousNodeEnv = process.env.NODE_ENV;
      const previousAllowDemoSeed = process.env.ALLOW_DEMO_SEED;
      const { isolatedDb, filePath } = await createIsolatedDb('seed-direct-block');

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_DEMO_SEED;
        const result = await expectThrows(
          () => demoSeed.seed(isolatedDb),
          'bloqueado'
        );
        add(19, 'El seed 001_demo rechaza ejecución productiva explícita', result.ok, result.error);
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousAllowDemoSeed === undefined) delete process.env.ALLOW_DEMO_SEED;
        else process.env.ALLOW_DEMO_SEED = previousAllowDemoSeed;
        await destroyIsolatedDb(isolatedDb, filePath);
      }
    }
  } catch (error) {
    add(999, 'Ejecución general de suite de seguridad', false, error.stack || error.message);
  } finally {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }

  const report = printSuiteReport('SEGURIDAD Y PERMISOS', results);

  if (destroyDb) {
    await cleanupRuntime({ db });
  }

  if (exitOnFinish) {
    process.exit(report.failed === 0 ? 0 : 1);
  }

  return report;
}

if (require.main === module) {
  runSuite().catch(async (error) => {
    console.error(error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = { runSuite };
