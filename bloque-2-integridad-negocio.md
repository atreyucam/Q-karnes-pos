# BLOQUE 2 — Integridad de negocio critica

## 1. Objetivo del bloque
Corregir contradicciones criticas del nucleo operativo local del POS (ventas, anulacion, devolucion, caja y compras/recepcion) para asegurar consistencia entre stock, caja, cuentas por cobrar/pagar, actor responsable y auditoria, bajo el contrato funcional definido en Bloque 1.

## 2. Contexto aplicado
- POS de carniceria desktop con Electron.
- Una sola PC y una sola caja.
- Operacion offline-first.
- SQLite local como fuente principal de verdad.
- Sin multisucursal, sin multicaja, sin capa remota como prioridad de este bloque.

## 3. Reglas del Bloque 1 implementadas en este bloque
- Venta atribuida al usuario autenticado de sesion, no al `usuario_id` enviado por payload.
- Consolidacion de items repetidos por producto antes de validar y descontar stock.
- Flujo formal de anulacion transaccional con compensacion integral (stock, caja, CxC) y auditoria.
- Devolucion endurecida con autorizacion admin obligatoria y control de limites devolvibles.
- Caja con restriccion de roles, cierre por mismo responsable que abre, y autorizacion admin para cierre con diferencia.
- Calculo de efectivo esperado en corte X/Z considerando ventas, ingresos, egresos, compras en efectivo, devoluciones y anulaciones.
- Compras con autorizacion admin obligatoria para registrar orden.
- Recepcion de compra con control de duplicados por detalle y limite por pendiente.
- Fortalecimiento de integridad recepcion-factura con `factura_compra_id` (FK) y compatibilidad legacy.
- Auditoria minima reforzada con actor/autorizador/impacto en eventos sensibles.

## 4. Cambios realizados por dominio

### 4.1 Ventas
- `createVenta` toma actor desde `authUser.id`; ignora atribucion externa.
- Se consolida por producto para validacion/descuento de stock real por cantidad total.
- Para venta contado se usa turno abierto global (una sola caja fisica), no turno por usuario.
- Se mantiene impacto transaccional en inventario, caja, CxC y auditoria.
- Se removio cambio libre de `estado` desde endpoint de edicion.

### 4.2 Anulacion
- Se agrego `POST /api/ventas/:id/anular`.
- Se implemento `anularVenta` como flujo de dominio transaccional:
  - valida estado y evita doble anulacion.
  - bloquea anulacion si existen devoluciones.
  - autoriza por sesion admin o por clave admin cuando actor es cajero.
  - revierte stock con trazas de inventario.
  - revierte caja (si hubo contado).
  - revierte CxC (si hubo credito).
  - registra `ventas_anulaciones`.
  - audita actor, autorizador, motivo, novedad e impactos.

### 4.3 Devolucion
- Se exige autorizacion admin para toda devolucion.
- Se impide devolver ventas anuladas.
- Se mantiene validacion de no exceder vendido/no devuelto previamente.
- Reingreso de stock y compensacion financiera (caja/CxC) dentro de transaccion.
- Auditoria ampliada con actor, autorizador y novedad.

### 4.4 Caja
- Rutas de caja protegidas con `authorizeRoles('ADMIN', 'CAJERO')`.
- Apertura: turno unico del sistema.
- Movimientos manuales: solo responsable del turno o ADMIN.
- Cierre: solo puede cerrar quien abrio el turno.
- Cierre con diferencia:
  - exige observacion.
  - exige clave admin valida.
- Formula de efectivo esperado endurecida con snapshot integral de movimientos reales.

### 4.5 Compras / recepcion
- Registrar orden de compra requiere autorizacion admin obligatoria.
- Recepcion valida estado de orden (`ABIERTA`/`PARCIAL`), evita detalle repetido y bloquea exceso sobre pendiente.
- Recepcion guarda `factura_compra_id` para referencial fuerte con factura.
- Compra contado impacta caja.
- Compra credito impacta CxP.
- Auditoria incluye actor, autorizador y referencias relevantes.

### 4.6 Auditoria y autorizacion
- Nuevo servicio reusable de autorizacion admin:
  - `validateAdminCredentials`
  - `resolveAdminAuthorizer`
- Aplicado en devolucion, anulacion de venta, cierre de caja con diferencia y registro de compra.
- Eventos criticos incluyen modulo, actor, autorizador, entidad y contexto de impacto.

## 5. Archivos modificados
- `apps/api/src/modules/auth/adminAuthorization.service.js` (nuevo)
- `apps/api/src/modules/ventas/ventas.service.js`
- `apps/api/src/modules/ventas/ventas.repository.js`
- `apps/api/src/modules/ventas/ventas.controller.js`
- `apps/api/src/modules/ventas/ventas.routes.js`
- `apps/api/src/modules/caja/caja.service.js`
- `apps/api/src/modules/caja/caja.controller.js`
- `apps/api/src/modules/caja/caja.routes.js`
- `apps/api/src/modules/compras/compras.service.js`
- `apps/api/src/modules/compras/compras.repository.js`
- `apps/api/src/modules/compras/compras.controller.js`
- `apps/api/src/modules/proveedores/proveedores.repository.js`
- `apps/api/src/modules/proveedores/proveedores.service.js`
- `apps/api/migrations/202603070001_bloque2_integridad_negocio.js` (nuevo)
- `apps/api/seeds/001_demo.js`
- `apps/api/scripts/bloque2-tests.js` (nuevo)
- `apps/desktop/src/pages/compras/CompraNuevaPage.jsx`
- `apps/desktop/src/pages/ventas/VentasListPage.jsx`
- `apps/desktop/src/pages/caja/CajaPage.jsx`
- `apps/desktop/src/stores/ventasStore.js`

## 6. Decisiones tecnicas tomadas
- Se priorizo endurecer invariantes de negocio en backend (fuente de verdad), con cambios minimos de frontend solo para soportar payloads nuevos.
- Se mantuvo enfoque local offline-first sin introducir diseno remoto/VPS.
- Se introdujo enlace fuerte recepcion-factura por FK, manteniendo fallback legacy para no romper datos existentes.
- Se implemento autorizacion sensible como patron reusable para bloques siguientes.
- Se agrego script de validacion integral de 30 pruebas de dominio para verificacion repetible del bloque.

## 7. Riesgos abiertos
- La autorizacion admin sensible hoy viaja como credenciales en payload contra API local; requiere endurecimiento adicional en bloque de seguridad (TTL corto, rate-limit local, trazas de intentos fallidos, politicas de bloqueo).
- El control de duplicado en recepcion es a nivel servicio; aun no existe constraint SQL dedicado que impida payload repetido por error de capa aplicacion.
- Existen rutas/modulos fuera de este alcance que aun requieren revision de permisos sensibles (por ejemplo, borrado de producto, otros flujos administrativos).
- La bateria actual valida integridad de negocio; falta incorporarla a un pipeline automatico formal de regresion.

## 8. Conclusion tecnica del bloque
El Bloque 2 queda implementado con foco correcto en integridad local del POS: ventas, anulaciones, devoluciones, caja y compras/recepcion ahora operan con reglas transaccionales y trazabilidad acordes al contrato de Bloque 1.  
La operacion local queda significativamente mas confiable para una sola PC/una sola caja con SQLite offline-first, y se deja base reutilizable para endurecimiento de seguridad y calidad en los siguientes bloques.
