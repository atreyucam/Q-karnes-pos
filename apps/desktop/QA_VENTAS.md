# QA Ventas - Qkarnes POS Desktop

## Preparacion
1. `cd apps/api`
2. `npm i`
3. `npm run migrate`
4. `npm run seed`
5. `npm run dev`
6. `cd ../desktop`
7. `npm i`
8. `npm run dev`

## Casos obligatorios
1. Consumidor final: venta contado con descuento
- Abrir `Nueva venta`.
- Dejar cliente en `Consumidor final`.
- Agregar productos al carrito, editar precio unitario.
- Colocar descuento y contado (credito en 0).
- Guardar y verificar respuesta ok.

2. Consumidor final: intentar credito
- Sin seleccionar cliente, intentar poner credito > 0.
- Validar que UI lo bloquea (input credito deshabilitado).
- Forzar payload con credito en consola/API y verificar backend: `Consumidor final no puede generar crédito`.

3. Venta LB: cantidad decimal + precio editable
- Agregar producto `LB`.
- Usar cantidad decimal (ej. 1.250).
- Editar `P.unit` en carrito.
- Guardar venta y verificar totales.

4. Venta UND: cantidad entera + precio editable
- Agregar producto `UND`.
- Intentar decimal en cantidad y validar rechazo/normalizacion.
- Guardar con cantidad entera.

5. Modal Factura: buscar y seleccionar cliente
- En `Nueva venta`, click `Factura`.
- Buscar por texto.
- Seleccionar cliente activo en tabla.
- Verificar que cambia de `Consumidor final` a cliente seleccionado.

6. Crear cliente en modal y seleccionar
- Abrir modal `Factura`.
- Click `Agregar cliente`.
- Crear cliente nuevo.
- Verificar que queda seleccionado automaticamente.

7. Cliente: venta credito
- Seleccionar cliente activo.
- Contado 0, credito = total.
- Guardar y verificar creación de CxC (cargo).

8. Cliente: venta mixto
- Seleccionar cliente activo.
- Contado + credito = total.
- Guardar y verificar pagos mixtos.

9. Stock insuficiente
- Intentar vender cantidad mayor a stock.
- Validar bloqueo en UI o rechazo backend `Stock insuficiente`.

10. Verificar inventario
- Revisar stock del producto antes y despues de vender.
- Validar que baja correctamente.
- Confirmar que nunca queda stock negativo.
