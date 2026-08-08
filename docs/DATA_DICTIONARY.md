# Diccionario de datos

Todas las entidades operacionales llevan `tenant_id` directa o indirectamente, UUID y timestamps. Los índices críticos cubren tenant, proyecto, sondeo, taladro, fecha, profundidad y corrida.

| Dominio | Entidades principales | Regla clave |
|---|---|---|
| Identidad | tenant, user, membership, role | acceso filtrado por tenant |
| Operación | site, project, rig, drillhole, shift | turno default 12 h |
| Intervalos | drilling_interval, event, alert | 3 m default; permite 1.5 m |
| Coronas | bit_product, bit_run, inventory | costo legacy separado del normalizado |
| SaaS | plan, subscription, feature_flag | mensual/anual, provider abstracto |
| Integración | survey, import_job, audit_log | archivo validado y trabajo auditable |

ROP = metros / horas efectivas. Utilización = horas efectivas / horas de turno. Las divisiones por cero devuelven 0.
