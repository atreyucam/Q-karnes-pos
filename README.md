# Auditoría Técnica del Sistema

## Descripción
Auditoría técnica integral del monorepo `Qkarnes POS` para evaluar arquitectura, calidad de código, seguridad, base de datos, escalabilidad, mantenibilidad, DevOps y preparación real para crecimiento.

## Estado General del Sistema
El sistema está en estado **MVP funcional**: tiene cobertura de módulos operativos (ventas, caja, compras, inventario, clientes, proveedores y reportes), pero con deuda técnica y riesgos estructurales que impiden considerarlo listo para escalar o producción exigente.

Diagnóstico ejecutivo:
- Funcionalmente usable para pruebas/controlado.
- Arquitectura parcialmente ordenada en backend, pero inconsistente en frontend.
- Seguridad base implementada, pero sin endurecimiento.
- Modelo de datos con decisiones frágiles para crecimiento.
- Sin testing automatizado ni pipeline operativo.

## Stack Tecnológico
- Backend: Node.js, Express, Knex, SQLite (`better-sqlite3`), Zod, JWT, bcrypt.
- Frontend: React, React Router, Zustand, Axios, Tailwind.
- Desktop: Electron + Vite.
- Persistencia: archivo local SQLite (`apps/api/data/qkarnes.sqlite`).

## Arquitectura Actual
- Monorepo con dos aplicaciones:
  - `apps/api` (API REST por módulos).
  - `apps/desktop` (cliente React/Electron).
- Backend organizado por dominio (`controller/service/repository`) con transacciones en flujos críticos.
- Frontend orientado por páginas y stores, pero con mezcla de responsabilidades (UI + reglas de negocio + llamadas API directas).
- Sin capa compartida de contratos ni validaciones end-to-end.

## Estado por Módulos
| Módulo | Estado | Observaciones |
|---|---|---|
| Auth | Parcial | Login/me operativo; sin refresh/revocación/rate-limit. |
| Caja | Crítico | Fórmula de cierre inconsistente y control de permisos débil. |
| Ventas | Crítico | Flujo principal existe, pero con riesgo de inconsistencia de stock/estado. |
| Compras | Parcial | Flujo operativo; validaciones y modelo de factura débiles. |
| Inventario | Parcial | Operaciones base disponibles; UX y flujo de conteos incompletos. |
| Clientes/CxC | Parcial | Gestión funcional; acoplamiento y faltas de trazabilidad/caja. |
| Proveedores/CxP | Parcial | Gestión funcional; modelo de deuda y consultas pesadas. |
| Reportes | Parcial | Dashboard útil, pero sin paginación ni estrategia de volumen. |
| Auditoría | Parcial | Registro básico de eventos sin contexto de actor/diffs robustos. |
| Testing | Crítico | No hay pruebas automatizadas. |
| DevOps/CI/CD | Crítico | Sin Docker, sin CI/CD, sin observabilidad ni backups formales. |

## Hallazgos Principales
- Caja:
  - Cualquier usuario autenticado puede abrir/cerrar turno.
  - El cálculo de efectivo esperado solo considera ventas contado e ingresos/egresos manuales; ignora compras/devoluciones registradas en caja.
- Ventas:
  - Se permite editar estado de venta directamente (`ANULADA`, `DEVUELTA_*`) sin compensaciones contables/inventario.
  - El cálculo de stock por ítem no consolida repetidos del mismo producto en una misma venta.
- Base de datos:
  - `compras_recepciones.factura_id` es string y no FK real a `compras_facturas.id`.
  - Existen columnas legado duplicadas (`unidad`/`unidad_medida`, `precio_venta`/`precio_referencia`).
  - Casi no hay índices (solo dos explícitos en productos).
- Seguridad:
  - `JWT_SECRET` tiene valor por defecto conocido.
  - CORS abierto sin política explícita de orígenes.
  - Token persistido en `localStorage`.
- Frontend:
  - Páginas de muy alto tamaño y complejidad.
  - Manejo de errores y retornos inconsistente entre stores.
  - Hay llamadas API directas en páginas, rompiendo patrón de stores.
- Escalabilidad:
  - SQLite local limita concurrencia real y escalado horizontal.
  - Consultas de saldo/credito usan subconsultas costosas por fila.
  - Reportes cargan datasets completos en cliente.

## Riesgos Técnicos
- Críticos:
  - Inconsistencias financieras/caja por cierres incorrectos.
  - Inconsistencias de inventario/estado de venta por edición manual sin reglas de compensación.
  - Ausencia total de pruebas automatizadas.
  - Controles de acceso insuficientes en endpoints sensibles.
- Altos:
  - Modelo relacional frágil para facturación y CxP/CxC.
  - Deuda de mantenibilidad en frontend por componentes monolíticos.
  - Falta de observabilidad y automatización de despliegue.

## Evaluación de Escalabilidad
Estado actual: **No preparado para crecimiento sostenido**.

Motivos:
- Persistencia local SQLite sin estrategia multiusuario robusta.
- Arquitectura de frontend con alto acoplamiento y baja modularidad.
- Endpoints críticos sin diseño consistente de paginación/contratos.
- Ausencia de testing y pipeline de calidad impide iteración segura.

## Recomendaciones Prioritarias
1. Bloquear edición de estado de ventas sin flujo transaccional de reversos.
2. Corregir lógica de caja (incluir compras/devoluciones en esperado).
3. Endurecer autorización por endpoint sensible (caja, reportes, auditoría).
4. Eliminar secretos por defecto y formalizar configuración por entorno.
5. Estandarizar contratos API de respuesta y errores.
6. Refactorizar frontend por feature slices y hooks de dominio.
7. Migrar modelo de facturas a FK real y normalización consistente.
8. Definir suite mínima de pruebas (servicios críticos + e2e happy paths).
9. Implementar pipeline CI con lint, tests y verificación de migraciones.
10. Diseñar plan de migración de SQLite a motor cliente-servidor (PostgreSQL/MySQL).

## Roadmap de Corrección
- Fase 1 (Crítico):
  - Seguridad mínima, permisos estrictos, fixes de caja/ventas, controles de integridad.
- Fase 2 (Estructural):
  - Refactor de frontend/back, contratos API uniformes, reducción de deuda.
- Fase 3 (Escalabilidad):
  - Índices, paginación real, optimización de consultas, base de datos robusta.
- Fase 4 (Operación):
  - CI/CD, observabilidad, backups, hardening de producción y pruebas completas.

## Conclusión
El sistema **no está listo para escalar ni para producción exigente**. Tiene base funcional valiosa, pero requiere correcciones críticas de consistencia, seguridad, arquitectura y operación antes de continuar agregando funcionalidades de negocio.
