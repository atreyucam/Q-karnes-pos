/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const db = require('../src/db/knex');
const authService = require('../src/modules/auth/auth.service');
const ventasService = require('../src/modules/ventas/ventas.service');
const cajaService = require('../src/modules/caja/caja.service');
const comprasService = require('../src/modules/compras/compras.service');
const productosService = require('../src/modules/productos/productos.service');
const { authorizeRoles } = require('../src/middlewares/authorizeRoles');
const { assert, expectThrows, printSuiteReport } = require('./test-harness');

function runRoleGuard(roles, user) {
  const middleware = authorizeRoles(...roles);
  const req = {
    user,
    originalUrl: '/api/test/seguro',
    method: 'GET'
  };
  const result = {
    statusCode: null,
    payload: null,
    nextCalled: false
  };
  const res = {
    status(code) {
      result.statusCode = code;
      return {
        json(payload) {
          result.payload = payload;
          return payload;
        }
      };
    }
  };
  middleware(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

function parseAuditDetail(row) {
  try {
    return JSON.parse(row.detalle || '{}');
  } catch (_) {
    return {};
  }
}

function containsAll(text, fragments) {
  return fragments.every((fragment) => text.includes(fragment));
}

async function closeOpenShiftForSeed(admin, cajero) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;

  const resumen = await cajaService.corteX(cajero);
  const contado = Math.max(0, Number(resumen.efectivo_esperado || 0));
  const requiereAuth = Number(contado) !== Number(resumen.efectivo_esperado || 0);

  await cajaService.corteZ(
    {
      efectivo_contado: contado,
      observacion: requiereAuth
        ? 'Normalización seguridad bloque3 (esperado negativo)'
        : 'Normalización seguridad bloque3',
      ...(requiereAuth ? { autorizacion: { usuario: admin.usuario, password: 'admin123' } } : {})
    },
    cajero
  );
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  // Reinicia estado para pruebas repetibles.
  await db.migrate.latest();
  await db.seed.run();

  // 1. Guard de secreto inseguro en producción.
  try {
    const probe = spawnSync(
      process.execPath,
      ['-e', "require('./src/config/env')"],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: '' },
        encoding: 'utf-8'
      }
    );
    assert(probe.status !== 0, 'No rechazó configuración insegura sin JWT_SECRET en producción');
    add(1, 'Rechaza secreto inseguro/faltante en producción', true);
  } catch (error) {
    add(1, 'Rechaza secreto inseguro/faltante en producción', false, error.message);
  }

  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;

  // 2. Login ADMIN.
  add(2, 'Login válido ADMIN', Boolean(admin?.id), admin?.id ? '' : 'No retornó usuario ADMIN');

  // 3. Login CAJERO.
  add(3, 'Login válido CAJERO', Boolean(cajero?.id), cajero?.id ? '' : 'No retornó usuario CAJERO');

  // 4. Login inválido sin exponer detalles sensibles.
  {
    const r = await expectThrows(
      () => authService.login({ usuario: 'admin', password: 'incorrecta' }),
      'Credenciales inválidas'
    );
    add(4, 'Login inválido falla sin detalle sensible', r.ok, r.error);
  }

  // 5. Caja rechaza rol no permitido.
  try {
    const guard = runRoleGuard(['ADMIN', 'CAJERO'], { id: 99, usuario: 'test', rol: { nombre: 'INVITADO' } });
    assert(guard.statusCode === 403 && !guard.nextCalled, 'No rechazó rol inválido para caja');
    add(5, 'Ruta sensible de caja rechaza rol no permitido', true);
  } catch (error) {
    add(5, 'Ruta sensible de caja rechaza rol no permitido', false, error.message);
  }

  // 6. Reportes respeta permisos.
  try {
    const routeText = fs.readFileSync(path.join(process.cwd(), 'src/modules/reportes/reportes.routes.js'), 'utf-8');
    assert(
      containsAll(routeText, ["router.use(authenticate, authorizeRoles('ADMIN', 'CAJERO'))"]),
      'Reportes no está protegido por roles esperados'
    );
    const allow = runRoleGuard(['ADMIN', 'CAJERO'], admin);
    assert(allow.nextCalled === true, 'ADMIN no pudo pasar guard de reportes');
    add(6, 'Ruta sensible de reportes respeta permisos', true);
  } catch (error) {
    add(6, 'Ruta sensible de reportes respeta permisos', false, error.message);
  }

  // 7. Compras respeta permisos.
  try {
    const routeText = fs.readFileSync(path.join(process.cwd(), 'src/modules/compras/compras.routes.js'), 'utf-8');
    assert(
      containsAll(routeText, ["router.use(authenticate, authorizeRoles('ADMIN', 'CAJERO'))"]),
      'Compras no está protegido por roles esperados'
    );
    const deny = runRoleGuard(['ADMIN', 'CAJERO'], { id: 77, usuario: 'otro', rol: { nombre: 'INVITADO' } });
    assert(deny.statusCode === 403, 'No rechazó rol inválido para compras');
    add(7, 'Ruta sensible de compras respeta permisos', true);
  } catch (error) {
    add(7, 'Ruta sensible de compras respeta permisos', false, error.message);
  }

  // 8. Productos/borrado exige autorización de rol y endpoint presente.
  try {
    const routeText = fs.readFileSync(path.join(process.cwd(), 'src/modules/productos/productos.routes.js'), 'utf-8');
    assert(
      containsAll(routeText, [
        "router.use(authenticate, authorizeRoles('ADMIN', 'CAJERO'))",
        "router.delete('/:id', controller.remove);"
      ]),
      'Ruta de borrado de producto no está configurada correctamente'
    );
    add(8, 'Ruta de productos/borrado exige autorización correcta', true);
  } catch (error) {
    add(8, 'Ruta de productos/borrado exige autorización correcta', false, error.message);
  }

  // Prepara turno operativo limpio.
  await closeOpenShiftForSeed(admin, cajero);
  await cajaService.abrirTurno({ fondo_inicial: 150, observacion: 'Bloque3 seguridad' }, cajero.id);

  // Crea venta base para devoluciones.
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
  const ventaDevDetalles = await db('venta_detalle').where({ venta_id: ventaDevId }).orderBy('id', 'asc');

  // 9. Devolución sin auth admin.
  {
    const r = await expectThrows(
      () => ventasService.createDevolucion(
        ventaDevId,
        {
          motivo: 'Sin autorización',
          observacion: 'debe fallar',
          items: [{ venta_detalle_id: ventaDevDetalles[0].id, cantidad: 1 }]
        },
        cajero
      ),
      'autorización ADMIN'
    );
    add(9, 'Devolución sin clave admin válida falla', r.ok, r.error);
  }

  // 10. Devolución con auth admin.
  try {
    const out = await ventasService.createDevolucion(
      ventaDevId,
      {
        motivo: 'Devolución autorizada',
        observacion: 'ok',
        items: [{ venta_detalle_id: ventaDevDetalles[0].id, cantidad: 1 }],
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    assert(out?.data?.devolucion_id, 'No generó devolución autorizada');
    add(10, 'Devolución con clave admin válida funciona', true);
  } catch (error) {
    add(10, 'Devolución con clave admin válida funciona', false, error.message);
  }

  // Crea venta para anulación.
  const ventaAnular = await ventasService.createVenta(
    {
      cliente_id: null,
      items: [{ producto_id: 19, cantidad: 2, precio_unit: 1.4 }],
      pagos: { contado: 2.8, credito: 0 },
      descuento_total: 0
    },
    cajero
  );
  const ventaAnularId = ventaAnular.data.venta.id;

  // 11. Anulación cajero sin auth admin.
  {
    const r = await expectThrows(
      () => ventasService.anularVenta(ventaAnularId, { motivo: 'Error', novedad: 'sin auth' }, cajero),
      'autorización ADMIN'
    );
    add(11, 'Anulación por CAJERO sin clave admin válida falla', r.ok, r.error);
  }

  // 12. Anulación cajero con auth admin.
  try {
    const out = await ventasService.anularVenta(
      ventaAnularId,
      {
        motivo: 'Error de caja',
        novedad: 'autorizado',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    assert(out?.data?.estado === 'ANULADA', 'No anuló con autorización');
    add(12, 'Anulación por CAJERO con clave admin válida funciona', true);
  } catch (error) {
    add(12, 'Anulación por CAJERO con clave admin válida funciona', false, error.message);
  }

  // 13 y 14. Cierre con diferencia.
  try {
    const resumen = await cajaService.corteX(cajero);
    const r = await expectThrows(
      () => cajaService.corteZ(
        {
          efectivo_contado: Number(resumen.efectivo_esperado) + 3,
          observacion: 'diferencia sin auth'
        },
        cajero
      ),
      'autorización ADMIN'
    );
    add(13, 'Cierre con diferencia sin clave admin válida falla', r.ok, r.error);

    const closed = await cajaService.corteZ(
      {
        efectivo_contado: Number(resumen.efectivo_esperado) + 3,
        observacion: 'diferencia autorizada',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    assert(closed?.data?.turno?.estado === 'CERRADO', 'No cerró con autorización');
    add(14, 'Cierre con diferencia con clave admin válida funciona', true);
  } catch (error) {
    if (!results.find((x) => x.id === 13)) add(13, 'Cierre con diferencia sin clave admin válida falla', false, error.message);
    if (!results.find((x) => x.id === 14)) add(14, 'Cierre con diferencia con clave admin válida funciona', false, error.message);
  }

  // 15. Compra sin auth admin.
  {
    const r = await expectThrows(
      () => comprasService.createOrden(
        {
          proveedor_id: 1,
          observacion: 'sin auth',
          items: [{ producto_id: 13, cantidad: 1, costo_unit_est: 3.1 }]
        },
        cajero
      ),
      'autorización ADMIN'
    );
    add(15, 'Registro de compra sin clave admin válida falla', r.ok, r.error);
  }

  // 16. Compra con auth admin.
  try {
    const out = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'con auth',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 13, cantidad: 1, costo_unit_est: 3.1 }]
      },
      cajero
    );
    assert(out?.data?.orden?.id, 'No creó orden con autorización');
    add(16, 'Registro de compra con clave admin válida funciona', true);
  } catch (error) {
    add(16, 'Registro de compra con clave admin válida funciona', false, error.message);
  }

  // Crea producto para pruebas 17/18.
  const producto = await productosService.create({
    codigo: `B3-${Date.now()}`,
    nombre: 'Producto seguridad bloque3',
    categoria_id: 1,
    unidad_medida: 'UND',
    precio_referencia: 1.1,
    stock_actual: 2,
    stock_minimo: 1,
    activo: true
  });

  // 17. Borrado de producto sin auth admin válida.
  {
    const r = await expectThrows(
      () => productosService.remove(
        producto.id,
        {
          motivo: 'Intento sin clave válida',
          novedad: 'debe fallar',
          autorizacion: { usuario: 'admin', password: 'incorrecta' }
        },
        cajero
      ),
      'Credenciales de administrador inválidas'
    );
    add(17, 'Borrado de producto sin clave admin válida falla', r.ok, r.error);
  }

  // 18. Borrado de producto con auth admin válida (baja lógica).
  try {
    const out = await productosService.remove(
      producto.id,
      {
        motivo: 'Baja por depuración',
        novedad: 'bloque 3',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    assert(out?.data?.activo === 0 || out?.data?.activo === false, 'No aplicó baja lógica');
    add(18, 'Borrado de producto con clave admin válida funciona como baja lógica', true);
  } catch (error) {
    add(18, 'Borrado de producto con clave admin válida funciona como baja lógica', false, error.message);
  }

  // 19. Acción sensible exitosa con actor/autorizador.
  try {
    const row = await db('auditoria_eventos')
      .where({ entidad: 'PRODUCTO', entidad_id: String(producto.id), accion: 'BAJA_LOGICA' })
      .orderBy('id', 'desc')
      .first();
    assert(row, 'No existe auditoría de baja lógica');
    const detail = parseAuditDetail(row);
    assert(detail.actor?.id && detail.autorizador?.id, 'No registró actor/autorizador');
    add(19, 'Acción sensible exitosa registra actor y autorizador', true);
  } catch (error) {
    add(19, 'Acción sensible exitosa registra actor y autorizador', false, error.message);
  }

  // 20. Intento fallido de autorización sensible deja rastro.
  try {
    const rows = await db('auditoria_eventos')
      .where({ accion: 'ADMIN_AUTH_CHECK' })
      .orderBy('id', 'desc')
      .limit(20);
    const denied = rows
      .map(parseAuditDetail)
      .find((d) => d.resultado === 'DENY' && d.accion === 'PRODUCTO_BAJA_AUTH');
    assert(denied, 'No existe rastro auditado de autorización sensible fallida');
    add(20, 'Intento fallido de autorización sensible deja rastro', true);
  } catch (error) {
    add(20, 'Intento fallido de autorización sensible deja rastro', false, error.message);
  }

  // 21. Acción sensible registra fecha/hora, módulo y entidad.
  try {
    const row = await db('auditoria_eventos')
      .where({ entidad: 'PRODUCTO', entidad_id: String(producto.id), accion: 'BAJA_LOGICA' })
      .orderBy('id', 'desc')
      .first();
    const detail = parseAuditDetail(row);
    assert(Boolean(row.fecha), 'No registra fecha/hora');
    assert(Boolean(detail.modulo), 'No registra módulo');
    assert(row.entidad === 'PRODUCTO', 'Entidad incorrecta');
    add(21, 'Acción sensible registra fecha/hora, módulo y entidad', true);
  } catch (error) {
    add(21, 'Acción sensible registra fecha/hora, módulo y entidad', false, error.message);
  }

  // 22. Seed demo no se mezcla con producción accidentalmente.
  try {
    const probe = spawnSync(
      process.execPath,
      [
        '-e',
        "process.env.NODE_ENV='production'; process.env.ALLOW_DEMO_SEED='false'; const s=require('./seeds/001_demo.js').seed; s({}).then(()=>process.exit(0)).catch((e)=>{console.error(e.message);process.exit(1);});"
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env },
        encoding: 'utf-8'
      }
    );
    assert(probe.status !== 0, 'Seed demo no fue bloqueado en producción');
    add(22, 'Seed demo no se mezcla con arranque productivo', true);
  } catch (error) {
    add(22, 'Seed demo no se mezcla con arranque productivo', false, error.message);
  }

  // 23. Electron mantiene baseline seguro.
  try {
    const mainText = fs.readFileSync(path.resolve(process.cwd(), '../desktop/electron/main.cjs'), 'utf-8');
    assert(containsAll(mainText, [
      'contextIsolation: true',
      'nodeIntegration: false',
      'sandbox: true',
      'setWindowOpenHandler'
    ]), 'Configuración de Electron no cumple baseline seguro');
    add(23, 'Electron mantiene baseline de seguridad operacional', true);
  } catch (error) {
    add(23, 'Electron mantiene baseline de seguridad operacional', false, error.message);
  }

  // 24. No persistencia inapropiada de credenciales sensibles.
  try {
    const apiClient = fs.readFileSync(path.resolve(process.cwd(), '../desktop/src/lib/apiClient.js'), 'utf-8');
    assert(!apiClient.includes('localStorage.setItem(TOKEN_KEY'), 'Persistencia de token en localStorage no permitida');
    assert(apiClient.includes('sessionStorage'), 'No usa sessionStorage para sesión de desktop');

    const authAudit = await db('auditoria_eventos')
      .where({ accion: 'ADMIN_AUTH_CHECK' })
      .orderBy('id', 'desc')
      .limit(20);
    const hasCredentialLeak = authAudit.some((row) => {
      const detailText = String(row.detalle || '').toLowerCase();
      return detailText.includes('admin123') || detailText.includes('incorrecta');
    });
    assert(!hasCredentialLeak, 'Se detectó posible persistencia de credenciales en auditoría');
    add(24, 'No se persisten credenciales admin en almacenamiento inapropiado', true);
  } catch (error) {
    add(24, 'No se persisten credenciales admin en almacenamiento inapropiado', false, error.message);
  }

  // 25. Política de riesgos abiertos documentada.
  try {
    const docPath = path.resolve(process.cwd(), '../../bloque-3-seguridad-operacional-local.md');
    assert(fs.existsSync(docPath), 'No existe documento principal del Bloque 3');
    const doc = fs.readFileSync(docPath, 'utf-8');
    assert(doc.includes('## 8. Riesgos abiertos'), 'No se documentó sección de riesgos abiertos');
    add(25, 'Existe política/documentación clara de riesgos abiertos', true);
  } catch (error) {
    add(25, 'Existe política/documentación clara de riesgos abiertos', false, error.message);
  }

  const report = printSuiteReport('BLOQUE 3 TESTS (SEGURIDAD OPERACIONAL)', results);
  const { sorted, passed, failed } = report;

  if (destroyDb) await db.destroy();
  const summary = { total: sorted.length, passed, failed, results: sorted };
  if (exitOnFinish) process.exit(failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando bloque3-security-tests:', error);
    await db.destroy();
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
