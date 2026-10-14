# Ejecución autorizada · 14 octubre 2026

Mandato: Notion 24, ejecución A+B+C+D. Rama `codex/authorized-delivery-oct14`, base staging `bb2108698865399047e970d0d07528ee9f3579a5`. No apertura comercial autorizada. Histórico de auditoría conservado sin incorporarlo automáticamente al repositorio público.

| Bloque | Estado comprobado | Evidencia | Siguiente paso |
|---|---|---|---|
| A · OVH | Recursos aislados creados; staging PostgreSQL privado sano, migraciones originales y0003 aplicadas. Vercel desconectado de Git; Railway autodeploy desactivado, volumen conservado. | infra/DEPLOYMENT_STATE.md; Docker build check | Imagen exacta, deploy y HTTPS |
| B · Datos | Adaptador seguro y fuente canónica implementados. Archivo autorizado conciliado y persistido en OVH:31 libros,248 turnos,2813.25m,1280h. Reimportación real idempotente comprobada. | packages/import;14 comprobaciones PostgreSQL locales con rol no-owner/no-superuser/no-bypass; scripts/staging-intake.ts | Verificar recorrido HTTPS desplegado |
| C · Advisor | Motor V2,58 pruebas matemáticas/historial, escenarios, comparación y decisión persistida implementados. E2E verifica decisión+escenario tras recarga y en reporte. No modelo físico/cliente validado. | packages/domain/{rop-model,crown-history};components/rop-scenario; scripts/operational-e2e.spec.ts | Verificación HTTPS con datos privados |
| D · Pruebas/transición |143 unitarias PASS, lint/typecheck/build PASS,14 comprobaciones PostgreSQL PASS y E2E producción local PASS; cero vulnerabilidades conocidas de dependencias productivas. Backup real R2 restaurado y conciliado en28tablas. | CI push38645423379 y PR38645430543 SUCCESS; imagen38645423397 SUCCESS | Despliegue serial y cierre de transición |

## Candidato verificado

SHA `d9fe81425d1d205f0ba7f36b98a069e02f2db9d2`, [PR#2](https://github.com/georgenton/drillops-intelligence/pull/2) contra staging. Índice de imagen `ghcr.io/georgenton/drillops-intelligence@sha256:c508382592e43b2f7476b5be6c36cd2e7e49507cd81c41e1f7c89d3fcd6f9b3b`. No se ha fusionado PR#1 ni alterado main.

E2E local: login individual, importación y reimportación, corrección auditada, KPIs consistentes en dashboard/reporte/asistente, filtros persistentes, coronas, escenario, decisión recargada, reporte imprimible, acceso denegado por perfil y empresa, desktop/móvil sin errores de consola. Pruebas adicionales confirman DB no disponible sin seed y producción cerrada.

R2: credenciales de objetos distintas y limitadas a un bucket; seis intentos cruzados denegados403. Bases: seis conexiones cruzadas denegadas28P01. Backups diarios separados; retención14d configurada, envejecimiento y primera ejecución programada todavía por observar.

## Decisiones técnicas

- Fuente privada única: `operational_shifts` JSONB tipado, tenant+clave lógica, revisiones auditadas y transacciones. Se conserva el esquema histórico sin migrar sus datos automáticamente ni mezclarlo en el recorrido privado. Las entidades operacionales se representan por códigos originales, no relaciones inventadas a catálogo demo.
- Sesiones individuales opacas y revocables en DB; producción cerrada por servidor. Demo sólo lectura con tenant sintético separado; interfaz legado preservada en código pero no servida para evitar exponer constantes históricas privadas. Endpoints v1 retirados explícitamente410, no fallback silencioso.
- ROP utiliza pares metros/horas conocidos; totales independientes muestran cobertura. Corrección manual conserva profundidades originales y auditoría; nueva importación que colisiona con corrección manual se revierte y exige revisión explícita.
- Survey, sensores, intervalos3m, stock/costos sin fuente verificada muestran ausencia, no datos históricos de otra campaña. No se declara cierre completo de módulos secundarios.
- Referencias documentales/skills: Notion spec-to-implementation para trazabilidad; React best practices para ciclo de datos, accesibilidad y consistencia del componente; spreadsheet skill para lectura segura por el agente de datos.

## Límites pendientes

No hay aceptación operacional del cliente, modelo de desgaste validado ni apertura comercial. No borrar Railway/Vercel/dumps sin aceptación del corte/retención. Modelo ROP del cliente pendiente de episodios comparables y evidencia independiente.
