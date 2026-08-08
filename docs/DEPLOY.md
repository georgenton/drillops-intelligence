# Despliegue

## Railway PostgreSQL

1. Crea un proyecto y agrega PostgreSQL.
2. Copia la URL pública como `DATABASE_URL` en el entorno de migración y como variable del web.
3. Ejecuta `DEMO_MODE=true pnpm db:migrate && pnpm db:seed` solo en staging.
4. En producción usa `DEMO_MODE=false pnpm db:migrate`; el seed nunca crea credenciales demo.

## Vercel

Importa el repositorio, usa pnpm y define: `DATABASE_URL`, `AUTH_SECRET`, `DEMO_MODE`, `NEXT_PUBLIC_APP_URL`. Opcionales: `OPENAI_API_KEY` y `OPENAI_MODEL=gpt-5.6-terra`.

Build: `pnpm build`. El API interno funciona como Route Handlers. Un worker futuro puede desplegarse en Railway consumiendo la misma base y módulos de dominio sin cambiar el frontend.

Staging debe tener dominio, base, secreto y seed propios. Producción nunca debe usar la contraseña o `AUTH_SECRET` de este repositorio.
