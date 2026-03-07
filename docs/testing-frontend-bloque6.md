# Testing Frontend Bloque 6

## Objetivo
Validar de forma repetible mejoras de mantenibilidad y UX operativa del frontend desktop sin reescritura masiva.

## Comandos
Desde raíz:
- `npm run test:frontend:build`
- `npm run test:bloque6`
- `npm run test:regression` (no regresión de Bloques 2, 3 y 4 en backend)

Desde `apps/desktop`:
- `npm run build`
- `npm run test:bloque6`
- `npm run test:ux-regression`

## Cobertura
- Verifica intervención en páginas críticas (`NuevaVentaPage`, `CompraNuevaPage`, `InventarioPage`, `LoginPage`, `CajaPage`).
- Verifica reducción de API directa en páginas intervenidas mediante `catalogoService`.
- Verifica consistencia de parsing de errores API (`apiError.cjs` + `apiClient.js`).
- Verifica presencia de mejoras UX operativas para acciones sensibles y navegación.
- Verifica disponibilidad de regresión de bloques previos.

## No cubre todavía
- Pruebas E2E visuales de interacción real en Electron.
- Pruebas unitarias de componentes React con framework de testing UI (RTL/Vitest).
- Medición de performance de render en listas grandes.

## Criterio de resultado
- `PASS` total en `test:bloque6`.
- `build` de frontend exitoso.
- `test:regression` de backend en PASS para garantizar no regresión funcional de bloques anteriores.
