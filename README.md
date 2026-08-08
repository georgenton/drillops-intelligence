# DrillOps Intelligence

MVP SaaS B2B para inteligencia operacional en perforación diamantina. La demo presenta a Extract Services como primer tenant, con aislamiento visible frente a dos compañías adicionales.

## Inicio rápido

Requisitos: Node.js 20+, pnpm 10+ y Docker.

```bash
pnpm install
pnpm dev
```

El modo demo no necesita PostgreSQL ni servicios externos. Abre [http://localhost:3000](http://localhost:3000).

Para levantar también la base SQL:

```bash
cp .env.example .env.local
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm setup` agrupa la instalación y preparación SQL. PostgreSQL usa por defecto el puerto `5437` y un volumen Docker propio.

## Usuarios demo

Contraseña común, solo con `DEMO_MODE=true`: `DrillOps2026!`

- `platform@demo.local` — Platform Admin, puede cambiar tenant.
- `owner@extract.demo` — Tenant Owner.
- `supervisor@extract.demo` — Supervisor.
- `operator@extract.demo` — Operador.

## Recorrido recomendado

1. `/dashboard` — KPIs, avance, NPT, alertas y ETA.
2. `/depth-intelligence` — masterlog interactivo por profundidad.
3. `/coronas` e `/inventario` — velocidad, vida, costo y stock.
4. `/bit-advisor` — ranking determinístico y decisión del supervisor.
5. `/drill-assistant` — BI conversacional, conversión m/ft y gráficas dinámicas.
6. `/importaciones` — preview real de XLSX/CSV.
7. `/reportes` — reporte imprimible.
8. `/tenants` — aislamiento SaaS para Platform Admin.

## Comandos

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:up
pnpm db:down
pnpm db:reset
```

## Arquitectura

Monolito modular con Next.js App Router, TypeScript strict, Tailwind CSS, ECharts, Drizzle y PostgreSQL. La API interna está bajo `/api/v1`. La UI usa seed determinístico cuando `DEMO_MODE=true`; las tablas SQL e índices están listas para persistencia real.

### Asistente BI

Dashboard, reporte, alertas y asistente consumen `packages/bi/analytics.ts`, por lo que un mismo periodo produce una sola cifra oficial. Sin clave de OpenAI, el router de consultas es determinístico. Con `OPENAI_API_KEY`, la Responses API usa una función estricta de solo lectura para elegir indicador, unidades y tipo de gráfica, incluso sobre los datos demo. En producción (`DEMO_MODE=false`), `/api/v1/assistant` intenta consultar PostgreSQL con alcance por tenant y mantiene el dataset demo como respaldo cuando la base todavía está vacía. Si OpenAI no está disponible, conserva el cálculo y la gráfica mediante el motor local.

Para habilitar OpenAI configura `OPENAI_API_KEY` únicamente en el servidor y usa un modelo compatible en `OPENAI_MODEL` (por defecto `gpt-5.6`). La clave nunca se expone al navegador.

Consulta [PRODUCT.md](/Users/jorgequizamanchuro/Projects_local/drillops%20intelligence/docs/PRODUCT.md), [DEMO_SCRIPT.md](/Users/jorgequizamanchuro/Projects_local/drillops%20intelligence/docs/DEMO_SCRIPT.md) y [DEPLOY.md](/Users/jorgequizamanchuro/Projects_local/drillops%20intelligence/docs/DEPLOY.md).
