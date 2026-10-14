# Ejecución autorizada · 14 octubre 2026

Mandato: Notion 24, ejecución A+B+C+D. Rama `codex/authorized-delivery-oct14`, base staging `bb2108698865399047e970d0d07528ee9f3579a5`. No apertura comercial autorizada. Histórico de auditoría conservado sin incorporarlo automáticamente al repositorio público.

| Bloque | Estado comprobado | Evidencia | Siguiente paso |
|---|---|---|---|
| A · OVH | Recursos aislados creados; staging PostgreSQL privado sano, migraciones originales y0003 aplicadas. Vercel desconectado de Git; Railway autodeploy desactivado, volumen conservado. | infra/DEPLOYMENT_STATE.md; Docker build check | Imagen exacta, deploy y HTTPS |
| B · Datos | Adaptador seguro y fuente canónica implementados. Archivo autorizado conciliado exactamente:31 libros,248 turnos,2813.25m,1280h. Persistencia/reimportación en OVH en ejecución. | packages/import;13 comprobaciones PostgreSQL locales con rol no-superuser/no-bypass | Verificar importación privada y E2E |
| C · Advisor | Motor V2,58 pruebas, historial conservador, escenarios, comparación y decisión persistida implementados. No modelo físico/cliente validado. | packages/domain/{rop-model,crown-history};components/rop-scenario | Recorrido UI/decisión recargada |
| D · Pruebas/transición |110 unitarias PASS, lint/typecheck/build PASS en corte de trabajo; cero vulnerabilidades producción. R2 privado creado y credencial acotada con aprobación específica. | scripts/test-operational-integration.ts;pnpm checks | E2E, backup/restauración, checks HEAD final |

## Decisiones técnicas

- Fuente privada única: `operational_shifts` JSONB tipado, tenant+clave lógica, revisiones auditadas y transacciones. Se conserva el esquema histórico sin migrar sus datos automáticamente ni mezclarlo en el recorrido privado. Las entidades operacionales se representan por códigos originales, no relaciones inventadas a catálogo demo.
- Sesiones individuales opacas y revocables en DB; producción cerrada por servidor. Demo sólo lectura con tenant sintético separado; interfaz legado preservada en código pero no servida para evitar exponer constantes históricas privadas. Endpoints v1 retirados explícitamente410, no fallback silencioso.
- ROP utiliza pares metros/horas conocidos; totales independientes muestran cobertura. Corrección manual conserva profundidades originales y auditoría; nueva importación que colisiona con corrección manual se revierte y exige revisión explícita.
- Survey, sensores, intervalos3m, stock/costos sin fuente verificada muestran ausencia, no datos históricos de otra campaña. No se declara cierre completo de módulos secundarios.
- Referencias documentales/skills: Notion spec-to-implementation para trazabilidad; React best practices para ciclo de datos, accesibilidad y consistencia del componente; spreadsheet skill para lectura segura por el agente de datos.

## Límites pendientes

No hay aceptación operacional del cliente, modelo de desgaste validado ni apertura comercial. No borrar Railway/Vercel/dumps sin aceptación del corte/retención. Modelo ROP del cliente pendiente de episodios comparables y evidencia independiente.
