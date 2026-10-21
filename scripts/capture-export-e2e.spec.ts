/** Run only with seeded local disposable DB5448; playwright config refuses remote URLs. */
import { test,expect,type APIRequestContext } from "@playwright/test";
import { readZip } from "../packages/import/zip";
const password="Synthetic-E2E-Only-2026!";
test("online iPad capture persists canonical totals, true XLSX, denied reviewer writes and tenant isolation",async({page,playwright,baseURL})=>{
  const origin=new URL(baseURL!).origin;
  const contexts:APIRequestContext[]=[];
  async function account(name:string){const context=await playwright.request.newContext({baseURL});contexts.push(context);expect((await context.post("/api/auth/login",{headers:{origin},data:{email:`${name}@drillops-e2e.example.invalid`,password}})).status()).toBe(200);return context;}
  const rig=`RIG-CAPTURE-${Date.now()}`;
  try{
    expect((await page.request.post("/api/v2/capture",{headers:{origin},data:{}})).status()).toBe(401);
    expect((await page.request.get("/api/v2/export")).status()).toBe(401);
    await page.setViewportSize({width:1024,height:1366});
    await page.goto("/login");await page.getByLabel("Correo electrónico").fill("supervisor@drillops-e2e.example.invalid");await page.getByLabel("Contraseña").fill(password);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).toHaveURL(/dashboard/);
    await page.goto(`/turnos?from=2026-10-19&to=2026-10-19&rig=${rig}`);
    await page.getByRole("button",{name:"Nuevo turno online",exact:true}).click();
    const modal=page.getByRole("dialog");
    await modal.getByLabel("Fecha",{exact:true}).fill("2026-10-19");
    await modal.getByLabel("Taladro",{exact:true}).fill(rig);await modal.getByLabel("Sondeo",{exact:true}).fill("HOLE-CAPTURE-SYNTHETIC");
    await modal.getByLabel("Desde (m)",{exact:true}).fill("100");await modal.getByLabel("Hasta (m)",{exact:true}).fill("115");
    await modal.getByLabel("Horas actividad 1",{exact:true}).fill("5");await modal.getByRole("button",{name:"Añadir actividad"}).click();
    await modal.getByLabel("Actividad 2",{exact:true}).fill("Estabilización");await modal.getByLabel("Horas actividad 2",{exact:true}).fill("7");
    await modal.getByLabel("RPM",{exact:true}).fill("650");await modal.getByLabel("Concepto",{exact:true}).fill("Combustible");await modal.getByLabel("Cantidad",{exact:true}).fill("25");await modal.getByLabel("Unidad",{exact:true}).fill("gls");
    await modal.getByLabel("Serie",{exact:true}).fill("SYNTHETIC-CAPTURE-BIT");await modal.getByLabel("Tipo",{exact:true}).fill("HQ");
    await modal.getByLabel("Profundidad (m)",{exact:true}).fill("115");await modal.getByLabel("DIP (°)",{exact:true}).fill("-60");await modal.getByLabel("Azimut (°)",{exact:true}).fill("240");await modal.getByLabel("Referencia declarada",{exact:true}).fill("MAGNÉTICO");await modal.getByLabel("Equipo",{exact:true}).fill("EMS");
    await modal.getByLabel("Motivo / referencia de captura",{exact:true}).fill("Synthetic isolated capture E2E");
    await modal.evaluate(element=>{element.scrollTop=0;});
    await page.screenshot({path:"test-results/capture-export-e2e/capture-form-ipad.png",fullPage:true});
    const saved=page.waitForResponse(r=>r.url().endsWith("/api/v2/capture")&&r.request().method()==="POST");await modal.getByRole("button",{name:"Guardar turno",exact:true}).click();expect((await saved).status()).toBe(201);
    await expect(modal).toHaveCount(0);await page.reload();
    const path=`/api/v2/operation?from=2026-10-19&to=2026-10-19&rig=${rig}`;
    const state=await (await page.request.get(path)).json();expect(state.summary).toMatchObject({advanceM:15,drillingHours:5,ropMPerHour:3,shiftCount:1});expect(state.shifts[0].totalHours).toBe(12);expect(state.reports[0].survey).toHaveLength(1);expect(state.reports[0].consumptions[0]).toMatchObject({value:25,unit:"gls"});
    const exported=await page.request.get(`/api/v2/export?rig=${rig}`);expect(exported.status()).toBe(200);expect(exported.headers()["content-type"]).toContain("spreadsheetml");
    const files=readZip(await exported.body());expect(files.get("xl/workbook.xml")!.toString()).toContain("Survey");expect(files.get("xl/worksheets/sheet1.xml")!.toString()).toContain("<v>15</v>");expect([...files.values()].map(b=>b.toString()).join("")).not.toMatch(/<f[ >]/);
    const reviewer=await account("reviewer");expect((await reviewer.get(path)).status()).toBe(200);
    const reviewerState=await (await reviewer.get(path)).json();expect(reviewerState.reports[0].consumptions[0]).toMatchObject({value:25,unit:"gls"});
    const standardClient=await account("client");const clientState=await(await standardClient.get(path)).json();expect(clientState.reports[0].consumptions).toEqual([]);expect(clientState.reports[0].materials).toEqual([]);expect(clientState.reports[0].survey).toHaveLength(1);
    for(const action of ["/api/v2/capture","/api/v2/decisions","/api/v2/imports?commit=true"])expect((await reviewer.post(action,{headers:{origin},data:{}})).status()).toBe(403);
    expect((await reviewer.patch("/api/v2/operation",{headers:{origin},data:{}})).status()).toBe(403);
    expect((await reviewer.get("/api/v2/export?tenantId=00000000-0000-4000-8000-000000000e22")).status()).toBe(403);
    expect(await (await reviewer.get(path)).json()).toEqual(state);
    const other=await account("other");expect((await (await other.get(path)).json()).shifts).toHaveLength(0);
    expect((await other.get("/api/v2/operation?tenantId=00000000-0000-4000-8000-000000000e21")).status()).toBe(403);
    expect((await reviewer.delete("/api/auth/login",{headers:{origin}})).status()).toBe(200);expect((await reviewer.get(path)).status()).toBe(401);
    await page.screenshot({path:"test-results/capture-export-e2e/captured-turn-ipad.png",fullPage:true});
  }finally{for(const context of contexts)await context.dispose();await page.request.delete("/api/auth/login",{headers:{origin}});}
});

test("cost hypothesis is explicit, local only and restricted to authorized cost profile",async({page,baseURL})=>{
  const origin=new URL(baseURL!).origin;
  for(const role of ["owner","supervisor","reviewer"]){
    const login=await page.request.post("/api/auth/login",{headers:{origin},data:{email:`${role}@drillops-e2e.example.invalid`,password}});expect(login.status()).toBe(200);
    const before=await(await page.request.get("/api/v2/operation")).json();
    await page.goto("/consumibles");await expect(page.getByRole("heading",{level:1,name:"Consumibles, agua y diesel"})).toBeVisible();
    if(role==="owner"){
      await page.getByLabel("Costo total hipotético",{exact:true}).fill("600");await page.getByLabel("Metros hipotéticos",{exact:true}).fill("150");await page.getByLabel("Moneda declarada",{exact:true}).fill("USD");
      await expect(page.getByRole("status").filter({hasText:"Hipótesis:"})).toHaveText("Hipótesis: 4 USD/m = costo total ÷ metros. No es costo real.");
      expect(await(await page.request.get("/api/v2/operation")).json()).toEqual(before);
      await page.reload();await expect(page.getByLabel("Costo total hipotético",{exact:true})).toHaveValue("");await expect(page.getByLabel("Moneda declarada",{exact:true})).toHaveValue("");
    }else{
      await expect(page.getByLabel("Costo total hipotético",{exact:true})).toHaveCount(0);await expect(page.getByText("Las tarifas y costos no están disponibles para este perfil.",{exact:true})).toBeVisible();
    }
    expect(await(await page.request.get("/api/v2/operation")).json()).toEqual(before);
    expect((await page.request.delete("/api/auth/login",{headers:{origin}})).status()).toBe(200);
  }
});

test("visual shift correction persists, shows utilization and refuses stale revisions", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const rig = `RIG-CORRECTION-${Date.now()}`;
  await page.request.post("/api/auth/login", { headers: { origin }, data: { email: "supervisor@drillops-e2e.example.invalid", password } });
  try {
    const captured = await page.request.post("/api/v2/capture", { headers: { origin }, data: {
      date: "2026-10-20", rigCode: rig, holeCode: "SYNTHETIC-CORRECTION", shiftType: "day",
      startDepthM: 100, endDepthM: 112, parameters: {},
      activities: [{ label: "PERFORACIÓN", hours: 6 }, { label: "Estabilización", hours: 6 }],
      reason: "Synthetic isolated visual correction",
    } });
    expect(captured.status()).toBe(201);
    const path = `/api/v2/operation?rig=${rig}`;
    await page.setViewportSize({ width: 1024, height: 1366 });
    await page.goto(`/turnos?rig=${rig}`);
    await expect(page.getByRole("meter", { name: "Utilización del turno" })).toHaveAttribute("aria-valuenow", "50");
    await page.getByRole("button", { name: "Corregir", exact: true }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Avance corregido (m)", { exact: true }).fill("10");
    await modal.getByLabel("Horas de perforación corregidas (h)", { exact: true }).fill("5");
    await modal.getByLabel("Motivo de la corrección").fill("Corrección sintética autorizada de prueba");
    await modal.getByRole("button", { name: "Guardar corrección auditada" }).click();
    await expect(modal).toHaveCount(0);
    await page.reload();
    let state = await (await page.request.get(path)).json();
    expect(state.shifts[0]).toMatchObject({ advanceM: 10, drillingHours: 5, revision: 2, startDepthM: 100, endDepthM: 112 });
    await page.getByRole("button", { name: "Corregir", exact: true }).click();
    await modal.getByLabel("Avance corregido (m)", { exact: true }).fill("8");
    await modal.getByLabel("Motivo de la corrección").fill("Borrador obsoleto que no debe persistir");
    expect((await page.request.patch("/api/v2/operation", { headers: { origin }, data: {
      logicalKey: state.shifts[0].logicalKey, revision: 2, advanceM: 9, drillingHours: 5, reason: "Concurrent synthetic authorized correction",
    } })).status()).toBe(200);
    const response = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().endsWith("/api/v2/operation"));
    await modal.getByRole("button", { name: "Guardar corrección auditada" }).click();
    expect((await response).status()).toBe(409);
    await expect(modal.getByText("Otro usuario guardó una revisión más reciente.", { exact: false })).toBeVisible();
    await modal.getByRole("button", { name: "Recargar versión vigente" }).click();
    await expect(modal).toHaveCount(0);
    state = await (await page.request.get(path)).json();
    expect(state.shifts[0]).toMatchObject({ advanceM: 9, revision: 3 });
    await page.request.delete("/api/auth/login", { headers: { origin } });
    await page.request.post("/api/auth/login", { headers: { origin }, data: { email: "reviewer@drillops-e2e.example.invalid", password } });
    await page.goto(`/turnos?rig=${rig}`);
    await expect(page.getByRole("button", { name: "Corregir", exact: true })).toHaveCount(0);
    expect((await page.request.patch("/api/v2/operation", { headers: { origin }, data: {
      logicalKey: state.shifts[0].logicalKey, revision: 3, advanceM: 8, drillingHours: 5, reason: "Denied reviewer correction",
    } })).status()).toBe(403);
    await page.goto("/bit-advisor");
    await page.getByRole("button", { name: "Información: Coeficientes y horizonte del escenario" }).click();
    await expect(page.getByRole("region", { name: "Coeficientes y horizonte del escenario" })).toContainText("no desde la inicial");
    await expect(page.getByRole("combobox", { name: "Procedencia de UCS", exact: true })).toHaveValue("hypothetical");
    await expect(page.getByLabel("UCS (MPa, opcional)", { exact: true })).toHaveValue("200");
  } finally { await page.request.delete("/api/auth/login", { headers: { origin } }); }
});
