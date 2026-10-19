# Staging membership-scoped operational review

Authorized scope: individual read/simulation access, no operational writes, no production.

Implementation: existing DB role remains `client`. An explicit membership UUID in its own tenant's `settings.operationalReviewMembershipIds` produces the effective `operational_reviewer` role only when `DRILLOPS_ENV=staging`. No email exception, schema migration, commercial plan change, or change to ordinary clients. Revocation removes that membership UUID; authorization is recomputed on every request.

Sections: dashboard, operacion, turnos, coronas, bit-advisor, drill-assistant, reportes. Assistant remains deterministic and local to the authorized v2 response. Scenarios remain React state. Attach callback absent and decision controls disabled for read-only users. API write allowlists continue to reject this effective role. Tenant derives from the authenticated session, not query input.

Local verification: TypeScript, ESLint (excluding pre-existing ignored test-results scripts), 144 unit tests and production build passed. Extended Playwright story passed against disposable localhost:5448 database and localhost:3319 app with nonsuperuser runtime: seven routes, deterministic question, hypothetical edit without data mutation, denied decision accept/reject/alternative, denied correction/import, denied tenant override, login/logout and 401 after logout. Existing ordinary client still denied Advisor; supervisor flow retained. No customer data used for write tests.

Deployment/account verification is recorded separately in the existing internal Notion evidence page. No passwords, tokens or customer data belong in this file. Production, formulas, workbooks and manuals are unchanged.
