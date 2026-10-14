import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { crc32 } from "../packages/import/zip";
const password = "Synthetic-E2E-Only-2026!";
const tenantA = "00000000-0000-4000-8000-000000000e21";
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
async function login(page: Page, name: "supervisor" | "client" | "other") {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(`${name}@drillops-e2e.example.invalid`);
  await page.getByLabel("Contraseña").fill(password);
  const response = page.waitForResponse(r => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Sin registros en este contexto" })).toBeVisible();
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
  const answers = ["12", "6", "Synthetic verified correction E2E"];
  page.on("dialog", async dialog => { await dialog.accept(answers.shift() ?? ""); });
  await page.getByRole("button", { name: "Corregir", exact: true }).first().click();
  await expect(page.getByRole("status")).toContainText("Corrección guardada");
  state = await apiState(page.request); expect(state.summary.advanceM).toBe(12); expect(state.summary.ropMPerHour).toBe(2);
  await page.getByLabel("Equipo", { exact: true }).selectOption("RIG-E2E-001");
  for (const section of ["Dashboard", "Reportes", "Drill Assistant"]) {
    await page.getByRole("link", { name: section, exact: true }).click();
    const path = section === "Dashboard" ? "/dashboard" : section === "Reportes" ? "/reportes" : "/drill-assistant";
    await expect(page).toHaveURL(url => url.pathname === path && url.searchParams.get("rig") === "RIG-E2E-001");
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    await expect(page.getByLabel("Equipo", { exact: true })).toHaveValue("RIG-E2E-001");
    await expect(page.locator("article").filter({ hasText: "Avance del periodo" }).getByRole("heading")).toHaveText("12 m");
    expect((await apiState(page.request)).summary.advanceM).toBe(12);
  }
  await page.getByLabel("Pregunta operacional").fill("¿Cuántos metros perforamos?");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByRole("status").last()).toHaveText("Avance: 12 m");
  await page.getByRole("link", { name: "Bit Advisor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Historial conservador de coronas" })).toBeVisible();
  await expect(page.getByText(/UCS_MISSING/)).toBeVisible();
  await page.getByRole("button", { name: "Adjuntar este escenario a la decisión", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Se guardará como hipótesis");
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
  await expect(page.getByRole("button", { name: "Imprimir reporte del filtro activo", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Reportes", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.locator("article").filter({ hasText: "Avance del periodo" }).getByRole("heading")).toHaveText("12 m");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/operational-e2e/synthetic-mobile.png", fullPage: true });
  const clientContext = await browser.newContext({ baseURL }); const client = await clientContext.newPage();
  await login(client, "client");
  const clientState = await apiState(client.request); expect(clientState.decisions).toHaveLength(0);
  const denied = await client.request.post("/api/v2/decisions", { headers: { origin }, data: { decision: "accept", crownSerial: "SYN-E2E-001", reason: "Forbidden synthetic action", filters: {} } }); expect(denied.status()).toBe(403);
  const deniedCorrection = await client.request.patch("/api/v2/operation", { headers: { origin }, data: { logicalKey: state.shifts[0].logicalKey, revision: 2, advanceM: 99, drillingHours: 5, reason: "Forbidden synthetic correction" } }); expect(deniedCorrection.status()).toBe(403);
  await clientContext.close();
  const otherContext = await browser.newContext({ baseURL }); const other = await otherContext.newPage();
  await login(other, "other"); expect((await apiState(other.request)).shifts).toHaveLength(0);
  const deniedTenant = await other.request.get(`/api/v2/operation?tenantId=${tenantA}`); expect(deniedTenant.status()).toBe(403);
  const deniedCrown = await other.request.post("/api/v2/decisions", { headers: { origin }, data: { decision: "accept", crownSerial: "SYN-E2E-001", reason: "Other tenant cannot see crown", filters: {} } }); expect(deniedCrown.status()).toBe(400);
  await otherContext.close();
  expect(failures).toEqual([]);
});
