# Plan de implementación de observaciones de Raúl

Estado: **implementado y verificado** · 17 de agosto de 2026

## 1. Seguridad y perfiles

- Se centralizaron los perfiles `Platform Admin`, `Gerente General`, `Cliente`, `Supervisor de Operaciones`, `Perforador` y `Control`.
- El acceso efectivo es la intersección entre perfil y plan.
- La autorización se aplica en menú, ruta de servidor, API, registros manuales y Drill Assistant.
- Los campos financieros se eliminan de las respuestas para perfiles sin permiso; no basta con ocultarlos en pantalla.
- La pestaña de facturación/costos comerciales continúa desactivada por feature flag.

## 2. Planes comerciales

| Plan | Precio mensual | Permanencia | Contrato mínimo | Máquinas | Restricciones principales |
|---|---:|---:|---:|---:|---|
| Básico | USD 350 | 4 meses | USD 1.400 | 3 | Sin Coronas, Bit Advisor, Survey, Depth Intelligence ni Drill Assistant; consumibles sin costos |
| Intermedio | USD 450 | 6 meses | USD 2.700 | 6 | Sin Depth Intelligence ni Drill Assistant; consumibles sin costos |
| Premium | USD 600 | 12 meses | USD 7.200 | Ilimitadas | Todos los módulos y costos de consumibles |

Los límites de máquinas y módulos se validan también en backend. Se añadieron cuentas demo de gerencia para Básico e Intermedio, además de las seis cuentas por perfil.

## 3. Mejoras funcionales

- Dashboard: disponibilidad mecánica, ejecución frente a programación, parámetros, guardias, alertas y costos según permiso.
- Operación: proyección de 24 horas con tendencia, error histórico, rango esperado y nivel de confianza.
- Sondeos, taladros, turnos e intervalos: acciones de alta conectadas y visibles únicamente para perfiles con escritura.
- Intervalos: captura de WOB, inclinación, litología y Mohs; MSE calculada sin inferir automáticamente la geología.
- Coronas: fórmula completa separando corona, taladro, consumibles y total por metro.
- Bit Advisor: referencia geológica básica versionada, evidencia declarada y recomendación explicable.
- Inventario: movimientos y control cuantitativo de rimas, aditivos, aceites y grasas.
- Consumibles: metros de referencia obligatorios, normalización por metro y costos restringidos por plan/perfil.
- Survey: proyección con tendencia de inclinación/azimut y severidad dogleg; se identifica como estimación.
- Reportes: imágenes JPG/PNG/WebP validadas, persistidas y listas para impresión/PDF.
- Drill Assistant: consultas en lenguaje natural, conversiones a pies, gráficas dinámicas —incluidas columnas 3D— y bloqueo de métricas financieras no autorizadas.

### Trazabilidad de la pestaña `Cambios`

| Fila | Módulo | Solicitud verificada | Implementación |
|---:|---|---|---|
| 3 | Dashboard | Mínimo, promedio y máximo de RPM, presión, galonaje y torque | Tarjetas calculadas desde los intervalos del periodo; los cuatro campos se capturan en `Registrar intervalo` |
| 4 | Dashboard | Avance ejecutado frente a meta diaria definida al inicio | Serie acumulada real contra `plannedDailyMetres` del sondeo |
| 5 | Dashboard | Rendimiento por guardia día/noche y por máquina | Barras separadas por guardia, eje fecha–taladro y selector de taladro conectado |
| 6 | Operación | Supervisor y perforista | Captura obligatoria y visualización en turnos/operación |
| 7–8 | Operación / Sondeos | Proyección de avance de las próximas 24 h | Tendencia ponderada, rango esperado, confianza y observaciones |
| 9 | Taladros | Diesel y repuestos | Consumo L/m, stock de repuestos y piezas críticas por equipo |
| 10 | Intervalos | Columna Survey | Inclinación capturada y mostrada por intervalo |
| 11–12 | Coronas | MSE y costo por longitud perforada | MSE física; corona, horas de taladro y consumibles separados antes del total USD/m; el asistente convierte correctamente a USD/pie |
| 13 | Bit Advisor | Dureza calculada y geología declarada | MSE operacional separada de litología/Mohs declarados, con referencia geológica versionada |
| 14 | Inventario | Coronas, rimas, goma xántica, polímero, aceite y grasa | Inventario cuantitativo sin exponer costos cuando el perfil no los permite |
| 15 | Consumibles | Valor por metro y total por pozo | Normalización por metro y total por pozo sin duplicar el metraje diario entre insumos |
| 16 | Survey | Proyección de inclinación | Tendencia de inclinación/azimut, dogleg y confianza, rotulada como estimación |
| 17–18 | Depth Intelligence | MSE y litología/Mohs | Curvas sincronizadas por profundidad sin inferir geología a partir de MSE |
| 19 | Analítica | Pozo anterior frente al actual | Comparación de tiempo, costo (con permiso) y ROP |
| 20 | Reportes | Incluir imágenes | Adjuntos JPG, PNG y WebP validados y persistidos para el reporte |

## 4. Verificación ejecutada

- 18 rutas recorridas en navegador sin overlays ni errores de consola.
- 8 formularios de registro abiertos y comprobados; Intervalos usa panel de captura rápida.
- 8 escenarios de acceso comprobados: seis perfiles, plan Básico y plan Intermedio.
- Redirecciones protegidas verificadas para Cliente, Supervisor, Control, Básico e Intermedio.
- APIs comprobadas para redacción de costos, escritura prohibida, límites de plan y acceso al asistente.
- `eslint`, TypeScript, validación de migraciones y build de producción aprobados.
- 40 pruebas automatizadas aprobadas en 11 archivos.
- El rendimiento por guardia quedó cubierto por una prueba específica de agrupación fecha–máquina.

## 5. Requisitos para staging

- Aplicar la migración `0002_broken_speed_demon.sql` antes de desplegar la nueva versión.
- Definir un `AUTH_SECRET` fuerte en Railway/Vercel; la aplicación exige esta variable en producción.
- Mantener desactivado `BILLING_TAB_ENABLED` hasta decidir mostrar la pestaña comercial.
