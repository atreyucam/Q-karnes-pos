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

## Estructura

- `primitives/`
- `layout/`
- `data-display/`
- `feedback/`
- `overlays/`
- `navigation/`
