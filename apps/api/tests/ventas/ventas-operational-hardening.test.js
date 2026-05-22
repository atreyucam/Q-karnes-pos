/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'ventas-operational-hardening' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const configService = require('../../src/modules/configuracion/configuracion.service');
const { prepareDatabase } = require('../support/database');
const { createCategoria, createProducto, createCliente } = require('../support/factories');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

function asMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

async function loginUsers() {
  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  return { admin, cajero };
}

async function prepareScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  const users = await loginUsers();
  const categoria = await createCategoria(db, { nombre: `Ventas operativas ${Date.now()}` });
  const cliente = await createCliente(db, { nombre: 'Cliente operacion ventas' });
  const producto = await createProducto(db, {
    categoria_id: categoria.id,
    codigo: `VOP-${Date.now()}`,
    nombre: 'Producto endurecimiento ventas',
    unidad_medida: 'UND',
    stock_actual: 40,
    costo_promedio: 3,
    precio_referencia: 5
  });

  return {
    ...users,
    cliente,
    producto
  };
}

async function openTurno(user, observacion = 'Turno ventas operativas', fondo = 100) {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: fondo, observacion }, user.id);
}

async function closeTurnoIfAny(user, overrides = {}) {
  const turno = await cajaService.turnoActual();
  if (!turno) return null;
  const resumen = await cajaService.corteX(user);
  return cajaService.corteZ(
    {
      efectivo_contado: overrides.efectivo_contado ?? Number(resumen.efectivo_esperado),
      observacion: overrides.observacion || 'Cierre suite ventas operativas',
      motivo_admin: overrides.motivo_admin,
      autorizacion: overrides.autorizacion
    },
    overrides.actor || user
  );
}

async function createSale({ actor, productoId, clienteId = null, contado = 0, transferencia = 0, credito = 0, cantidad = null }) {
  const total = asMoney(contado + transferencia + credito);
  return ventasService.createVenta(
    {
      cliente_id: clienteId,
      items: [{ producto_id: productoId, cantidad: cantidad ?? total }],
      pagos: {
        metodo: credito > 0 && (contado > 0 || transferencia > 0)
          ? 'MIXTO'
          : credito > 0
            ? 'CREDITO'
            : transferencia > 0 && contado === 0
              ? 'TRANSFERENCIA'
              : transferencia > 0
                ? 'MIXTO'
                : 'CONTADO',
        contado,
        transferencia,
        credito
      },
      descuento_total: 0
    },
    actor
  );
}

async function getNetCxCByVenta(ventaId) {
  const row = await db('cxc_movimientos')
    .where({ venta_id: ventaId })
    .select(
      db.raw("COALESCE(SUM(CASE WHEN tipo='CARGO' THEN monto ELSE 0 END), 0) as cargos"),
      db.raw("COALESCE(SUM(CASE WHEN tipo='ABONO' THEN monto ELSE 0 END), 0) as abonos")
    )
    .first();
  return asMoney(Number(row?.cargos || 0) - Number(row?.abonos || 0));
}

async function getLastAudit(entidad, entidadId, accion) {
  const row = await db('auditoria_eventos')
    .where({ entidad, entidad_id: String(entidadId), accion })
    .orderBy('id', 'desc')
    .first();
  return row ? { ...row, detalle: parseJson(row.detalle) } : null;
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    {
      const { cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 1');
      const venta = await createSale({ actor: cajero, productoId: producto.id, contado: 10, cantidad: 2 });
      const cashMovement = await db('caja_movimientos').where({ tipo: 'VENTA_CONTADO', origen_id: venta.data.venta.id }).first();
      add(1, 'CAJERO crea y cobra venta normal', venta.data.venta.estado === 'EMITIDA' && Number(cashMovement?.monto_centavos || 0) === 1000, JSON.stringify({ venta: venta.data.venta.id, cashMovement: cashMovement?.id || null }));
    }

    {
      const { cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 2');
      const venta = await createSale({ actor: cajero, productoId: producto.id, contado: 5, cantidad: 1 });
      const result = await expectThrows(
        () => ventasService.editarVenta(venta.data.venta.id, { observacion: 'editar' }, cajero),
        'no se editan directamente'
      );
      add(2, 'CAJERO no puede editar venta cobrada', result.ok, result.error);
    }

    {
      const { cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 3');
      const venta = await createSale({ actor: cajero, productoId: producto.id, contado: 5, cantidad: 1 });
      const result = await expectThrows(
        () => ventasService.anularVenta(venta.data.venta.id, { motivo: 'Error', novedad: 'Sin permiso' }, cajero),
        'autorización ADMIN'
      );
      const denyAudit = await getLastAudit('VENTA', venta.data.venta.id, 'ADMIN_AUTH_CHECK');
      add(3, 'CAJERO no puede anular venta cobrada sin permiso', result.ok && Boolean(denyAudit), JSON.stringify({ error: result.error, audit: denyAudit?.id || null }));
    }

    {
      const { admin, cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 4');
      const stockBefore = await db('productos').where({ id: producto.id }).first();
      const venta = await createSale({ actor: cajero, productoId: producto.id, contado: 5, cantidad: 1 });
      const anulacion = await ventasService.anularVenta(venta.data.venta.id, { motivo: 'Error de digitacion', novedad: 'Cliente desistio' }, admin);
      const stockAfter = await db('productos').where({ id: producto.id }).first();
      const cashReverse = await db('caja_movimientos').where({ tipo: 'ANULACION_VENTA_EFECTIVO', origen_id: venta.data.venta.id }).first();
      add(4, 'ADMIN sí puede anular venta con motivo', anulacion.data.venta_estado === 'ANULADA', JSON.stringify(anulacion.data));
      add(5, 'Venta anulada restaura inventario', Number(stockAfter.stock_actual_base) === Number(stockBefore.stock_actual_base), JSON.stringify({ before: stockBefore.stock_actual_base, after: stockAfter.stock_actual_base }));
      add(6, 'Venta anulada revierte caja correctamente', Number(cashReverse?.monto_centavos || 0) === 500, JSON.stringify(cashReverse || {}));
    }

    {
      const { admin, cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 7');
      const venta = await createSale({ actor: cajero, productoId: producto.id, transferencia: 5, cantidad: 1 });
      const resumenAntes = await cajaService.corteX(cajero);
      await ventasService.anularVenta(venta.data.venta.id, { motivo: 'Transferencia errada', novedad: 'Cliente canceló' }, admin);
      const resumenDespues = await cajaService.corteX(cajero);
      const reverseCash = await db('caja_movimientos').where({ tipo: 'ANULACION_VENTA_EFECTIVO', origen_id: venta.data.venta.id }).first();
      add(7, 'Venta por transferencia anulada no afecta efectivo físico', Number(resumenAntes.efectivo_esperado) === Number(resumenDespues.efectivo_esperado) && !reverseCash, JSON.stringify({ antes: resumenAntes.efectivo_esperado, despues: resumenDespues.efectivo_esperado }));
    }

    {
      const { admin, cajero, cliente, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 8');
      const venta = await createSale({ actor: cajero, productoId: producto.id, clienteId: cliente.id, credito: 10, cantidad: 2 });
      await ventasService.anularVenta(venta.data.venta.id, { motivo: 'Crédito reversado', novedad: 'Operación cancelada' }, admin);
      add(8, 'Venta a crédito anulada ajusta saldo pendiente', (await getNetCxCByVenta(venta.data.venta.id)) === 0, String(await getNetCxCByVenta(venta.data.venta.id)));
    }

    {
      const { admin, cajero, cliente, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 9');
      const venta = await createSale({ actor: cajero, productoId: producto.id, clienteId: cliente.id, contado: 4, transferencia: 3, credito: 3, cantidad: 2 });
      await ventasService.anularVenta(venta.data.venta.id, { motivo: 'Venta mixta anulada', novedad: 'Cliente rechazó la compra' }, admin);
      const reverseCash = await db('caja_movimientos').where({ tipo: 'ANULACION_VENTA_EFECTIVO', origen_id: venta.data.venta.id }).first();
      const audit = await getLastAudit('VENTA', venta.data.venta.id, 'ANULACION');
      add(9, 'Venta mixta anulada revierte cada método correctamente', Number(reverseCash?.monto_centavos || 0) === 400 && (await getNetCxCByVenta(venta.data.venta.id)) === 0 && Number(audit?.detalle?.impacto_transferencia_centavos || 0) === 300, JSON.stringify({ reverseCash: reverseCash?.monto_centavos || 0, impactoTransferencia: audit?.detalle?.impacto_transferencia_centavos || 0 }));
    }

    {
      const { cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 10');
      const venta = await createSale({ actor: cajero, productoId: producto.id, contado: 10, cantidad: 2 });
      const detail = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const result = await expectThrows(
        () => ventasService.createDevolucion(venta.data.venta.id, { motivo: 'Exceso', items: [{ venta_detalle_id: detail.id, cantidad: 3 }] }, cajero),
        'más de lo vendido'
      );
      add(10, 'No permitir devolución mayor a lo vendido', result.ok, result.error);
    }

    {
      const { cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 11');
      const venta = await createSale({ actor: cajero, productoId: producto.id, contado: 10, cantidad: 2 });
      const detail = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      await ventasService.createDevolucion(venta.data.venta.id, { motivo: 'Primera', items: [{ venta_detalle_id: detail.id, cantidad: 1 }] }, cajero);
      const result = await expectThrows(
        () => ventasService.createDevolucion(venta.data.venta.id, { motivo: 'Segunda excesiva', items: [{ venta_detalle_id: detail.id, cantidad: 2 }] }, cajero),
        'más de lo vendido'
      );
      add(11, 'No permitir devolución duplicada excesiva', result.ok, result.error);
    }

    {
      const { cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 12');
      const venta = await createSale({ actor: cajero, productoId: producto.id, contado: 10, cantidad: 2 });
      const detail = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const stockBefore = await db('productos').where({ id: producto.id }).first();
      await ventasService.createDevolucion(venta.data.venta.id, { motivo: 'Retorno parcial', items: [{ venta_detalle_id: detail.id, cantidad: 1 }] }, cajero);
      const stockAfter = await db('productos').where({ id: producto.id }).first();
      add(12, 'Devolución restaura inventario', Number(stockAfter.stock_actual_base) > Number(stockBefore.stock_actual_base), JSON.stringify({ before: stockBefore.stock_actual_base, after: stockAfter.stock_actual_base }));
    }

    {
      const { admin, cajero, cliente, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 13');
      const venta = await createSale({ actor: cajero, productoId: producto.id, clienteId: cliente.id, contado: 4, transferencia: 3, credito: 3, cantidad: 2 });
      const detail = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const devolucion = await ventasService.createDevolucion(
        venta.data.venta.id,
        {
          motivo: 'Devolución mixta',
          items: [{ venta_detalle_id: detail.id, cantidad: 1 }],
          contado: 2,
          transferencia: 2,
          credito: 1
        },
        cajero
      );
      const cashMovement = await db('caja_movimientos').where({ tipo: 'DEVOLUCION_EFECTIVO', origen_id: devolucion.data.devolucion.id }).first();
      const creditApplied = await getNetCxCByVenta(venta.data.venta.id);
      const refundRow = await db('devoluciones').where({ id: devolucion.data.devolucion.id }).first();
      add(13, 'Devolución genera ajuste financiero correcto', Number(cashMovement?.monto_centavos || 0) === 200 && creditApplied === 2 && Number(refundRow?.transferencia_centavos || 0) === 200, JSON.stringify({ cash: cashMovement?.monto_centavos || 0, saldoCxC: creditApplied, transferencia: refundRow?.transferencia_centavos || 0 }));
      const audit = await ventasService.getAuditoria(venta.data.venta.id, admin);
      add(15, 'Devolución queda auditada', (audit.data || []).some((row) => row.accion === 'DEVOLUCION'), JSON.stringify(audit.data?.map((row) => row.accion) || []));
    }

    {
      const { cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 14');
      const venta = await createSale({ actor: cajero, productoId: producto.id, contado: 5, cantidad: 1 });
      const detail = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const result = await expectThrows(
        () => ventasService.createDevolucion(venta.data.venta.id, { items: [{ venta_detalle_id: detail.id, cantidad: 1 }] }, cajero),
        'Datos inválidos'
      );
      add(14, 'Devolución exige motivo', result.ok, result.error);
    }

    {
      const { cajero } = await prepareScenario();
      await openTurno(cajero, 'Caso 16');
      const cierre = await closeTurnoIfAny(cajero);
      add(16, 'CAJERO cierra su propio turno', cierre?.data?.cierre_tipo === 'NORMAL', JSON.stringify(cierre?.data || {}));
    }

    {
      const { admin, cajero } = await prepareScenario();
      await openTurno(cajero, 'Caso 17');
      const cierre = await closeTurnoIfAny(cajero, {
        actor: admin,
        motivo_admin: 'Cajero salió sin cerrar'
      });
      add(17, 'ADMIN cierra turno ajeno con motivo', cierre?.data?.cierre_tipo === 'ADMINISTRATIVO' && cierre?.data?.resumen_cierre?.motivo_cierre_admin === 'Cajero salió sin cerrar', JSON.stringify(cierre?.data || {}));
    }

    {
      const { admin, cajero } = await prepareScenario();
      await openTurno(admin, 'Caso 18');
      const result = await expectThrows(
        () => cajaService.corteZ({ efectivo_contado: 100, observacion: 'Intento cajero' }, cajero),
        'responsable del turno o ADMIN'
      );
      const denyAudit = await getLastAudit('CAJA_TURNO', 1, 'CAJA_PERMISSION_DENY');
      add(18, 'CAJERO no cierra turno ajeno', result.ok && Boolean(denyAudit), JSON.stringify({ error: result.error, audit: denyAudit?.id || null }));
    }

    {
      const { cajero, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 19');
      await createSale({ actor: cajero, productoId: producto.id, contado: 20, cantidad: 4 });
      const cierre = await cajaService.corteZ(
        {
          efectivo_contado: 115,
          observacion: 'Faltante contado',
          autorizacion: { usuario: 'admin', password: 'admin123' }
        },
        cajero
      );
      add(19, 'Cierre calcula diferencia correctamente', Number(cierre.data.diferencia) === -5 && cierre.data.estado_cierre === 'FALTANTE', JSON.stringify(cierre.data));
    }

    {
      const { cajero, cliente, producto } = await prepareScenario();
      await openTurno(cajero, 'Caso 20');
      await createSale({ actor: cajero, productoId: producto.id, contado: 10, cantidad: 2 });
      await createSale({ actor: cajero, productoId: producto.id, transferencia: 5, cantidad: 1 });
      await createSale({ actor: cajero, productoId: producto.id, clienteId: cliente.id, credito: 10, cantidad: 2 });
      const resumen = await cajaService.corteX(cajero);
      const cierre = await cajaService.corteZ({ efectivo_contado: 110, observacion: 'Cierre segregado' }, cajero);
      add(20, 'Cierre separa efectivo, transferencia y crédito', Number(resumen.ventas_efectivo) === 10 && Number(resumen.ventas_transferencia) === 5 && Number(resumen.ventas_credito) === 10 && Number(cierre.data.resumen_cierre.transferencias) === 5 && Number(cierre.data.resumen_cierre.credito) === 10, JSON.stringify({ resumen, cierre: cierre.data.resumen_cierre }));
    }

    {
      const { admin, cajero, producto } = await prepareScenario();
      const configSnapshot = await configService.getConfiguracion();
      await configService.updateConfiguracion(
        {
          ...configSnapshot.data,
          exigir_caja_abierta_para_cobros: true
        },
        admin
      );
      const result = await expectThrows(
        () => createSale({ actor: cajero, productoId: producto.id, contado: 5, cantidad: 1 }),
        'turno abierto'
      );
      add(21, 'No se puede cobrar sin caja abierta si configuración lo exige', result.ok, result.error);
    }
  } catch (fatalError) {
    add(999, 'Preparación de suite', false, fatalError.message);
  }

  const report = printSuiteReport('VENTAS OPERATIVAS HARDENING', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando ventas-operational-hardening.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
