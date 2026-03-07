# Testing y Regresión POS Local

## Objetivo
Definir una estrategia repetible para validar no regresión del POS local desktop offline-first bajo contrato de Bloques 1 a 5.

## Suites disponibles
- Bloque 2 (`npm run test:bloque2`): integridad de negocio crítica (ventas, anulación, devolución, caja, compras/recepción).
- Bloque 3 (`npm run test:bloque3`): seguridad operacional local (auth, roles, autorizaciones sensibles, auditoría, baseline Electron).
- Bloque 4 (`npm run test:bloque4`): persistencia SQLite e integridad local (constraints, índices, hardening, backup/restore).
- Bloque 5 (`npm run test:bloque5`): calidad técnica, consistencia de contratos API/errores y consolidación de regresión.

## Ejecución recomendada
1. Regresión base de negocio/seguridad/persistencia:
```bash
npm run test:regression
```
2. Validación de calidad técnica del bloque actual:
```bash
npm run test:bloque5
```

## Comandos por workspace
Desde raíz:
- `npm run test:bloque2`
- `npm run test:bloque3`
- `npm run test:bloque4`
- `npm run test:bloque5`
- `npm run test:regression`

Desde `apps/api`:
- `npm run test:bloque2`
- `npm run test:bloque3`
- `npm run test:bloque4`
- `npm run test:bloque5`
- `npm run test:regression`

## Cobertura y límites
- Las suites cubren los flujos nucleares locales definidos en Bloques 1 a 4.
- Bloque 5 valida además consistencia técnica en contratos API y estructura de pruebas.
- No cubre UI E2E de Electron ni performance profunda; esos puntos quedan para bloques posteriores.

## Interpretación de resultados
- `PASS` total: apto para continuar al siguiente bloque técnico.
- Cualquier `FAIL`: bloquear pase, corregir y rerun completo.
- Mantener evidencia de salida de consola en revisión técnica del bloque.
