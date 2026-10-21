import {test,expect} from "@playwright/test";
import {Pool} from "pg";
import {readZip} from "../packages/import/zip";
const tenant="00000000-0000-4000-8000-000000000e21";
const password="Synthetic-E2E-Only-2026!";
test("read-only review scenario is deterministic, populated, exportable and tenant isolated",async({browser,baseURL})=>{
 test.setTimeout(120_000);
 const appURL=new URL(baseURL!);
 expect(["127.0.0.1","localhost"]).toContain(appURL.hostname);
 expect(appURL.port).not.toBe("3329");
 const databaseURL=process.env.DRILLOPS_TEST_ADMIN_URL??"postgresql://drillops_test:local-disposable-only@127.0.0.1:5448/drillops_test";
 const dbURL=new URL(databaseURL);
 // Validate before creating a Pool: never use the application's generic DATABASE_URL.
 if(!["127.0.0.1","localhost"].includes(dbURL.hostname)||dbURL.port!=="5448"||dbURL.pathname!=="/drillops_test")throw Error("Review fixtures require disposable localhost DB5448/drillops_test");
 const pool=new Pool({connectionString:databaseURL,max:1});
 const reviewer=await browser.newContext({baseURL}),other=await browser.newContext({baseURL});
 let previousSettings:unknown,restore=false;
 try{
  const original=await pool.query<{settings:unknown;slug:string}>("SELECT settings,slug FROM tenants WHERE id=$1",[tenant]);
  expect(original.rowCount).toBe(1);expect(original.rows[0].slug).toBe(`synthetic-e2e-${tenant}`);
  previousSettings=original.rows[0].settings;
  await pool.query("UPDATE tenants SET settings=jsonb_set(COALESCE(settings,'{}'::jsonb),'{reviewScenarioId}',to_jsonb($2::text)) WHERE id=$1",[tenant,"REVISION_RAUL_2026_10_V1"]);restore=true;
  const headers={origin:appURL.origin};
  const login=await reviewer.request.post("/api/auth/login",{headers,data:{email:"reviewer@drillops-e2e.example.invalid",password}});expect(login.status()).toBe(200);
  const originalOperation=await (await reviewer.request.get("/api/v2/operation?from=2026-05-01&to=2026-05-31")).json();
  const first=await reviewer.request.get("/api/v2/review-scenario");expect(first.status()).toBe(200);
  const scenario=(await first.json()).scenario;
  expect(scenario.id).toBe("REVISION_RAUL_2026_10_V1");expect(scenario.manifest.length).toBeGreaterThan(0);expect(scenario.sourceVersion).toMatch(/^[a-f0-9]{64}$/);
  expect((await (await reviewer.request.get("/api/v2/review-scenario")).json()).scenario).toEqual(scenario);
  expect(scenario.candidates).toHaveLength(3);
  expect(scenario.revision).toBe("RAUL_V2_2026_10_20");
  for(const sample of scenario.raulMse)expect(scenario.manifest.find((entry:{field:string})=>entry.field===sample.id).value).toEqual(sample);
  expect(scenario.candidates.every((c:{stock:number;reserved:number})=>c.stock===5&&c.reserved===1)).toBe(true);
  const page=await reviewer.newPage(),failures:string[]=[];
  page.on("pageerror",error=>failures.push(error.message));
  await page.goto("/dashboard");
  await expect(page.getByText("Versión de revisión · reportes reales + supuestos para validar",{exact:true})).toBeVisible();
  await page.goto("/operacion");await expect(page.getByRole("heading",{name:"Día, noche y total del periodo"})).toBeVisible();
  await page.goto("/intervalos");await expect(page.getByRole("heading",{name:/MSE experimental · misma muestra/})).toBeVisible();
  await page.goto("/depth-intelligence");await expect(page.getByRole("heading",{name:/MSE HQ\/NQ · entradas/})).toBeVisible();
  await page.goto("/coronas");await expect(page.getByText("Comparación transparente",{exact:true})).toBeVisible();
  const historicalChart=page.getByRole("img",{name:/^ROP histórica por corona:/});
  await expect(historicalChart.locator("canvas")).toBeVisible();
  const comparison=await page.locator(".crown-ranking>div").evaluateAll(rows=>rows.map(row=>`${row.querySelector("b")!.textContent} · ${row.querySelector("small")!.textContent!.split(" · ")[0]}: ${row.querySelector("dd")!.textContent}`));
  await expect(historicalChart).toHaveAttribute("aria-label",`ROP histórica por corona: ${comparison.join("; ")}`);
  await expect(historicalChart.locator("xpath=ancestor::section[1]")).not.toContainText(/sintétic|simulad|catálogo didáctico/i);
  await page.goto("/bit-advisor");
  await expect(page.locator(".recommend-card")).toHaveCount(3);
  for(let i=0;i<3;i++){
   const rank=page.locator(".recommend-card").nth(i).locator(".rank");
   await expect(rank.locator("b")).toHaveText(`#${i+1}`);
   await expect(rank.locator("span")).toHaveText(/^\d+(?:[.,]\d+)?\/100$/);
  }
  await page.goto("/survey");
  const canvas=page.locator(".trajectory-3d canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(()=>canvas.evaluate((el:HTMLCanvasElement)=>el.width>0&&el.height>0&&el.getContext("2d")!.getImageData(0,0,el.width,el.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
  await page.getByRole("button",{name:"Perfil 2D",exact:true}).click();
  await expect(page.getByRole("img",{name:"Perfiles observados DIP y azimut por profundidad"})).toBeVisible();
  await expect(page.locator(".survey-chart canvas")).toBeVisible();
  await page.getByRole("button",{name:"Sólo datos del Excel",exact:true}).click();
  await expect(page.getByText("Sólo datos del Excel · sin complementos",{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole("button",{name:"Ver escenario completo",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Ver escenario completo",exact:true}).click();
  await page.goto("/inventario");await expect(page.getByRole("heading",{name:/Inventario de revisión/})).toBeVisible();
  await expect(page.getByRole("button",{name:"Guardar movimiento",exact:true})).toHaveCount(0);
  const exportResponse=await reviewer.request.get("/api/v2/export?from=2026-05-01&to=2026-05-31&review=1");
  expect(exportResponse.status()).toBe(200);
  const zip=readZip(await exportResponse.body()),workbook=zip.get("xl/workbook.xml")!.toString();
  expect(workbook).toContain("Escenario de revisión");
  expect([...zip.values()].map(b=>b.toString()).join("\n")).toContain(scenario.id);
  const excelExport=await reviewer.request.get("/api/v2/export?from=2026-05-01&to=2026-05-31");
  expect(readZip(await excelExport.body()).get("xl/workbook.xml")!.toString()).not.toContain("Escenario de revisión");
  const report=await reviewer.request.get("/api/v2/review-scenario/report?format=json");expect(await report.json()).toEqual(scenario);
  const csv=await reviewer.request.get("/api/v2/review-scenario/report?format=csv");expect(csv.status()).toBe(200);expect(await csv.text()).toContain("SINTETICO");
  for(const [endpoint,data]of [
   ["capture",{}],["decisions",{}],["quick-records",{}],["inventory",{}],
   ["catalog",{kind:"rig",record:{code:"DENIED-REVIEW-SYNTHETIC"},reason:"Forbidden review fixture"}],
  ] as const)expect((await reviewer.request.post(`/api/v2/${endpoint}`,{headers,data})).status(),endpoint).toBe(403);
  expect(await (await reviewer.request.get("/api/v2/operation?from=2026-05-01&to=2026-05-31")).json()).toEqual(originalOperation);
  expect((await other.request.post("/api/auth/login",{headers,data:{email:"other@drillops-e2e.example.invalid",password}})).status()).toBe(200);
  expect((await (await other.request.get("/api/v2/review-scenario")).json()).scenario).toBeNull();
  expect((await other.request.get(`/api/v2/review-scenario?tenantId=${tenant}`)).status()).toBe(403);
  expect((await other.request.get(`/api/v2/review-scenario/report?tenantId=${tenant}`)).status()).toBe(403);
  expect((await other.request.get("/api/v2/review-scenario/report")).status()).toBe(404);
  await page.setViewportSize({width:820,height:1180});await page.goto("/survey");await expect(page.locator(".trajectory-3d canvas")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:"test-results/review-scenario/synthetic-review-survey-ipad.png",fullPage:true});
  expect(failures).toEqual([]);
 }finally{
  // Restore only the reserved fixture's settings; no operational rows are erased.
  try{if(restore)await pool.query("UPDATE tenants SET settings=$2::jsonb WHERE id=$1",[tenant,JSON.stringify(previousSettings)]);}
  finally{await Promise.all([reviewer.close(),other.close(),pool.end()]);}
 }
});
