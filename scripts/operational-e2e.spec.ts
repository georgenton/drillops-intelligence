import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { crc32 } from "../packages/import/zip";
const password = "Synthetic-E2E-Only-2026!";
const tenantA = "00000000-0000-4000-8000-000000000e21";
const headings:Record<string,string>={Dashboard:"Centro de operación",Reportes:"Reporte ejecutivo",Coronas:"Coronas y rendimiento",Intervalos:"Intervalos de perforación",Consumibles:"Consumibles, agua y diesel"};
async function navigate(page:Page,label:string){
  const sidebar=page.locator(".sidebar");
  if(await page.getByRole("button",{name:"Abrir menú",exact:true}).isVisible())await page.getByRole("button",{name:"Abrir menú",exact:true}).click();
  await sidebar.getByRole("link",{name:new RegExp(`^${label}(\\s*AI)?$`)}).click();
  await expect(page.getByRole("heading",{level:1,name:headings[label]??label,exact:true})).toBeVisible();
}
function zip(entries: Record<string, string | Buffer>) {
  const locals: Buffer[] = [], directories: Buffer[] = []; let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const path = Buffer.from(name), data = Buffer.from(value), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(path.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(path.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, path, data); directories.push(central, path); offset += local.length + path.length + data.length;
  }
  const end = Buffer.alloc(22), directory = Buffer.concat(directories);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function fixture() {
  const cells: Record<string, string | number> = { S6: 46160, F5: "SYNTHETIC E2E", F8: "SYNTHETIC-HOLE", O14: "TOTAL (m)", C15: 100, F15: 110, O15: 10, C17: 110, F17: 110, O17: 0, B26: "MUDANZA", F26: 12, B28: "PERFORACIÓN", C28: 5, B41: "TOTAL HORAS", C41: 5, F41: 12, O24: "BIT", O26: "HQ", S26: "SYNTHETIC", T26: "SYN-E2E-001", W26: 100, AE26: 120, AH26: 20, O36: "REAMING SHELL", B80: "PERSONAL_SENTINEL_MUST_NOT_ESCAPE" };
  const sheet = `<worksheet><sheetData>${Object.entries(cells).map(([ref, value]) => typeof value === "number" ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`).join("")}</sheetData></worksheet>`;
  const book = zip({ "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="RIG-E2E-001" r:id="rId1"/></sheets></workbook>', "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', "xl/worksheets/sheet1.xml": sheet });
  return zip({ "synthetic-e2e.xlsx": book });
}
async function login(page: Page, name: "supervisor" | "client" | "other" | "reviewer") {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(`${name}@drillops-e2e.example.invalid`);
  await page.getByLabel("Contraseña").fill(password);
  const response = page.waitForResponse(r => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Centro de operación", exact: true })).toBeVisible();
}
async function apiState(request: APIRequestContext) {
  const response = await request.get("/api/v2/operation?from=2026-05-01&to=2026-05-31");
  expect(response.ok()).toBe(true); return response.json();
}
test("private commercial story: import, reconcile, correct, Advisor, persistence and isolation", async ({ page, browser, baseURL }) => {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  const origin = new URL(baseURL!).origin;
  const anonymous = await page.request.get("/api/v2/operation"); expect(anonymous.status()).toBe(401);
  await login(page, "supervisor");
  expect((await apiState(page.request)).shifts).toHaveLength(0);
  await expect(page.getByText(/0 posiciones de turno/)).toBeVisible();
  await page.getByLabel("Desde",{exact:true}).fill("2026-05-01");
  await page.getByLabel("Hasta",{exact:true}).fill("2026-05-31");
  await page.getByRole("link", { name: "Importaciones", exact: true }).click();
  await page.getByLabel("Archivo ZIP operacional").setInputFiles({ name: "synthetic-e2e.zip", mimeType: "application/zip", buffer: fixture() });
  await page.getByRole("button", { name: "Analizar vista previa" }).click();
  await expect(page.getByRole("heading", { name: /1 libros · 2 turnos · 10 m/ })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar importación persistida" }).click();
  await expect(page.getByRole("status")).toContainText("Importación persistida");
  let state = await apiState(page.request);
  expect(state.summary.advanceM).toBe(10); expect(state.summary.drillingHours).toBe(5); expect(state.summary.shiftCount).toBe(2); expect(state.summary.ropMPerHour).toBe(2);
  expect(JSON.stringify(state)).not.toContain("PERSONAL_SENTINEL");
  await page.getByRole("button", { name: "Confirmar importación persistida" }).click();
  await expect(page.getByRole("status")).toContainText("sin duplicados");
  expect((await apiState(page.request)).summary.shiftCount).toBe(2);
  await page.getByRole("link", { name: "Turnos", exact: true }).click();
  // Restored UI deliberately has no correction dialog; preserve the canonical correction/API contract.
  const correction=await page.request.patch("/api/v2/operation",{headers:{origin},data:{logicalKey:state.shifts.find((s:{shiftType:string})=>s.shiftType==="day").logicalKey,revision:1,advanceM:12,drillingHours:6,reason:"Synthetic verified correction E2E"}});
  expect(correction.status()).toBe(200);await page.reload();
  state = await apiState(page.request); expect(state.summary.advanceM).toBe(12); expect(state.summary.ropMPerHour).toBe(2);
  await page.getByLabel("Equipo", { exact: true }).selectOption("RIG-E2E-001");
  for (const section of ["Dashboard", "Reportes", "Drill Assistant"]) {
    await navigate(page,section);
    const path = section === "Dashboard" ? "/dashboard" : section === "Reportes" ? "/reportes" : "/drill-assistant";
    await expect(page).toHaveURL(url => url.pathname === path && url.searchParams.get("rig") === "RIG-E2E-001");
    await expect(page.getByRole("heading", { level:1,name: headings[section]??section, exact: true })).toBeVisible();
    await expect(page.getByLabel("Equipo", { exact: true })).toHaveValue("RIG-E2E-001");
    if(section==="Dashboard")await expect(page.locator(".kpi-card").filter({hasText:"Metros perforados"})).toContainText("12");
    if(section==="Reportes")await expect(page.locator(".report-kpis")).toContainText("12 m");
    expect((await apiState(page.request)).summary.advanceM).toBe(12);
  }
  await page.getByLabel("Pregunta operacional").fill("¿Cuántos metros perforamos?");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByRole("status").last()).toHaveText("Avance: 12 m");
  await navigate(page,"Bit Advisor");
  await expect(page.getByRole("heading", { name: "Mantener revisión manual" })).toBeVisible();
  await expect(page.getByLabel("UCS (MPa, opcional)", { exact: true })).toBeVisible();
  // Keep coverage of the missing-UCS path even though the didactic example now
  // explicitly supplies a hypothetical 200 MPa, independently tested elsewhere.
  await page.getByLabel("UCS (MPa, opcional)", { exact: true }).fill("");
  await page.getByRole("button", { name: "Adjuntar este escenario a la decisión", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Escenario adjuntado como hipótesis");
  await page.getByLabel("Corona para decisión").selectOption("SYN-E2E-001");
  await page.getByLabel("Razón", { exact: true }).fill("Synthetic supervisor review, no physical validation claimed");
  await page.getByRole("button", { name: "Guardar decisión" }).click();
  await expect(page.getByRole("status")).toContainText("Decisión guardada");
  await page.reload();
  await expect(page.getByText(/Synthetic supervisor review, no physical validation claimed/)).toBeVisible();
  const persistedDecisions = (await apiState(page.request)).decisions;
  expect(persistedDecisions).toHaveLength(1);
  const persistedScenario = persistedDecisions[0].payload.scenario;
  expect(persistedScenario.source).toBe("USER_SUPPLIED_HYPOTHETICAL");
  expect(persistedScenario.modelState).toBe("NOT_VALIDATED");
  expect(persistedScenario.modelVersion).toBe("rop-exponential-v2.1");
  expect(persistedScenario.coefficients.betaPerHour).toBeCloseTo(1.0397207708399179, 14);
  expect(persistedScenario.coefficients.alphaPerMpaHour).toBeNull();
  expect(persistedScenario.coefficients.alphaStatus).toBe("UCS_MISSING");
  await page.screenshot({ path: "test-results/operational-e2e/synthetic-advisor-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "Reportes", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/reportes" && url.searchParams.get("rig") === "RIG-E2E-001");
  await expect(page.getByRole("heading", { name: "Decisiones del contexto · trazabilidad de supervisión", exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic supervisor review, no physical validation claimed", { exact: true })).toBeVisible();
  await expect(page.getByText(/Escenario hipotético rop-exponential-v2.1, no validado/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir / Guardar PDF", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Reporte ejecutivo", exact: true })).toBeVisible();
  await navigate(page,"Dashboard");
  await expect(page.locator(".kpi-card").filter({hasText:"Metros perforados"})).toContainText("12");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/operational-e2e/synthetic-mobile.png", fullPage: true });
  const clientContext = await browser.newContext({ baseURL }); const client = await clientContext.newPage();
  await login(client, "client");
  const clientState = await apiState(client.request); expect(clientState.decisions).toHaveLength(0);
  const denied = await client.request.post("/api/v2/decisions", { headers: { origin }, data: { decision: "accept", crownSerial: "SYN-E2E-001", reason: "Forbidden synthetic action", filters: {} } }); expect(denied.status()).toBe(403);
  const deniedCorrection = await client.request.patch("/api/v2/operation", { headers: { origin }, data: { logicalKey: state.shifts[0].logicalKey, revision: 2, advanceM: 99, drillingHours: 5, reason: "Forbidden synthetic correction" } }); expect(deniedCorrection.status()).toBe(403);
  await clientContext.close();
  const reviewContext = await browser.newContext({ baseURL }); const reviewer = await reviewContext.newPage();
  await login(reviewer, "reviewer");
  const beforeReview = await apiState(reviewer.request);
  expect(beforeReview.decisions).toHaveLength(1);
  for (const label of ["Dashboard", "Operación", "Sondeos", "Taladros", "Turnos", "Intervalos", "Coronas", "Bit Advisor", "Inventario", "Consumibles", "Survey", "Depth Intelligence", "Analítica", "Reportes", "Drill Assistant"]) {
    await navigate(reviewer,label);
  }
  for(const label of ["Importaciones","Configuración","Plan y facturación","Empresas"])await expect(reviewer.locator(".sidebar").getByRole("link",{name:label,exact:true})).toHaveCount(0);
  await reviewer.getByLabel("Pregunta operacional").fill("metros");
  await reviewer.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(reviewer.getByRole("status").last()).toHaveText("Avance: 12 m");
  await navigate(reviewer,"Bit Advisor");
  await reviewer.getByLabel("Horizonte futuro efectivo (h, máximo 168)").fill("4");
  await expect(reviewer.getByRole("button", { name: "Guardar decisión" })).toBeDisabled();
  await expect(reviewer.getByRole("button", { name: "Adjuntar este escenario a la decisión" })).toHaveCount(0);
  expect(await apiState(reviewer.request)).toEqual(beforeReview);
  for (const decision of ["accept", "reject", "alternative"]) expect((await reviewer.request.post("/api/v2/decisions", { headers: { origin }, data: { decision, crownSerial: "SYN-E2E-001", reason: "Denied review attempt", filters: {} } })).status()).toBe(403);
  expect((await reviewer.request.patch("/api/v2/operation", { headers: { origin }, data: { logicalKey: state.shifts[0].logicalKey, revision: 2, advanceM: 99, drillingHours: 5, reason: "Denied review correction" } })).status()).toBe(403);
  expect((await reviewer.request.post("/api/v2/imports?commit=true", { headers: { origin }, data: "denied" })).status()).toBe(403);
  expect((await reviewer.request.get("/api/v2/operation?tenantId=00000000-0000-4000-8000-000000000e22")).status()).toBe(403);
  expect(await apiState(reviewer.request)).toEqual(beforeReview);
  await reviewer.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(reviewer).toHaveURL(/\/login$/);
  expect((await reviewer.request.get("/api/v2/operation")).status()).toBe(401);
  await reviewContext.close();
  const otherContext = await browser.newContext({ baseURL }); const other = await otherContext.newPage();
  await login(other, "other"); expect((await apiState(other.request)).shifts).toHaveLength(0);
  const deniedTenant = await other.request.get(`/api/v2/operation?tenantId=${tenantA}`); expect(deniedTenant.status()).toBe(403);
  const deniedCrown = await other.request.post("/api/v2/decisions", { headers: { origin }, data: { decision: "accept", crownSerial: "SYN-E2E-001", reason: "Other tenant cannot see crown", filters: {} } }); expect(deniedCrown.status()).toBe(400);
  await otherContext.close();
  expect(failures).toEqual([]);
});
