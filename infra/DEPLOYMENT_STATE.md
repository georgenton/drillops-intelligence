# DrillOps isolated infrastructure — 2026-10-14

Deployment operator checkpoint; credentials are deliberately excluded.

## Existing infrastructure and boundaries

Coolify 4.4.6, Root Team (0), server `tyaniecu7o8q7ml7212rxwff` on existing OVH VPS.
Observed capacity: 6 CPUs, 11.4 GiB RAM, approximately 4.8 GiB available, 47 GiB disk free. No host/global configuration changed. Builds belong in CI, not the shared VPS.

Project `evcg67bhovpflfaspygeqr9e` is exclusive to DrillOps.

| Environment | Environment UUID | Application UUID | PostgreSQL UUID | State |
|---|---|---|---|---|
| staging | nglwxqsa349i7vggxjmapc3d | q9foqpgtzvbzprt3dhlwkwbm | a2ui1b8eijeqsbwl3i7e4urs | DB healthy/private; app not deployed |
| demo | eixahndbf2nitpleoljwoad4 | e6ox63qpck3vfiq5qe3h29zz | 8r2mgpbpivtwiugj75zvor3a | DB started/private; app not deployed |
| production | qyo6hemtboes1hzcfura42rk | wqepvsvbjgfzbmiaucjxje9g | 0qzusue9hlsax9vxftz9j5er | DB started/private; app not deployed; commercial access closed |

Apps reserve 512 MiB / 0.5 CPU each. Staging DB 512 MiB / 0.5 CPU; demo/production DB 256 MiB / 0.25 CPU. Separate generated admin credentials and private database resources. All three have distinct runtime credentials; `drillops_runtime` verified NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE. Public-schema DML/sequence grants only; no migration privileges. Auth secrets distinct. Demo `DEMO_MODE=true`, private environments false; production `COMMERCIAL_ACCESS_ENABLED=false`.

PostgreSQL environment isolation checked with runtime credentials: three own-environment connections succeed; all six cross-environment attempts fail with `28P01` (invalid password). Apps use private internal database hostnames; admin SSH tunnels are localhost-only. `APP_ORIGIN` explicitly configured per environment at runtime; no shared cookie domain or build-time canonical origin.

Proposed domains resolve to existing VPS: `demo.drillops.syntavera.dev`, `staging.drillops.syntavera.dev`, `drillops.syntavera.dev`. Certificates are NOT verified yet: prior-to-deploy HTTPS checks failed certificate verification. No DNS/root/MX settings changed.

## Legacy containment

- Vercel `prj_unNwk7AuZ12Jvt7o37YHtYq6f4Hf` (`drillops-intelligence-web`, team `team_TN7oDqf0ALR7Gy4gKaOEEPKV`): Git disconnected; API read-back `link:null`, zero linked deploy hooks. Existing deployments/data retained.
- Legacy project Vercel Authentication re-enabled for **all** deployments through project API, no plan purchase/change. Production alias and historical immutable URL both verified HTTP302 to Vercel SSO; no longer public application access. This reverses the historical preview-public setting under the newer safe-cutover mandate.
- Railway project `e59a18a4-941c-45d2-8257-b9ec2444de7d`: only Postgres service `10562e7f-2ef5-4f10-b9e5-54664853128a`; no Git source or webhooks. Explicit service auto-deploy disabled. Vulnerability image update snoozed for 14 days on 2026-10-14 (not permanently removed); stop/retire after verified backup/cutover, or revisit before Oct 28. Database and volume remain running/intact. No new deployment invoked.

Legacy data preserved: Railway PG18.6 inspected through preexisting authenticated SSH (public TLS is self-signed; verification was not disabled). Full custom dump 56,503 bytes, uploaded to private staging R2 key `legacy/railway-20261014.dump`, downloaded and SHA256 checked: `dad360bbc102aa84b6a347520ffc08cfb311a82f0c3e234e4eba58aa6c6250f3`. Restored successfully into NEW local PG18 container `drillops-legacy-restore-20261014`, DB `legacy_restore` (tmpfs, no public port). Exact source/restored counts checked: manual_records0, users4, tenants3, shifts0, drilling_intervals0, migrations3. No operational records copied from legacy into OVH; original DB volume and dumps retained. Stopping legacy service waits for verified OVH cutover.

## Build and release

Dockerfile pins Node 24 base by digest, uses frozen pnpm lock, nonroot runtime, Next standalone output and `/api/ready` healthcheck. `docker build --check .` passed. A complete build remains required after implementation converges.

`.github/workflows/container.yml` validates code and publishes GHCR image tagged exact SHA with provenance/SBOM, on manual dispatch or push to `codex/authorized-delivery-oct14` only. It does NOT deploy. Replace `pending-verified-release` app tag with tested SHA/digest only after exact-HEAD checks; trigger lifecycle with the DEPLOY token, not WRITE. All three application auto-deploy/preview switches explicitly PATCHed false (the creation API did not persist false defaults).

## Local integration

Disposable container `drillops-execution-test-20261014`, PostgreSQL 17, localhost port 5448, tmpfs data; separate from historical local DrillOps DB on 5447. Staging SSH tunnel uses localhost 55448 to private database IP (resolve current container IP after restart). Migrations are serialized by the parent implementation agent.

## Storage checkpoint

Cloudflare account `e56c3b040e55059b2dde377f03c08e89`: initial usage observed 474.87 MB, $0.00, 58.27k Class A / 9.24k Class B operations. Three Standard/private buckets `drillops-{demo,staging,production}-backups-20261014`, each with its own object-read/write-only token. Owner specifically confirmed credential creation at action time. No client originals uploaded. No reuse of neighboring buckets/tokens. Coolify connection checks passed all three.

| Environment | Coolify storage | Backup configuration | Daily UTC | Retention |
|---|---|---|---|---|
| staging | v8ki8p7yullsfvry68ulefhc | 2tvyixnxdkeahczohqqaujmc | 08:30 | 14 copies / 14 days R2; 1 local |
| demo | f9ze6p0iwqsgbqtxdix3uory | 0imd52muxvkrnzkprzy3vn5d | 08:40 | 14 copies / 14 days R2; 1 local |
| production | qpz1yaf5v56wqtlkgzxr8fuc | hrjccp2vccsnzrpco9wbcg6o | 08:50 | 14 copies / 14 days R2; 1 local |

Staging recovery drill **PASS** at 2026-10-14T21:55:08Z via `pnpm exec tsx scripts/backup-operational.ts`: exported consistent snapshot, PG17 custom dump, R2 upload/download, SHA-256 `9c07f4712bd93e5d71845e1362c0a3c1feac28ff1709f78bf852d4281d1c0e55`, restore into new disposable `drillops_restore_20261014215458979` on localhost5448. All28 table counts match (248 operational shifts/revisions, 1 import, 1 user/tenant). Staging credential denied demo bucket HTTP403. Private report and dumps retained outside Git under `~/.config/syntavera/backups/drillops/`; no active database overwritten. Scheduled execution and retention aging remain to be observed separately.

All six cross-environment list attempts returned HTTP403 (each environment token against the other two backup buckets); own-bucket lists succeeded. Separate private `drillops-{demo,staging,production}-documents-20261014` buckets created empty with Public Access Disabled. No application credentials are granted to these unused document stores yet: importer persists operational allowlisted data in PostgreSQL, not original spreadsheets. Backup tokens cannot write documents.

## Recovery/security gates before presentation

1. Migrate private staging DB, provision nonsuperuser runtime role and individual login; no demo credentials.
2. Validate import/reimport, role/tenant isolation, failure without synthetic fallback.
3. Build/test immutable image and deploy staging; verify exact digest and TLS.
4. Configure bucket-scoped credentials, backup/restore into disposable DB, negative cross-bucket tests.
5. Demo sanitized, production CLOSED; never infer commercial acceptance from infrastructure readiness.
