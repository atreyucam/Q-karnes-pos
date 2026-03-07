# REAUDITORIA TECNICA CONTEXTUAL FINAL

## 1. Resumen ejecutivo
- Estado real del sistema: MVP funcional con cobertura amplia de dominio POS (ventas, caja, inventario, compras, clientes, proveedores, reportes), pero con brechas criticas de integridad operativa en flujos clave.
- Conclusion general: La base tecnica si sirve para un POS desktop local offline-first, pero todavia no es suficientemente solida para operacion confiable diaria sin corregir primero caja/ventas/compras/integridad local.
- Nivel de madurez tecnica: **MVP avanzado** (funcionalmente amplio) con **madurez de confiabilidad media-baja**.
- Alineacion con objetivo real: **Buena direccion arquitectonica** (Electron + API local + SQLite), con **errores de implementacion** en reglas transaccionales y control de acceso que hoy son el principal riesgo.

## 2. Contexto correcto del producto
Esta reauditoria fue evaluada bajo el contexto correcto:
- POS desktop para carniceria.
- Electron como cliente.
- Operacion en una sola PC y una sola caja.
- Modelo offline-first real.
- SQLite local como decision intencional.
- Sin app web operativa.
- Sin multisucursal ni multicaja por ahora.
- VPS/sincronizacion como etapa posterior, no prioridad actual.

## 3. Correccion de enfoque respecto a auditorias previas
- Observaciones previas que siguen siendo validas:
  - Riesgos en caja, ventas, seguridad y pruebas siguen siendo reales.
  - Deuda de mantenibilidad frontend/backend sigue siendo real.
  - Modelo de compras/facturas y algunas relaciones de datos siguen siendo fragiles.
- Observaciones previas que deben reinterpretarse:
  - La critica por “no escalar cloud/horizontal” baja de prioridad en este contexto.
  - No tener multiusuario concurrente empresarial no es defecto principal hoy.
  - SQLite no es un problema por si mismo; el problema es **como se endurece y usa**.
- Cosas que ya no son prioritarias ahora:
  - Migracion inmediata a PostgreSQL/MySQL.
  - Arquitectura distribuida y sincronizacion compleja.
  - Plataforma SaaS web multi-sucursal.

## 4. Evaluacion del sistema segun su objetivo real
- ¿Esta bien orientado como POS local?: **Si, en arquitectura base**.
- ¿SQLite tiene sentido aqui?: **Si**, totalmente razonable para una sola PC/caja offline-first.
- ¿Electron tiene sentido aqui?: **Si**, para operacion local de mostrador.
- ¿La arquitectura actual acompaña o estorba el objetivo?: **Acompaña en estructura**, pero hoy **estorban** errores puntuales de integridad y permisos.

Evaluacion corta por pregunta:
- 1) Que tan bien construido para su objetivo real: **6.5/10** (buena base, confiabilidad critica pendiente).
- 2) Que cambia respecto a enfoque anterior: se reduce prioridad de escalabilidad cloud y sube prioridad de robustez local.
- 3) Problemas criticos reales: caja, stock, permisos sensibles, trazabilidad, pruebas.
- 4) No prioritario aun: multisucursal, multicaja, sync avanzada, arquitectura remota.
- 5) Riesgos operativos locales: cierres de caja incorrectos, stock inconsistente, cambios de estado sin compensacion, perdida/corrupcion local sin estrategia.
- 6) Que corregir primero: integridad transaccional de caja/ventas/compras + seguridad endpoint + pruebas criticas.
- 7) SQLite en este caso: correcta decision, pero falta endurecimiento operativo.
- 8) Arquitectura actual: valida como base local, necesita hardening y limpieza de deuda.
- 9) Roadmap antes de VPS: estabilizar nucleo local, endurecer, volver instalable, luego preparar capa remota.

## 5. Estado por areas

### 5.1 Arquitectura
- Estado: Bueno como base de producto local (monorepo `apps/api` + `apps/desktop`, backend modular controller/service/repository).
- Hallazgos:
  - Separacion por dominios en backend esta bien planteada.
  - Desktop y API local estan desacoplados en runtime (URL fija `http://localhost:4100`), con arranque manual separado.
  - Frontend mezcla vistas con logica de negocio y llamadas API directas.
- Criticidad: Alta.
- Impacto: Mayor costo de mantenimiento y mayor probabilidad de regresiones en cambios funcionales.
- Recomendacion: Consolidar capa de servicios frontend, definir contrato de respuesta uniforme y preparar un arranque integrado desktop+API para instalacion local.

### 5.2 Ventas
- Estado: Funcional, pero con fallas de integridad importantes.
- Hallazgos:
  - Riesgo de stock inconsistente cuando entran items repetidos del mismo producto en la misma venta (calculo de stock por item usando stock original).
  - Se permite `usuario_id` en payload de venta; puede atribuir ventas a otro usuario.
  - Endpoint de edicion permite cambiar estado de venta (`ANULADA`, `DEVUELTA_*`) sin flujo obligatorio de compensacion contable/inventario/caja.
  - Devoluciones estan transaccionadas y con validaciones de cantidad devuelta por detalle.
- Criticidad: Critica.
- Impacto: Posibles diferencias de stock, trazabilidad alterable de vendedor y distorsion de estado de documentos.
- Recomendacion:
  - Bloquear `usuario_id` externo y tomar siempre `req.user.id`.
  - Consolidar items por `producto_id` en backend antes de validar/actualizar stock.
  - Reemplazar “editar estado libre” por comandos de dominio transaccionales (anular/devolver con compensaciones obligatorias).

### 5.3 Caja
- Estado: Operativa, pero con logica de cierre incompleta y controles debiles.
- Hallazgos:
  - Calculo de efectivo esperado considera ventas contado + manuales, pero ignora movimientos `COMPRA` y `DEVOLUCION` ya registrados en caja.
  - Endpoints de caja solo requieren autenticacion, sin `authorizeRoles` en backend.
  - Movimientos manuales/cortes usan turno abierto global; no hay restriccion fuerte por rol ni por propietario del turno.
  - Se fuerza un solo turno abierto global, lo cual si es coherente con “una sola caja”.
- Criticidad: Critica.
- Impacto: Cortes X/Z con cifras no confiables y riesgo de manipulacion operativa por usuarios no autorizados.
- Recomendacion:
  - Recalcular esperado con todos los tipos que impactan efectivo real.
  - Restringir endpoints de caja por rol (`ADMIN`, `CAJERO`) en backend.
  - Definir politica clara de turno unico y usuario responsable.

### 5.4 Inventario
- Estado: Cobertura funcional amplia (alertas, mermas, ajustes, conteos).
- Hallazgos:
  - Buen uso de transacciones y bloqueo de stock negativo en operaciones clave.
  - UX muy dependiente de ingreso manual por ID en varias acciones (alto riesgo operativo humano).
  - Inventario page concentra demasiada responsabilidad en una sola pantalla.
- Criticidad: Alta.
- Impacto: Errores de operador y dificultad de evolucionar/reusar logica.
- Recomendacion: Mejorar UX de seleccion por busqueda/listado, dividir flujos en componentes/steps y agregar validaciones de dominio para evitar cargas ambiguas.

### 5.5 Compras
- Estado: Flujo principal existe, pero con fragilidades de integridad.
- Hallazgos:
  - `compras_recepciones.factura_id` es string y no FK real a `compras_facturas.id`.
  - Varias consultas unen por `numero_factura` (texto), vulnerable a choques de numeracion.
  - Recepcionar orden valida “no COMPLETA”, pero no bloquea estados no permitidos como `CANCELADA`.
  - Si payload trae `orden_detalle_id` repetido, el calculo de pendiente/recibido puede quedar inconsistente.
- Criticidad: Critica.
- Impacto: Riesgo de CxP mal calculada, recepciones mal aplicadas y trazabilidad de factura fragil.
- Recomendacion:
  - Migrar a relacion fuerte por `factura_id` numerico FK.
  - Hacer `numero_factura` unico por proveedor si aplica.
  - Bloquear recepcion en estados no recepcionables.
  - Rechazar IDs repetidos en items de recepcion.

### 5.6 Seguridad
- Estado: Base minima existente, endurecimiento insuficiente.
- Hallazgos:
  - `JWT_SECRET` tiene valor por defecto conocido.
  - CORS global abierto.
  - Token en `localStorage` del renderer.
  - Endpoints sensibles (caja, reportes) sin autorizacion por rol en backend.
  - Login demo precargado con credenciales conocidas en UI/seed.
  - Positivo: bcrypt, JWT, `contextIsolation: true`, `nodeIntegration: false`.
- Criticidad: Alta.
- Impacto: Superficie de abuso interno/local mayor a la necesaria.
- Recomendacion: Hacer secreto obligatorio por entorno, cerrar CORS, endurecer permisos backend y retirar defaults demo en build productivo.

### 5.7 Frontend desktop
- Estado: Funcional, pero con alta complejidad accidental.
- Hallazgos:
  - Paginas muy grandes (`NuevaVentaPage.jsx` ~578 lineas, `InventarioPage.jsx` ~398).
  - Llamadas API directas en paginas ademas de stores (patron inconsistente).
  - Manejo de errores heterogeneo entre stores/paginas.
  - `BrowserRouter` en Electron empaquetado puede complicar manejo de rutas/recargas.
- Criticidad: Alta.
- Impacto: Mantenimiento caro y mayor probabilidad de bugs por acoplamiento UI+negocio.
- Recomendacion: Refactor por feature slices, hooks de dominio y estandar de errores/respuestas.

### 5.8 Backend
- Estado: Estructura modular buena con deuda de consistencia.
- Hallazgos:
  - Uso extendido de transacciones en flujos criticos (fortaleza).
  - Contrato de respuesta inconsistente (a veces array plano, a veces `{ ok, data }`).
  - Algunos listados sin paginacion real de base de datos (carga completa y luego slice).
  - Faltan validaciones de dominio en varios bordes (duplicados, estados invalidos).
- Criticidad: Alta.
- Impacto: Integracion frontend mas fragil y riesgos de performance conforme crece historico.
- Recomendacion: Unificar contrato API y cerrar validaciones de invariantes de dominio en backend.

### 5.9 SQLite y persistencia local
- Estado: Decision correcta para el contexto, pero con hardening incompleto.
- Hallazgos:
  - SQLite es adecuada para una sola PC/caja.
  - `foreign_keys = ON` esta configurado.
  - En la base inspeccionada: `journal_mode = delete` (no WAL).
  - Muy pocos indices manuales para volumen historico (practicamente solo productos + uniques).
  - No se encontro estrategia automatizada de backup local/versionado/verificacion de integridad.
  - Ruta de DB por default es relativa (`./data/qkarnes.sqlite`), suficiente en dev pero no ideal para producto instalable.
- Criticidad: Alta.
- Impacto: Riesgo de degradacion con historico y mayor exposicion a perdida de datos por falla local sin rutina de respaldo.
- Recomendacion:
  - Activar WAL y politica de checkpoint.
  - Definir backup local automatico (rotacion y verificacion).
  - Mover DB a ruta de datos de usuario en instalacion (no carpeta de binario).
  - Agregar indices por FK y filtros frecuentes.

### 5.10 Testing
- Estado: Critico.
- Hallazgos:
  - No hay archivos de pruebas automatizadas.
  - No hay scripts `test` ni `lint` en `package.json`.
  - Solo hay checklist manual (`docs/QA.md`, `apps/desktop/QA_VENTAS.md`).
- Criticidad: Critica.
- Impacto: Alto riesgo de regresion en caja/ventas/stock al modificar codigo.
- Recomendacion: Suite minima inmediata de pruebas de servicios criticos y smoke API.

### 5.11 Mantenibilidad
- Estado: Media-baja.
- Hallazgos:
  - Archivos grandes y multifuncion en frontend.
  - Columnas legado/duplicadas en productos (`unidad`/`unidad_medida`, `precio_venta`/`precio_referencia`).
  - Utilidades sin uso aparente (`storeUtils`).
  - Convenciones de respuesta y errores no totalmente uniformes.
- Criticidad: Alta.
- Impacto: Cada cambio funcional tiene costo creciente y riesgo lateral.
- Recomendacion: Plan de refactor incremental por dominio y limpieza de legado de esquema/API.

### 5.12 Preparacion futura
- Estado: Base parcialmente apta.
- Hallazgos:
  - Modularizacion backend facilita evolucion futura.
  - Persistencia relacional local permite luego replicacion/sync, pero hoy faltan invariantes fuertes y trazabilidad de actor.
  - Acoplamiento de facturas por string y contratos API heterogeneos dificultarian sync limpio.
- Criticidad: Media-alta.
- Impacto: Si se salta a VPS sin estabilizar base local, se amplificaran inconsistencias.
- Recomendacion: Primero estabilizar dominio local; despues diseñar capa remota encima de invariantes ya robustos.

## 6. Problemas realmente criticos en este contexto
Prioridad sugerida (de mayor a menor):
1. Caja: formula de efectivo esperado incompleta respecto a movimientos reales de caja.
2. Seguridad de caja: endpoints sensibles sin autorizacion por rol en backend.
3. Ventas: integridad de stock vulnerable con items repetidos y `usuario_id` editable desde payload.
4. Ventas: cambio de estado por endpoint de edicion sin compensaciones obligatorias.
5. Compras: recepciones/facturas con enlace string y validaciones insuficientes de estado/duplicados.
6. SQLite operativa: falta de hardening (WAL + backup local + indices de historico).
7. Ausencia de pruebas automatizadas en flujos nucleares (venta, devolucion, recepcion, corte de caja).
8. Auditoria tecnica incompleta: eventos sin actor explicito persistido.

## 7. Problemas validos pero no prioritarios aun
- Multisucursal real.
- Multicaja concurrente.
- Sincronizacion avanzada bidireccional.
- Arquitectura distribuida/event-driven remota.
- Escalado horizontal cloud.
- Migracion inmediata fuera de SQLite.
- Panel web externo corporativo.

## 8. Fortalezas del sistema
- Decision de producto correcta: desktop local + offline-first + SQLite.
- Monorepo claro con separacion `apps/api` y `apps/desktop`.
- Backend por modulos de dominio con capas controller/service/repository.
- Uso amplio de transacciones en operaciones sensibles.
- Restriccion de un solo turno abierto global, alineada a “una sola caja”.
- Electron con baseline de seguridad aceptable (`contextIsolation` y `nodeIntegration` deshabilitado).
- Cobertura funcional ya amplia para operacion POS real.

## 9. Roadmap tecnico recomendado

### Fase 1: estabilizacion del sistema local
- Corregir invariantes de caja (esperado contra todos los movimientos efectivos).
- Endurecer permisos backend de caja y operaciones sensibles.
- Corregir invariantes de ventas/compras para evitar duplicados inconsistentes.
- Bloquear edicion libre de estado de venta y reemplazar por flujos transaccionales de dominio.
- Agregar pruebas automatizadas minimas de flujos criticos.

### Fase 2: endurecimiento tecnico
- Endurecer SQLite: WAL, checkpoints, indices de FK/filtros, backup local rotativo.
- Fortalecer seguridad: secreto obligatorio, CORS restringido, eliminar defaults demo en produccion.
- Unificar contrato API (`ok/data/error`) y estandar de errores.
- Mejorar trazabilidad de auditoria (actor, contexto y correlacion).

### Fase 3: calidad y producto instalable
- Integrar runtime desktop+API para instalacion local confiable.
- Definir ruta persistente de datos de usuario (no relativa de proyecto).
- Refactor de paginas monoliticas a componentes/hooks de dominio.
- Endurecer UX operacional para reducir errores manuales (IDs, validaciones y confirmaciones).

### Fase 4: preparacion para VPS/capa remota
- Definir modelo de identificadores y eventos preparado para sync.
- Normalizar entidades fragiles (factura/recepcion/CxP/CxC) antes de exponer remoto.
- Diseñar backup remoto y sincronizacion incremental sobre base local ya estable.
- Incorporar observabilidad minima para soporte remoto futuro.

## 10. Conclusion final
El sistema **si esta bien encaminado** para su objetivo real de POS local desktop offline-first con SQLite.  
La decision tecnologica principal es correcta para esta etapa.  
Lo que hoy impide llamarlo “solido y confiable” no es falta de nube ni falta de escalabilidad empresarial: son **errores concretos de integridad de negocio, permisos y robustez operativa local**.

Si se ejecuta el roadmap en orden (primero estabilizacion local, luego hardening, despues producto instalable), la base actual puede evolucionar bien sin rehacer todo y quedara lista para una futura capa remota cuando realmente sea necesaria.
