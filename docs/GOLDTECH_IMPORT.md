# GoldTech Legacy Import

El importador detecta hojas sin distinguir mayúsculas/minúsculas. Prioriza `Daily stats`, metros (columna G) y tiempo efectivo (columna L). El flujo es: carga, preview, mapeo, validación, importación y resumen.

Para coronas se preservan valor original, fórmula cuando XLSX la expone y `legacy_cost_metric`. Los costos normalizados de DrillOps se calculan por separado. Los duplicados se previenen por tenant, archivo y claves operacionales (fecha/sondeo/turno o profundidad/corona). Las filas inciertas no se inventan: se marcan incompletas o rechazadas.
