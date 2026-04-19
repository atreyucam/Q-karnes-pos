# POS Design System

`src/shared/ui` es la única fuente de verdad del sistema visual POS.

## Objetivo

- unificar primitives, layout, feedback, overlays y navigation
- eliminar la coexistencia indefinida entre `src/ui` y `src/components/ui`
- formalizar variantes POS, especialmente `cashier` y `danger`

## Reglas

- no crear UI nueva fuera de `src/shared/ui`
- no usar `<button>`, `<input>`, `<select>` crudos en páginas
- no introducir colores hex en features/pages
- toda acción monetaria de cierre debe usar `Button` variante `cashier`
- toda acción destructiva debe usar `Button` variante `danger`
- `src/components/ui` queda deprecated y solo puede actuar como wrapper temporal

## Patron Switch

- `Switch` es el patron oficial para estados booleanos administrativos visibles: activo/inactivo, habilitado/deshabilitado, permitido/bloqueado, visible/oculto
- no usar `Switch` para acciones destructivas o irreversibles como eliminar, anular, cierre de caja, restaurar backup o procesos operativos criticos
- tipo A, persistencia inmediata: el cambio se aplica al mover el switch, pide `ConfirmDialog` si es sensible y debe revertirse visualmente ante cancelacion o error backend
- tipo B, formulario batch: el switch solo modifica estado local del formulario y requiere una accion explicita de guardar; este caso debe indicarse visualmente para no confundirse con persistencia inmediata
- los toggles administrativos sensibles deben usar `ConfirmDialog` y feedback consistente; no usar `window.confirm` ni `window.prompt`

## Estructura

- `primitives/`
- `layout/`
- `data-display/`
- `feedback/`
- `overlays/`
- `navigation/`

## Compatibilidad temporal pendiente

- `src/ui/*` sigue existiendo como fachada legacy y debe eliminarse por módulos, no de golpe
- `src/components/ui/*` sigue existiendo como capa deprecated para compatibilidad histórica
- prioridad de migración actual: `ConfiguracionPage`, `ClientesPage`, `ProveedoresPage`, `ProductosPage`, `SistemaPage`
