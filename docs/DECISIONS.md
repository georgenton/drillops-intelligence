# Decisiones

- Nombre neutral `DrillOps Intelligence`; branding de Extract Services solo como tenant demo.
- Next.js monolítico modular; PostgreSQL en Docker local, Next nativo.
- Modo demo funciona sin base ni OpenAI para reducir fricción de presentación.
- Seed determinístico y coherente; no se usó aleatoriedad.
- Geología fuera del modelo operacional por confidencialidad.
- Bit Advisor determinístico y explicable; la IA solo explica métricas de funciones controladas.
- Responses API con `gpt-5.6-terra` por equilibrio de calidad/costo cuando existe clave; fallback determinístico obligatorio.
- Reportes usan impresión del navegador, no motor PDF dedicado.
- Archivos `reference` ausentes: se mantiene importador real y seed separado.
- El puerto `5437` estaba ocupado localmente; esta instalación usa `5447` mediante variables, sin cambiar el default documentado.
