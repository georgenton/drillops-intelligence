# Despliegue

## Staging actual

- GitHub: `georgenton/drillops-intelligence`
- Rama de despliegue en Vercel: `staging`
- URL pública: `https://drillops-intelligence-web.vercel.app`
- Railway: proyecto `drillops-intelligence`, entorno `staging`, servicio `Postgres`

La aplicación es actualmente un monolito Next.js: Vercel ejecuta tanto la interfaz como los Route Handlers de `/api/v1`; Railway aloja PostgreSQL y su volumen persistente. No se versionan archivos `.env`, `.vercel` ni `.railway`.

## Railway PostgreSQL

1. Crea un proyecto y agrega PostgreSQL.
2. Copia la URL pública como `DATABASE_URL` en el entorno de migración y como variable del web.
3. Ejecuta `DEMO_MODE=true pnpm db:migrate && pnpm db:seed` solo en staging.
4. En producción usa `DEMO_MODE=false pnpm db:migrate`; el seed nunca crea credenciales demo.

## Vercel

Importa el repositorio, usa pnpm y define: `DATABASE_URL`, `AUTH_SECRET`, `DEMO_MODE`, `NEXT_PUBLIC_APP_URL`. Opcionales: `OPENAI_API_KEY` y `OPENAI_MODEL=gpt-5.6`.

Build: `pnpm build`. El API interno funciona como Route Handlers. Un worker futuro puede desplegarse en Railway consumiendo la misma base y módulos de dominio sin cambiar el frontend.

La pestaña **Plan y facturación** está oculta por defecto. Solo se muestra y permite acceso directo cuando `BILLING_TAB_ENABLED=true`; mantener la variable ausente o en `false` conserva el módulo desactivado sin eliminar su código.

Staging debe tener dominio, base, secreto y seed propios. Producción nunca debe usar la contraseña o `AUTH_SECRET` de este repositorio.
