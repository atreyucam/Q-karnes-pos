# BLOQUE 6 — Frontend desktop: mantenibilidad y UX operativa

## 1. Objetivo del bloque
Mejorar mantenibilidad y UX operativa del frontend desktop del POS local sin reescribir toda la UI, manteniendo contrato funcional de Bloques 1 a 5.

## 2. Contexto aplicado
- POS local offline-first en Electron.
- Una sola PC, una sola caja.
- API local + SQLite local como fuente de verdad.
- Sin multisucursal, multicaja ni capa remota en este bloque.

## 3. Problemas abordados
- Páginas críticas con mezcla de responsabilidades (UI + acceso API + reglas de flujo).
- Llamadas API directas desde páginas en flujos operativos.
- Manejo de errores heterogéneo y poco contextual en UI.
- Fricción operativa por entrada manual propensa a error en inventario.
- Flujo sensible de compras con UX de autorización mejorable.

## 4. Cambios implementados

### 4.1 Páginas críticas intervenidas
- `NuevaVentaPage`:
  - extracción de carga/búsqueda de catálogo a hook `useVentaCatalogo`.
  - eliminación de `usuario_id` en payload de venta (alineado a contrato de sesión).
- `CompraNuevaPage`:
  - refuerzo de validaciones operativas previas al guardado.
  - control explícito de autorización ADMIN requerida.
  - estado `saving` y feedback más claro.
- `InventarioPage`:
  - reemplazo de entradas manuales “Producto ID” por selectores de producto (`ProductoSelect`) en stock mínimo, conteo, ajuste y merma.
  - validaciones de formulario para evitar operaciones vacías/ambiguas.
- `CajaPage`:
  - claridad de cierre con resumen esperado/contado/diferencia.
  - prompt de credenciales admin solo cuando hay diferencia.
- `LoginPage`:
  - se eliminan credenciales precargadas por defecto.
  - hint demo visible solo en entorno de desarrollo.

### 4.2 Consumo de API y contratos UI
- Nuevo servicio reutilizable de catálogo:
  - `apps/desktop/src/services/catalogoService.js`
- Páginas intervenidas migradas a servicio de catálogo (sin `apiClient.get` directo para categorías/productos activos).
- Parser de errores API endurecido:
  - `apps/desktop/src/lib/apiError.cjs`
  - integración en `apps/desktop/src/lib/apiClient.js` (`parseApiError`, `parseApiErrorMeta`).

### 4.3 Manejo de errores y estados
- Mensajería de error más consistente por tipo (`auth`, `authorization`, `validation`, `server`).
- En compras se diferencian errores de validación local y errores backend.
- En inventario se diferencian errores de catálogo/operación con feedback claro.

### 4.4 UX operativa
- Compra: validaciones previas con mensajes accionables y bloqueo de doble envío.
- Caja: flujo de cierre con diferencia más claro y menos confuso para autorización admin.
- Inventario: menos errores de digitación al seleccionar productos en lugar de ID manual.
- Login: evita entrar accidentalmente con credenciales demo prellenadas.

### 4.5 Navegación y roles
- Sidebar incluye acceso explícito a historial de ventas (`/ventas`) para `ADMIN` y `CAJERO`.
- Se mantiene consistencia de módulos operativos visibles para ambos roles definidos.

### 4.6 Mantenibilidad del frontend
- Separación de responsabilidades en ventas mediante hook dedicado:
  - `apps/desktop/src/pages/ventas/hooks/useVentaCatalogo.js`
- Centralización de consumo API de catálogo en servicio compartido.
- Propagación de errores en `comprasStore.crearOrden` para mejor control en UI.

## 5. Archivos modificados
- `apps/desktop/src/lib/apiClient.js`
- `apps/desktop/src/pages/ventas/NuevaVentaPage.jsx`
- `apps/desktop/src/pages/compras/CompraNuevaPage.jsx`
- `apps/desktop/src/pages/inventario/InventarioPage.jsx`
- `apps/desktop/src/pages/caja/CajaPage.jsx`
- `apps/desktop/src/pages/auth/LoginPage.jsx`
- `apps/desktop/src/layout/Sidebar.jsx`
- `apps/desktop/src/stores/comprasStore.js`
- `apps/desktop/package.json`
- `package.json`

Archivos nuevos:
- `apps/desktop/src/lib/apiError.cjs`
- `apps/desktop/src/services/catalogoService.js`
- `apps/desktop/src/pages/ventas/hooks/useVentaCatalogo.js`
- `apps/desktop/scripts/bloque6-frontend-tests.cjs`
- `docs/testing-frontend-bloque6.md`

## 6. Pruebas incorporadas o ajustadas
- Suite automatizada de Bloque 6:
  - `npm run test:bloque6` (workspace `apps/desktop`)
- Build frontend como validación técnica:
  - `npm run test:frontend:build`
- No regresión backend (Bloques 2-4):
  - `npm run test:regression`
- Resultados ejecutados:
  - Bloque 6 frontend: PASS (18/18).
  - Build frontend: PASS.
  - Regresión backend Bloques 2-4: PASS.

## 7. Decisiones técnicas tomadas
- Evolución incremental, priorizando páginas críticas y flujos sensibles sin reescritura completa.
- Parser de errores unificado en frontend para mejorar consistencia UX sin romper stores existentes.
- Refuerzo de UX operativa en compras/caja/inventario con cambios de bajo riesgo y alto impacto.

## 8. Riesgos abiertos
- Siguen existiendo páginas no intervenidas con llamadas API directas en UI.
- Aún no hay suite E2E visual de Electron para flujos completos de usuario.
- La fragmentación profunda de páginas grandes queda para iteraciones posteriores por dominio.
- Build de frontend mantiene advertencia de chunk principal grande (optimización pendiente por code-splitting).

## 9. Conclusión técnica del bloque
El frontend queda más mantenible y usable en flujos operativos críticos, con mejor separación de responsabilidades, consumo API más consistente, manejo de errores más homogéneo y mejoras UX de alto valor para operación real de POS local.
