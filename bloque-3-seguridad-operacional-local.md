# BLOQUE 3 — Seguridad operacional local

## 1. Objetivo del bloque
Endurecer la seguridad operacional local del POS (desktop, una PC, una caja, offline-first) para que autenticación, permisos, autorizaciones sensibles, trazabilidad y configuración crítica operen de forma consistente con los contratos de Bloques 1 y 2.

## 2. Contexto aplicado
- Producto POS local para carnicería.
- Electron + API local Node/Express + SQLite local.
- Operación sin dependencia remota para núcleo de negocio.
- Roles operativos válidos en esta etapa: `ADMIN`, `CAJERO`.

## 3. Problemas de seguridad abordados
- `JWT_SECRET` con default conocido y sin guardas estrictas por entorno.
- Inconsistencia de roles (`BODEGA`) versus contrato funcional real.
- Rutas sensibles sin política uniforme de autorización por rol.
- Falta de trazabilidad consistente para denegaciones de acceso.
- Autorización sensible admin sin control mínimo de intentos fallidos/bloqueo temporal.
- Borrado de producto sin flujo sensible explícito.
- Persistencia de sesión en `localStorage` (riesgo de exposición persistente en desktop).
- Baseline Electron mejorable en navegación/ventanas externas.
- Seeds demo sin guard explícito de producción.

## 4. Cambios implementados

### 4.1 Autenticación local
- Endurecido `apps/api/src/config/env.js`:
  - `JWT_SECRET` obligatorio y seguro fuera de `development/test`.
  - falla explícita en producción si falta secreto o es débil/conocido.
- Endurecido `apps/api/src/modules/auth/auth.service.js`:
  - login permitido solo para roles operativos `ADMIN`/`CAJERO`.
  - auditoría de `AUTH_LOGIN_ALLOW` y `AUTH_LOGIN_DENY`.
  - error de login sigue sin exponer detalles sensibles.
- Endurecido `apps/api/src/middlewares/authenticate.js`:
  - deniega token con rol no operativo.
  - audita denegaciones de autenticación (`AUTHN_DENY`).

### 4.2 Autorización por rol
- Se añadió política uniforme `ADMIN/CAJERO` en rutas críticas:
  - `reportes.routes.js`
  - `compras.routes.js`
  - `productos.routes.js`
  - `inventario.routes.js`
  - `categorias.routes.js`
  - `proveedores.routes.js`
  - `cxp.routes.js`
- Endurecido `apps/api/src/middlewares/authorizeRoles.js`:
  - audita denegaciones de autorización (`AUTHZ_DENY`) con ruta, método y actor.

### 4.3 Autorización sensible por clave admin
- Endurecido `apps/api/src/modules/auth/adminAuthorization.service.js`:
  - auditoría de autorización admin (`ADMIN_AUTH_CHECK`) con resultado `ALLOW/DENY`.
  - control local de intentos fallidos con bloqueo temporal en memoria.
  - sin persistencia de credenciales en auditoría.
- Se aplicó patrón sensible de forma consistente en:
  - devolución de venta,
  - anulación de venta,
  - cierre de caja con diferencia,
  - registro de compra,
  - baja lógica de producto.
- Se movió validación sensible fuera de transacciones críticas para evitar pérdida de trazas por rollback/bloqueo SQLite.

### 4.4 Auditoría de seguridad
- Se añadió traza para:
  - intentos de autenticación inválidos,
  - accesos denegados por rol,
  - autorización admin válida/denegada,
  - acciones sensibles exitosas (actor + autorizador + contexto).
- Estructura auditada reforzada con:
  - módulo, acción, resultado, motivo,
  - actor, autorizador,
  - referencia funcional.

### 4.5 Productos y borrado seguro
- Se implementó borrado seguro como **baja lógica**:
  - nuevo endpoint `DELETE /api/productos/:id`.
  - exige clave admin válida.
  - no elimina físicamente historial.
  - registra auditoría `PRODUCTO/BAJA_LOGICA`.
- Se añadió en backend:
  - `productos.service.remove`,
  - `productos.repository.deactivate`,
  - `productos.controller.remove`.

### 4.6 Electron / superficie desktop
- Endurecido `apps/desktop/electron/main.cjs`:
  - mantiene `contextIsolation: true`, `nodeIntegration: false`.
  - agrega `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`.
  - bloquea apertura de ventanas externas (`setWindowOpenHandler` deny).
  - restringe navegación a origen permitido (dev) o `file://` (prod).

### 4.7 Configuración y entorno
- Actualizado `apps/api/.env.example`:
  - elimina secreto por defecto inseguro.
  - documenta requisitos mínimos de `JWT_SECRET`.
  - incorpora `ALLOW_DEMO_SEED`.
- Endurecido `apps/api/seeds/001_demo.js`:
  - bloquea ejecución demo en producción salvo `ALLOW_DEMO_SEED=true`.
- Alineación contractual de roles:
  - se retiró `BODEGA` de seed demo y frontend,
  - se migró uso funcional a `ADMIN/CAJERO`.

## 5. Archivos modificados
- `apps/api/src/config/env.js`
- `apps/api/src/config/security.js` (nuevo)
- `apps/api/src/modules/auth/auth.service.js`
- `apps/api/src/modules/auth/adminAuthorization.service.js`
- `apps/api/src/middlewares/authenticate.js`
- `apps/api/src/middlewares/authorizeRoles.js`
- `apps/api/src/modules/reportes/reportes.routes.js`
- `apps/api/src/modules/compras/compras.routes.js`
- `apps/api/src/modules/compras/compras.service.js`
- `apps/api/src/modules/compras/compras.controller.js`
- `apps/api/src/modules/productos/productos.routes.js`
- `apps/api/src/modules/productos/productos.service.js`
- `apps/api/src/modules/productos/productos.controller.js`
- `apps/api/src/modules/productos/productos.repository.js`
- `apps/api/src/modules/inventario/inventario.routes.js`
- `apps/api/src/modules/categorias/categorias.routes.js`
- `apps/api/src/modules/proveedores/proveedores.routes.js`
- `apps/api/src/modules/cxp/cxp.routes.js`
- `apps/api/src/modules/ventas/ventas.service.js`
- `apps/api/src/modules/caja/caja.service.js`
- `apps/api/seeds/001_demo.js`
- `apps/api/.env.example`
- `apps/api/package.json`
- `apps/api/scripts/bloque2-tests.js`
- `apps/api/scripts/bloque3-security-tests.js` (nuevo)
- `apps/desktop/electron/main.cjs`
- `apps/desktop/src/lib/apiClient.js`
- `apps/desktop/src/router/routes.jsx`
- `apps/desktop/src/layout/Sidebar.jsx`
- `apps/desktop/src/pages/auth/LoginPage.jsx`

## 6. Pruebas incorporadas
- Suite automatizada nueva: `apps/api/scripts/bloque3-security-tests.js`.
- Cobertura implementada:
  - autenticación y guardas de secretos,
  - autorización por rol en rutas críticas,
  - autorización sensible admin (éxito/fallo),
  - trazabilidad auditada de eventos sensibles,
  - bloqueo de seed demo en entorno productivo,
  - baseline de seguridad Electron,
  - no persistencia inapropiada de credenciales sensibles.
- Validación adicional de no regresión:
  - `apps/api/scripts/bloque2-tests.js` ejecutado y en PASS total.

## 7. Decisiones técnicas tomadas
- Se priorizó seguridad backend como fuente de verdad, con cambios frontend mínimos.
- Se mantuvo arquitectura local offline-first sin introducir capa remota.
- Se eligió baja lógica para producto por integridad histórica.
- Se aplicó control de intentos fallidos en memoria como mitigación inmediata razonable para desktop local.
- Se evitó rediseño completo de sesión; se migró persistencia de token a `sessionStorage` (menor exposición persistente).

## 8. Riesgos abiertos
- El token JWT sigue disponible en el contexto del renderer durante sesión activa; mitigado con `sessionStorage`, pero no elimina riesgo ante XSS local.
- Bloqueo de intentos admin es en memoria (se pierde al reiniciar la app); mitigación mínima implementada, pendiente endurecimiento persistente.
- No hay factor adicional para acciones sensibles (solo clave admin); pendiente para bloque de seguridad avanzada.
- No existe aún cifrado de base local a nivel de archivo SQLite.
- Falta pipeline CI formal para ejecutar suites de bloque automáticamente en cada cambio.

## 9. Conclusión técnica del bloque
El Bloque 3 deja endurecida la seguridad operacional local del POS en los puntos críticos definidos por contrato: autenticación, permisos por rol, autorización sensible admin, auditoría y configuración segura de ejecución local.  
El sistema queda coherente con el producto real (desktop local offline-first con SQLite), con mitigaciones aplicadas dentro del alcance razonable y riesgos remanentes documentados para bloques posteriores.
