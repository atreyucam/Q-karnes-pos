# BLOQUE 4 — SQLite e integridad de datos local

## 1. Objetivo del bloque
Endurecer SQLite como base operativa local del POS para mejorar consistencia, trazabilidad y operabilidad real en entorno desktop offline-first, sin reemplazar motor ni introducir arquitectura remota.

## 2. Contexto aplicado
- POS de carnicería en una sola PC y una sola caja.
- Electron desktop + API local Node/Express + SQLite local.
- SQLite es fuente principal de verdad y no caché.
- Contrato obligatorio respetado de Bloques 1, 2 y 3.

## 3. Problemas de persistencia abordados
- Alta dependencia de validación en servicios con pocos refuerzos de DB.
- FKs activas pero con escasez de índices operativos en tablas de alto tráfico.
- Enlace legacy por texto en `compras_recepciones.factura_id` aún coexistente.
- Ruta de DB frágil por default relativa al proyecto.
- Sin estrategia formal de backup/restore local automatizable.
- Ambigüedad de columnas legacy en `productos` (`unidad`/`unidad_medida`, `precio_venta`/`precio_referencia`).

## 4. Cambios implementados

### 4.1 Integridad referencial
- Se reforzó consistencia de `compras_recepciones.factura_compra_id`:
  - backfill de datos legacy.
  - trigger para impedir inserciones/updates sin `factura_compra_id`.
  - trigger para validar consistencia entre `factura_compra_id` y `factura_id` texto.
- Se mantuvo compatibilidad de lectura legacy en repositorios ya ajustados en Bloque 2.

### 4.2 Constraints de dominio
- Se añadieron triggers de validación en DB para reglas críticas:
  - estados válidos en `ventas`, `caja_turnos`, `compras_ordenes`.
  - método de pago válido en `compras_facturas`.
  - tipo y monto válido en `cxc_movimientos` y `cxp_movimientos`.
- Se añadieron unicidades útiles:
  - un solo turno abierto: `uq_caja_turno_abierto` (índice parcial).
  - un tipo de pago por venta: `uq_venta_pagos_venta_tipo`.
  - no duplicar detalle de recepción por recepción: `uq_compras_recepcion_detalle_recepcion_orden_detalle`.
  - número de factura único por proveedor: `uq_compras_facturas_proveedor_numero`.

### 4.3 Índices operativos
Se añadieron índices para filtros/joins reales de módulos críticos:
- Ventas: `estado+fecha`, `turno_id`, `cliente_id`, `usuario_id`, detalle y pagos.
- Caja: `turno_id+fecha`, `tipo+fecha`, estado/apertura de turnos.
- Compras: estado/proveedor en órdenes, detalle por orden/producto, recepciones por orden/fecha.
- CxC/CxP: cliente/proveedor por fecha, factura/venta, tipo+actor.
- Inventario: movimientos por producto/fecha y tipo/fecha.
- Auditoría: entidad+referencia+fecha y acción+fecha.
- Otros: historial de precios, mermas, catálogos activos por nombre.

### 4.4 Hardening SQLite
- Política aplicada en conexiones Knex (`apps/api/knexfile.js`):
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA journal_mode = WAL`
  - `PRAGMA synchronous = NORMAL`
  - `PRAGMA busy_timeout = 5000`
  - `PRAGMA wal_autocheckpoint = 1000`
  - `PRAGMA temp_store = MEMORY`
- Se incorporó snapshot de pragmas en `apps/api/src/db/knex.js`.

### 4.5 Ruta del archivo de base
- Nueva resolución robusta en `apps/api/src/config/dbFile.js`.
- Estrategia:
  - `development`: `apps/api/data/qkarnes.sqlite`
  - `test`: `apps/api/data/qkarnes.test.sqlite`
  - `production`: carpeta de datos de usuario del SO (`QKarnesPOS/data/qkarnes.sqlite`)
  - `DB_FILE` permite override explícito.
- Se evita depender por defecto de rutas frágiles de instalación/proyecto en producción.

### 4.6 Backup local
- Script nuevo: `apps/api/scripts/sqlite-backup.js`.
- Estrategia:
  - checkpoint WAL previo.
  - snapshot con `VACUUM INTO`.
  - validación inmediata con `integrity_check` y `foreign_key_check`.
  - versionado por timestamp en carpeta `backups` junto a DB.
- Comando:
  - `npm run db:backup`
  - opcional: `node scripts/sqlite-backup.js --label cierre-dia`

### 4.7 Restore local
- Script nuevo: `apps/api/scripts/sqlite-restore.js`.
- Estrategia:
  - exige `--file` y confirmación explícita `--yes` (no sobreescribe a ciegas).
  - valida integridad del backup antes de restaurar.
  - genera safeguard backup de la DB actual antes del replace.
  - soporta `--force` cuando hay WAL activo (bajo responsabilidad).
- Comando:
  - `npm run db:restore -- --file <ruta_backup.sqlite> --yes`
- Condición operacional recomendada:
  - ejecutar con API/app detenidas para minimizar riesgo de lock/estado intermedio.

### 4.8 Verificación de integridad
- Script nuevo: `apps/api/scripts/sqlite-integrity-check.js`.
- Verifica:
  - pragmas efectivos,
  - `PRAGMA integrity_check`,
  - `PRAGMA foreign_key_check`.
- Comando:
  - `npm run db:check`

### 4.9 Limpieza de ambigüedad del esquema
- Definición canónica documentada y aplicada:
  - `unidad_medida` es canónica; `unidad` se mantiene por compatibilidad.
  - `precio_referencia` es canónica; `precio_venta` se mantiene por compatibilidad.
- Mitigación concreta en DB:
  - triggers de consistencia que impiden divergencia entre pares legacy/canónicos.
  - backfill previo para alinear datos existentes.

## 5. Migraciones y scripts creados
- Migración nueva:
  - `apps/api/migrations/202603070002_bloque4_sqlite_integridad_local.js`
- Scripts nuevos:
  - `apps/api/scripts/sqlite-utils.js`
  - `apps/api/scripts/sqlite-integrity-check.js`
  - `apps/api/scripts/sqlite-backup.js`
  - `apps/api/scripts/sqlite-restore.js`
  - `apps/api/scripts/bloque4-sqlite-tests.js`

## 6. Archivos modificados
- `apps/api/knexfile.js`
- `apps/api/src/config/dbFile.js`
- `apps/api/src/db/knex.js`
- `apps/api/migrations/202603070002_bloque4_sqlite_integridad_local.js`
- `apps/api/seeds/001_demo.js`
- `apps/api/.env.example`
- `apps/api/package.json`
- `apps/api/scripts/sqlite-utils.js`
- `apps/api/scripts/sqlite-integrity-check.js`
- `apps/api/scripts/sqlite-backup.js`
- `apps/api/scripts/sqlite-restore.js`
- `apps/api/scripts/bloque4-sqlite-tests.js`

## 7. Pruebas incorporadas
- Suite automatizada de bloque: `node scripts/bloque4-sqlite-tests.js` (28 casos).
- Validación de no regresión incluida:
  - `node scripts/bloque2-tests.js`
  - `node scripts/bloque3-security-tests.js`

## 8. Decisiones técnicas tomadas
- Se reforzó la base local desde DB (índices + constraints + triggers), no solo desde servicios.
- Se mantuvo compatibilidad legacy donde ya existe data/histórico.
- Se priorizó hardening operacional realista para desktop local (WAL + backup/restore + checks).
- Se evitó rediseño remoto o cambio de motor fuera de alcance.

## 9. Riesgos abiertos
- Los triggers añaden control fuerte; cambios manuales fuera del flujo de aplicación pueden fallar más temprano (comportamiento intencional).
- `factura_id` texto permanece por compatibilidad legacy; canónico operativo es `factura_compra_id`.
- Restore en caliente puede ser riesgoso si la app/API no están detenidas; se deja mitigación por `--yes`/`--force` y safeguard local.
- Cifrado de archivo SQLite no abordado en este bloque.

Plan de continuación:
- En siguiente bloque, migrar gradualmente consumidores internos para depender únicamente de campos canónicos y reducir deuda legacy.
- Evaluar automatización programada de backup local (scheduler) y rotación.
- Evaluar estrategia de cifrado local del archivo DB y hardening de acceso al directorio de datos.

## 10. Conclusión técnica del bloque
SQLite queda endurecida para operación local seria del POS: integridad reforzada, mejores índices operativos, política WAL explícita, ruta de DB más robusta, y estrategia funcional de backup/restore/check.  
El sistema mantiene compatibilidad con los contratos de Bloques 1, 2 y 3, y se valida no regresión funcional en suites críticas.
