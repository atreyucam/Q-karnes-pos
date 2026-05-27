process.env.TZ = process.env.TZ || 'America/Guayaquil';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cors = require('cors');
const express = require('express');
const { port: defaultPort } = require('./config/env');
const db = require('./db/knex');
const { resolveDbFilePath } = require('./config/dbFile');
const { buildCorsOptions, resolveBindHost, ensureUsersReadyForRuntime } = require('./config/runtimeSecurity');
const { ensureSupportDirectories } = require('./config/supportPaths');
const { createLogger } = require('./helpers/logger');
const { applyPendingRestoreIfNeeded } = require('./modules/sistema/sistema.runtime');
const { startBackupAutoScheduler } = require('./modules/sistema/backupAuto.scheduler');
const { notFound, errorHandler } = require('./middlewares/errorHandlers');

const apiLogger = createLogger({ channel: 'api-runtime' });
const nodeEnv = process.env.NODE_ENV || 'development';
const startupRestore = applyPendingRestoreIfNeeded({ nodeEnv });
const supportPaths = ensureSupportDirectories({ nodeEnv });

const authRoutes = require('./modules/auth/auth.routes');
const cajaRoutes = require('./modules/caja/caja.routes');
const ventasRoutes = require('./modules/ventas/ventas.routes');
const inventarioRoutes = require('./modules/inventario/inventario.routes');
const comprasRoutes = require('./modules/compras/compras.routes');
const proveedoresRoutes = require('./modules/proveedores/proveedores.routes');
const clientesRoutes = require('./modules/clientes/clientes.routes');
const reportesRoutes = require('./modules/reportes/reportes.routes');
const auditoriaRoutes = require('./modules/auditoria/auditoria.routes');
const sistemaRoutes = require('./modules/sistema/sistema.routes');
const categoriasRoutes = require('./modules/categorias/categorias.routes');
const productosRoutes = require('./modules/productos/productos.routes');
const cxpRoutes = require('./modules/cxp/cxp.routes');
const configuracionRoutes = require('./modules/configuracion/configuracion.routes');
const transformacionesRoutes = require('./modules/transformaciones/transformaciones.routes');
const impresionRoutes = require('./modules/impresion/impresion.routes');

function isWebLocalEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.WEB_LOCAL || '').trim().toLowerCase());
}

function resolveWebDistDir() {
  const configured = String(process.env.WEB_DIST_DIR || '').trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  return path.resolve(__dirname, '..', '..', 'desktop', 'dist');
}

function mountWebLocalFrontend(app) {
  const webDistDir = resolveWebDistDir();
  const indexFile = path.join(webDistDir, 'index.html');

  if (!fs.existsSync(indexFile)) {
    throw new Error(`WEB_LOCAL activo pero no existe frontend compilado: ${indexFile}`);
  }

  app.use(express.static(webDistDir, {
    index: false,
    fallthrough: true
  }));

  app.get('*', (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/api/')) return next();
    return res.sendFile(indexFile);
  });

  apiLogger.info('web_local_static_enabled', 'Frontend web local habilitado', {
    webDistDir,
    indexFile
  });
}

function createApp(options = {}) {
  const app = express();
  const webLocal = isWebLocalEnabled();
  const requestedPort = options.port !== undefined ? options.port : (process.env.PORT || defaultPort);
  const port = Number(requestedPort);
  const host = options.host || process.env.HOST || '127.0.0.1';

  app.use(cors(buildCorsOptions({ port, host })));
  app.use(express.json());
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = String(requestId);
    res.setHeader('x-request-id', req.requestId);

    const startAt = Date.now();
    res.on('finish', () => {
      if (req.path === '/health') return;
      const shouldLogRequest = (
        nodeEnv !== 'production'
        || String(process.env.LOG_HTTP_REQUESTS || '').trim().toLowerCase() === 'true'
        || res.statusCode >= 400
      );
      if (!shouldLogRequest) return;
      apiLogger.info('http_request', 'Request procesada', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startAt
      });
    });

    next();
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'qkarnes-api' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/caja', cajaRoutes);
  app.use('/api/ventas', ventasRoutes);
  app.use('/api/inventario', inventarioRoutes);
  app.use('/api/compras/ordenes', comprasRoutes);
  app.use('/api/proveedores', proveedoresRoutes);
  app.use('/api/clientes', clientesRoutes);
  app.use('/api/reportes', reportesRoutes);
  app.use('/api/auditoria', auditoriaRoutes);
  app.use('/api/sistema', sistemaRoutes);
  app.use('/api/categorias', categoriasRoutes);
  app.use('/api/productos', productosRoutes);
  app.use('/api/cxp', cxpRoutes);
  app.use('/api/configuracion', configuracionRoutes);
  app.use('/api/transformaciones', transformacionesRoutes);
  app.use('/api/impresion', impresionRoutes);

  if (webLocal) {
    app.use('/api', notFound);
    mountWebLocalFrontend(app);
  } else {
    app.use(notFound);
  }

  app.use(errorHandler);

  return app;
}

async function startServer(options = {}) {
  const requestedPort = options.port !== undefined ? options.port : (process.env.PORT || defaultPort);
  const port = Number(requestedPort);
  const host = resolveBindHost({ requestedHost: options.host || process.env.HOST });
  const app = createApp({ port, host });

  if (!options.skipUserRuntimeCheck) {
    await ensureUsersReadyForRuntime({
      knex: db,
      nodeEnv,
      context: 'API local'
    });
  }

  return new Promise((resolve, reject) => {
    const onListening = () => {
      const dbFile = resolveDbFilePath({ nodeEnv });
      apiLogger.info('api_start', 'API local iniciada', {
        nodeEnv,
        port,
        host,
        webLocal: isWebLocalEnabled(),
        webDistDir: isWebLocalEnabled() ? resolveWebDistDir() : null,
        dbFile,
        logsDir: supportPaths.logsDir,
        backupDir: supportPaths.backupDir,
        supportDir: supportPaths.supportDir,
        startupRestore
      });
      startBackupAutoScheduler();
      resolve(server);
    };

    const server = app.listen(port, host, onListening);

    server.on('error', reject);
  });
}

process.on('uncaughtException', (error) => {
  apiLogger.critical('uncaught_exception', 'Excepción no controlada en API', { error });
});

process.on('unhandledRejection', (reason) => {
  apiLogger.critical('unhandled_rejection', 'Promesa rechazada sin manejo', { reason });
});

if (require.main === module) {
  startServer().catch((error) => {
    apiLogger.critical('api_start_fail', 'No se pudo iniciar API', { error });
    process.exit(1);
  });
}

module.exports = {
  createApp,
  startServer,
  isWebLocalEnabled,
  resolveWebDistDir
};
