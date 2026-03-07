# BLOQUE 2 — Validacion

## 1. Checklist de completitud
- [x] Se inspeccionaron modulos de ventas, caja, compras, inventario, auth, auditoria, rutas y persistencia SQLite.
- [x] Se implemento atribucion de venta por sesion autenticada.
- [x] Se implemento consolidacion de items repetidos en venta y validacion de stock agregado.
- [x] Se implemento anulacion formal transaccional con compensaciones y bloqueo de doble anulacion.
- [x] Se endurecio devolucion con autorizacion admin y trazabilidad de actor/autorizador.
- [x] Se endurecio caja (roles, responsable de turno, cierre con diferencia y autorizacion admin).
- [x] Se endurecio compras/recepcion (autorizacion admin, pendientes, duplicados, integridad factura-recepcion).
- [x] Se agrego trazabilidad minima obligatoria en eventos criticos del bloque.
- [x] Se ejecutaron pruebas funcionales minimas obligatorias del bloque.
- [x] Se documentaron resultados, riesgos y recomendacion de pase.

## 2. Criterios de aceptacion
- El nucleo local del POS mantiene integridad entre stock, caja, CxC/CxP y actor responsable en flujos criticos.
- Las operaciones sensibles del alcance (anulacion, devolucion, compra, cierre con diferencia) requieren autorizacion admin valida.
- No existe anulacion como simple cambio de estado; se ejecutan compensaciones de dominio.
- La recepcion no permite duplicados por detalle ni cantidades que excedan pendiente.
- Las pruebas del bloque evidencian comportamiento esperado y ausencia de regresion critica en los 30 casos definidos.

## 3. Pruebas ejecutadas
Entorno de ejecucion:
- Comando migracion: `npm --workspace apps/api run migrate`
- Comando seed: `npm --workspace apps/api run seed`
- Comando pruebas bloque: `node scripts/bloque2-tests.js` (ejecutado en `apps/api`)

Resultado por caso:

| ID | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | Venta normal con stock suficiente | PASS | Descuento de stock validado |
| 2 | Venta con items repetidos del mismo producto | PASS | Consolidacion y descuento total validado |
| 3 | Usuario de venta proviene de sesion | PASS | `usuario_id` en payload ignorado |
| 4 | Venta contado impacta caja | PASS | Movimiento `VENTA` registrado |
| 5 | Venta credito impacta CxC | PASS | Movimiento `CARGO` registrado |
| 6 | Anulacion por admin con novedad | PASS | Flujo de anulacion ejecutado |
| 7 | Cajero sin clave admin valida no puede anular | PASS | Error esperado de autorizacion |
| 8 | Cajero con clave admin valida puede anular | PASS | Anulacion autorizada |
| 9 | Anulacion revierte stock | PASS | Stock compensado |
| 10 | Anulacion revierte caja/CxC | PASS | Movimientos compensatorios registrados |
| 11 | Intento de doble anulacion falla | PASS | Error esperado "ya fue anulada" |
| 12 | Devolucion parcial valida | PASS | Estado `DEVUELTA_PARCIAL` |
| 13 | Devolucion total valida | PASS | Estado `DEVUELTA_TOTAL` |
| 14 | No permite devolver mas de lo vendido | PASS | Error esperado por exceso |
| 15 | Devolucion impacta stock correctamente | PASS | Reingreso validado |
| 16 | Devolucion impacta caja/CxC correctamente | PASS | Movimientos `DEVOLUCION`/`ABONO` |
| 17 | Auditoria de devolucion actor/autorizador | PASS | Campos presentes en auditoria |
| 18 | Apertura de caja por usuario permitido | PASS | Turno abierto correctamente |
| 19 | Cierre por usuario distinto falla | PASS | Error esperado de responsable |
| 20 | Cierre normal sin diferencia | PASS | Turno cerrado normal |
| 21 | Cierre con diferencia sin clave admin falla | PASS | Error esperado de autorizacion |
| 22 | Cierre con diferencia con clave admin y novedad | PASS | Cierre autorizado |
| 23 | Calculo de efectivo esperado correcto | PASS | Formula integral validada |
| 24 | Registro de compra con autorizacion valida | PASS | Orden creada |
| 25 | Registro de compra sin autorizacion admin falla | PASS | Error esperado de validacion/autorizacion |
| 26 | Recepcion valida dentro del pendiente | PASS | Recepcion aplicada |
| 27 | Recepcion con detalle repetido inconsistente falla | PASS | Error esperado de duplicado |
| 28 | Recepcion que excede pendiente falla | PASS | Error esperado por exceso |
| 29 | Recepcion impacta stock correctamente | PASS | Stock incrementado |
| 30 | Recepcion impacta caja o CxP segun pago | PASS | `COMPRA` en caja y `CARGO` en CxP |

Resumen global:
- Total: 30
- PASS: 30
- FAIL: 0

## 4. Resultados observados
- La integridad de negocio del nucleo local queda reforzada y consistente con Bloque 1.
- Los flujos sensibles ahora requieren autorizacion admin donde corresponde.
- Las compensaciones en anulacion y devolucion operan de forma transaccional y auditable.
- Caja cierra con reglas de responsable y diferencia coherentes con una sola caja fisica.
- Compras/recepcion reducen riesgo de inconsistencias operativas y fortalecen enlace con factura.

## 5. Riesgos pendientes
- Endurecer seguridad de autorizaciones sensibles (politica de intentos fallidos, bloqueo temporal, controles adicionales de sesion local).
- Agregar constraints SQL adicionales para reforzar reglas que hoy viven en capa servicio.
- Extender cobertura automatizada a mas rutas y a pruebas de API HTTP/end-to-end de desktop.
- Revisar permisos sensibles fuera del alcance de Bloque 2 para mantener criterio uniforme.

## 6. Recomendacion de pase al siguiente bloque
Se recomienda **aprobar pase al Bloque 3**.  
El Bloque 2 cumple su objetivo: los flujos nucleares criticos del POS local quedan estables, transaccionales y auditables para operacion real en una sola PC/una sola caja con SQLite offline-first.
