# BLOQUE 1 — Definición funcional y técnica del POS local

## 1. Objetivo del bloque
Definir formalmente como debe operar este POS local (desktop, una PC, una caja, offline-first), usando el codigo real del proyecto como base de ingenieria.  
Este bloque fija reglas funcionales, invariantes y flujos transaccionales para que los siguientes bloques implementen correcciones sin ambiguedad.

## 2. Contexto real del producto
Contexto aplicado en esta definicion:
- POS de carniceria.
- App desktop con Electron.
- Operacion actual en una sola PC y una sola caja.
- Modo offline-first.
- Fuente de verdad principal: datos locales.
- Base local SQLite por diseno intencional.
- Sin multisucursal y sin multicaja en esta etapa.
- Sin app web en esta etapa.
- VPS/remoto: etapa futura, no foco actual.

Alcance de esta definicion:
- Se prioriza continuidad operativa local: ventas, caja, inventario, compras, seguridad local, integridad de datos y trazabilidad.

## 3. Arquitectura local del POS

### 3.1 Rol de Electron
- Contenedor desktop de la UI React/Vite.
- Provee experiencia de operacion local de caja/mostrador.
- Configuracion actual valida para baseline local: `contextIsolation: true`, `nodeIntegration: false`.
- En desarrollo carga UI en `http://127.0.0.1:5173`; en produccion carga `dist/index.html`.

### 3.2 Rol de la API local (Node.js/Express)
- Encapsula reglas de dominio y validaciones de negocio.
- Expone endpoints REST para auth, ventas, caja, inventario, compras, clientes, proveedores, reportes, categorias, productos y cxp.
- Gestiona transacciones de negocio en servicios criticos con Knex.
- Ejecuta logica local sin requerir backend remoto para operar.

### 3.3 Rol de SQLite
- Persistencia local principal del POS.
- Almacena entidades de negocio y trazas (ventas, pagos, caja, inventario, compras, cxc/cxp, auditoria).
- `foreign_keys = ON` configurado en Knex.
- Debe tratarse como base operativa de produccion local, no como cache temporal.

### 3.4 Interaccion entre componentes
Flujo operativo actual:
1. Usuario opera UI en Electron.
2. UI llama API local en `localhost:4100`.
3. API aplica reglas de dominio.
4. API confirma cambios en SQLite dentro de transacciones cuando aplica.
5. UI refleja estado confirmado por API.

### 3.5 Fuente de verdad y definicion offline-first
- Fuente de verdad operativa: SQLite local.
- Offline-first en este proyecto significa:
  - El negocio principal (vender, cobrar, abrir/cerrar caja, mover stock, recepcionar compras) no depende de internet.
  - Las decisiones de negocio se validan localmente en API+SQLite.
  - Integraciones remotas futuras (backup/update/sync) no deben romper autonomia local.

## 4. Mapa de módulos del sistema
| Modulo | Proposito | Criticidad | Dependencias principales |
|---|---|---|---|
| Autenticacion | Login, sesion, identidad y rol del usuario | Critica | `usuarios`, `roles`, JWT, middleware `authenticate` |
| Ventas | Emitir ventas, pagos, devoluciones, estado de venta | Critica | `ventas`, `venta_detalle`, `venta_pagos`, `productos`, `caja_turnos`, `caja_movimientos`, `cxc_movimientos`, auditoria |
| Caja | Apertura/cierre de turno, corte X/Z, movimientos manuales | Critica | `caja_turnos`, `caja_movimientos`, pagos de ventas, compras contado, devoluciones |
| Inventario | Stock disponible, alertas, ajustes, conteos, mermas | Critica | `productos`, `inventario_movimientos`, `inventario_conteos`, `mermas` |
| Compras | Ordenes, recepciones, facturas, costo promedio | Critica | `compras_ordenes`, `compras_recepciones`, `compras_facturas`, `productos`, `inventario_movimientos`, `cxp_movimientos`, `caja_movimientos` |
| Clientes | Maestro de clientes y cartera CxC | Alta | `clientes`, `cxc_movimientos`, `ventas` |
| Proveedores | Maestro de proveedores, facturas y CxP | Alta | `proveedores`, `compras_facturas`, `compras_recepciones`, `cxp_movimientos` |
| Reportes | Lectura de KPIs y listados operativos | Alta | ventas, caja, inventario, compras, cxc |
| Auditoria | Registro de eventos de negocio | Alta | `auditoria_eventos`, servicios de dominio |
| Catalogo (categorias/productos) | Estructura de productos operables | Alta | `categorias`, `productos`, inventario, compras, ventas |

## 5. Reglas funcionales del negocio

### 5.1 Ventas
Reglas obligatorias:
1. Toda venta debe tener al menos un item valido.
2. Cada item vendido debe validar existencia, estado activo y stock suficiente antes de confirmar.
3. Metodo de pago debe cuadrar exactamente con total (`contado + credito = total`).
4. Consumidor final no puede generar credito.
5. Venta con componente contado requiere turno de caja abierto.
6. Venta debe registrar trazas de impacto:
   - salida de inventario,
   - movimiento de caja si hubo contado,
   - movimiento CxC si hubo credito.
7. El usuario responsable de la venta debe ser el usuario autenticado de sesion (regla de dominio); no debe ser editable desde payload externo.

Estado actual en codigo:
- Reglas 1-6: parcialmente implementadas.
- Regla 7: contradiccion actual (se acepta `usuario_id` en payload si se envia).

### 5.2 Anulacion de venta
Regla objetivo del dominio (definicion formal):
1. Anular una venta no puede ser solo cambiar estado.
2. Debe ejecutar compensaciones consistentes segun pagos e items:
   - revertir stock,
   - revertir caja (si hubo contado),
   - revertir CxC (si hubo credito),
   - dejar evento de auditoria completo.
3. Debe impedir doble compensacion o anulacion de estados incompatibles.

Estado actual en codigo:
- Existe endpoint de edicion de estado (`/ventas/:id/editar`) que permite `ANULADA` sin flujo de compensacion explicito.  
- Se considera vacio critico para bloques siguientes.

### 5.3 Devolucion
Reglas obligatorias:
1. Solo puede devolverse cantidad no devuelta previamente por detalle.
2. No puede exceder cantidad vendida por linea.
3. Debe reingresar inventario.
4. Si hay devolucion en efectivo debe impactar caja.
5. Si hay devolucion a credito debe impactar CxC.
6. Debe actualizar estado de venta a parcial o total segun devolucion acumulada.
7. Debe dejar auditoria.

Estado actual en codigo:
- Flujo principal implementado con transaccion y validaciones de cantidad.

### 5.4 Caja
Reglas obligatorias:
1. Solo puede existir un turno abierto en el sistema actual (una caja).
2. No se puede abrir turno si ya existe uno abierto.
3. Todo movimiento de caja debe quedar registrado (ingreso, egreso, venta, compra, devolucion).
4. Corte X/Z debe calcular efectivo esperado con todos los movimientos que afectan efectivo real.
5. Cierre con diferencia debe requerir observacion.
6. Operaciones sensibles de caja deben quedar restringidas por rol.

Estado actual en codigo:
- 1,2,5 implementadas.
- 3 implementada en varios flujos, pero distribuida.
- 4 contradiccion actual: esperado usa ventas contado + manuales; no incorpora explicitamente compras/devoluciones ya registradas.
- 6 contradiccion actual: rutas de caja exigen autenticacion, pero no autorizacion por rol.

### 5.5 Inventario
Reglas obligatorias:
1. Ninguna operacion puede dejar stock negativo.
2. Conteo solo se aplica una vez desde estado BORRADOR.
3. Ajustes y mermas deben generar movimiento de inventario trazable.
4. Todo impacto de ventas/devoluciones/compras debe quedar reflejado en inventario_movimientos.

Estado actual en codigo:
- Reglas principales implementadas, con validaciones de stock negativo en conteo/ajuste/merma.

### 5.6 Compras y recepcion
Reglas obligatorias:
1. Recepcion no puede exceder pendiente por detalle de orden.
2. Recepcion debe actualizar stock y costo promedio del producto.
3. Factura contado debe impactar caja.
4. Factura credito debe impactar CxP.
5. Estado de orden debe pasar por ABIERTA/PARCIAL/COMPLETA de forma coherente.
6. Relacion recepcion-factura debe ser referencial fuerte para evitar ambiguedad.

Estado actual en codigo:
- 1,2,3,4,5 implementadas parcialmente.
- 6 contradiccion actual: en `compras_recepciones` se guarda `factura_id` como texto (`numero_factura`), no FK fuerte a `compras_facturas.id`.

### 5.7 Autenticacion y usuarios
Reglas obligatorias:
1. Toda accion de negocio requiere usuario autenticado.
2. Operaciones sensibles deben validar rol en backend.
3. Identidad operativa (actor) debe quedar trazada en eventos criticos.
4. Secretos de autenticacion deben ser de entorno, no defaults conocidos en productivo.

Estado actual en codigo:
- 1 implementada por middleware en modulos.
- 2 implementada en varios modulos, pero faltante en caja/reportes.
- 3 parcial (auditoria no guarda actor explicitamente en evento).
- 4 contradiccion actual (`JWT_SECRET` tiene default conocido).

### 5.8 Reportes y auditoria
Reglas obligatorias:
1. Reportes deben leer informacion consistente del estado operativo local.
2. Reportes no deben permitir acciones mutables.
3. Auditoria debe cubrir eventos sensibles de caja, ventas, compras, inventario.
4. Auditoria debe poder reconstruir actor, accion, entidad y contexto.

Estado actual en codigo:
- 1 y 2: aplican por diseno (solo lecturas en reportes).
- 3: cubierto parcialmente.
- 4: parcial por ausencia de actor dedicado en `auditoria_eventos`.

## 6. Invariantes del sistema
Invariantes estrictas del dominio local:
1. Una venta confirmada nunca puede dejar stock inconsistente.
2. Ninguna operacion puede dejar stock negativo.
3. Toda devolucion debe compensar stock y flujo financiero (caja o CxC) de forma coherente.
4. Una anulacion de venta no puede resolverse como cambio de estado aislado.
5. Una recepcion no puede exceder lo pendiente de la orden.
6. Caja solo admite un turno abierto en el contexto actual (una caja).
7. Todo movimiento que afecta efectivo debe quedar trazado en caja_movimientos.
8. Todo movimiento que afecta stock debe quedar trazado en inventario_movimientos.
9. El usuario responsable de una operacion debe provenir de la sesion autenticada.
10. Operaciones sensibles deben estar protegidas por autenticacion y autorizacion.
11. Integridad local primero: la escritura en SQLite es la confirmacion oficial del negocio.
12. Sin conexion remota, el sistema debe seguir operando para las funciones nucleares.

## 7. Flujos obligatoriamente transaccionales
Flujos que deben confirmarse de forma atomica (todo o nada):

1. Venta
- Motivo: involucra venta, detalle, pagos, stock, inventario_movimientos, caja y/o CxC.
- Si falla una parte, no debe quedar venta parcial.

2. Devolucion
- Motivo: involucra devolucion, detalle, reingreso stock, inventario_movimientos, caja/CxC, estado de venta.
- Debe garantizar consistencia completa.

3. Anulacion de venta (definicion objetivo)
- Motivo: requiere compensar varios subsistemas.
- Sin transaccion puede quedar estado anulado con impactos financieros o de stock sin revertir.

4. Recepcion de compra
- Motivo: involucra avance de detalle orden, stock/costo promedio, factura, caja/CxP, inventario_movimientos, estado de orden.

5. Ajustes de inventario (masivo, conteo aplicado, merma)
- Motivo: actualiza stock y genera trazas de inventario asociadas.

6. Cierre de caja (corte Z)
- Motivo: fija estado final del turno, conteo real, diferencia y auditoria.
- No debe cerrar sin consistencia de datos y trazabilidad.

Nota de estado actual:
- Venta, devolucion, recepcion, ajustes y corte Z ya usan transacciones en servicios.
- Anulacion formal transaccional no esta implementada como flujo de dominio; queda para bloque siguiente.

## 8. Decisiones actuales correctas del proyecto
Decisiones ya alineadas al objetivo real:
1. Arquitectura local Electron + API local + SQLite.
2. Modularizacion backend por dominio (controller/service/repository).
3. Uso de transacciones en varios flujos de negocio criticos.
4. Restriccion de turno unico abierta, coherente con una sola caja.
5. Uso de `foreign_keys = ON` en SQLite.
6. Baseline de seguridad Electron razonable (`contextIsolation`, `nodeIntegration` off).
7. Cobertura funcional amplia del dominio POS local (ventas, caja, inventario, compras, cxc/cxp, reportes).

## 9. Contradicciones, vacíos y puntos a corregir en bloques posteriores
Lista priorizada:

1. Critico - Anulacion de venta no modelada como flujo compensatorio transaccional.
2. Critico - Caja calcula efectivo esperado sin consolidar todos los tipos que impactan efectivo real.
3. Critico - Caja carece de autorizacion por rol en backend.
4. Critico - Venta acepta `usuario_id` en payload; puede romper trazabilidad de actor.
5. Alto - Recepcion/factura ligada por string (`numero_factura`) en vez de FK fuerte.
6. Alto - Inconsistencia potencial de stock en ventas con items repetidos del mismo producto en un mismo payload.
7. Alto - Reportes sin restriccion por rol (solo autenticacion).
8. Alto - Auditoria_eventos no guarda actor explicitamente.
9. Alto - Token en localStorage y secreto JWT con default conocido para entorno productivo.
10. Medio - Contrato de respuestas API no uniforme entre modulos.
11. Medio - Frontend con paginas muy grandes y mezcla de UI + negocio + llamadas directas.
12. Medio - Falta de pruebas automatizadas de flujo critico.

## 10. Definición de prioridades para los siguientes bloques
Secuencia recomendada:

1. Bloque 2 - Integridad de negocio critica
- Anulacion compensatoria transaccional.
- Correccion de invariantes de venta/stock (actor y repetidos).
- Correccion de formula de caja y reglas de cierre.

2. Bloque 3 - Seguridad operacional local
- Endurecer autorizacion de rutas sensibles (caja/reportes).
- Ajustar gestion de secretos y sesion para entorno de escritorio.
- Mejorar trazabilidad de actor en auditoria.

3. Bloque 4 - Integridad de datos SQLite
- Normalizar relaciones factura/recepcion.
- Cerrar vacios de constraints e indices operativos.
- Preparar politica local de backup/recuperacion.

4. Bloque 5 - Calidad tecnica y test de regresion
- Definir suite de pruebas de flujos nucleares.
- Estandarizar contratos API.
- Reducir complejidad accidental en frontend critico.

## 11. Conclusión técnica del bloque
El proyecto tiene una base arquitectonica correcta para su objetivo real de POS local desktop offline-first.  
El nucleo del producto ya existe y es operable, pero todavia convive con contradicciones de dominio criticas que pueden afectar caja, stock y trazabilidad.

Este Bloque 1 deja definida la referencia formal de operacion del POS local: arquitectura, reglas, invariantes y flujos transaccionales.  
Con esta definicion, los siguientes bloques deben enfocarse en cerrar contradicciones de integridad antes de expandir alcance remoto o funcional.
