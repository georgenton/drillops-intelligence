import { test,expect,type Browser,type BrowserContext,type Page } from "@playwright/test";
import { randomUUID,createHash } from "node:crypto";
const password="Synthetic-E2E-Only-2026!";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64");
async function account(browser:Browser,baseURL:string,name:string){
  const context=await browser.newContext({baseURL});
  const response=await context.request.post("/api/auth/login",{headers:{origin:new URL(baseURL).origin},data:{email:`${name}@drillops-e2e.example.invalid`,password}});
  expect(response.status()).toBe(200);return context;
}
async function saveModal(page:Page){
  await page.getByLabel("Motivo de configuración").fill("Synthetic E2E approved configuration");
  await page.getByRole("button",{name:"Guardar ficha",exact:true}).click();
  await expect(page.getByText("Ficha guardada. Los indicadores usarán los valores declarados.",{exact:true})).toBeVisible();
}
test("recovered catalog, inventory and private report attachments persist and isolate",async({browser,baseURL})=>{
  test.setTimeout(120_000);
  expect(["localhost","127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const contexts:BrowserContext[]=[];
  try {
    const owner=await account(browser,baseURL!,"owner");contexts.push(owner);
    const origin=new URL(baseURL!).origin,headers={origin},code=`SYN-${randomUUID().slice(0,8).toUpperCase()}`,rig=`RIG-${code}`,hole=`HOLE-${code}`;
    const page=await owner.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    // Original catalog forms, not API-only simulated saves.
    await page.goto("/taladros");await page.getByRole("button",{name:"Registrar taladro",exact:true}).click();
    await page.getByLabel("Código",{exact:true}).fill(rig);
    await page.getByLabel("Tarifa declarada (USD/h)").fill("25");
    await page.getByLabel("Actividades que representan indisponibilidad mecánica (una por línea)").fill("ESPERA");
    await page.getByLabel("Criterio y evidencia de clasificación mecánica").fill("Synthetic fixture only: this ESPERA is a documented mechanical stop, not a client classification.");
    await saveModal(page);
    await page.goto("/sondeos");await page.getByRole("button",{name:"Nuevo sondeo",exact:true}).click();
    await page.getByLabel("Código",{exact:true}).fill(hole);await page.getByLabel("Taladro asignado").selectOption(rig);
    await page.getByLabel("Profundidad objetivo (m)").fill("200");await page.getByLabel("Meta por guardia (m)").fill("20");
    await page.getByLabel("Inicio de programación").fill("2026-05-01");await page.getByLabel("Guardias programadas por día").selectOption("2");
    await page.getByLabel("Registrar configuración espacial respaldada por evidencia").check();
    await page.getByLabel("Convención angular Survey").selectOption("dip_negative_down");
    await page.getByLabel("Referencia de norte Survey").selectOption("true_north");
    await page.getByLabel("Método de trayectoria").selectOption("minimum_curvature");
    for(const label of ["Anclaje MD (m)","Anclaje Este (m)","Anclaje Norte (m)","Anclaje TVD (m)"])await page.getByLabel(label,{exact:true}).fill("0");
    await page.getByLabel("Evidencia de convención y origen").fill("Synthetic local anchor and negative-down convention confirmed for test only");
    await saveModal(page);
    await page.reload();await expect(page.locator(".hole-card").filter({hasText:hole})).toContainText("200");
    const catalog=await (await owner.request.get("/api/v2/catalog")).json();
    expect(catalog.rigs.find((r:{code:string})=>r.code===rig).hourlyCostUsd).toBe(25);
    expect(catalog.holes.find((h:{code:string})=>h.code===hole)).toMatchObject({targetDepthM:200,plannedMetersPerShift:20,guardsPerDay:2});
    // Establish a synthetic report through the actual capture service.
    const capture=await owner.request.post("/api/v2/capture",{headers,data:{date:"2026-05-01",rigCode:rig,holeCode:hole,shiftType:"day",startDepthM:0,endDepthM:10,activities:[{label:"PERFORACIÓN",hours:5},{label:"ESPERA",hours:7}],parameters:{},survey:[{depthM:0,dip:-90,azimuth:0,reference:"Synthetic true north",equipment:"Synthetic station"},{depthM:10,dip:-80,azimuth:0,reference:"Synthetic true north",equipment:"Synthetic station"}],reason:"Synthetic workflow capture"}});
    expect(capture.status()).toBe(201);
    const filter=`from=2026-05-01&to=2026-05-01&rig=${rig}&hole=${hole}`;
    const operation=await (await owner.request.get(`/api/v2/operation?${filter}`)).json();
    expect(operation.summary.advanceM).toBe(10);
    const reportKey=operation.reports[0].key;
    await page.goto(`/survey?${filter}`);
    await expect(page.getByRole("img",{name:`Trayectoria tridimensional de ${rig} · ${hole}`})).toBeVisible();
    await expect(page.getByLabel("Rotación de trayectoria")).toBeVisible();
    await page.getByRole("button",{name:"Perfil 2D",exact:true}).click();
    await expect(page.getByRole("img",{name:"Perfiles observados DIP y azimut por profundidad"})).toBeVisible();
    await page.goto(`/dashboard?${filter}`);
    await expect(page.locator(".kpi-card").filter({hasText:"Metros perforados"})).toContainText("10");
    await expect(page.locator(".kpi-card").filter({hasText:"Costo operativo estimado"})).toContainText("12,5");
    await expect(page.locator(".progress-panel")).toContainText("5%");
    await expect(page.locator(".availability-panel")).toContainText("1/1 turnos");
    // Explicit opening in UI; subsequent API receipts use real transaction path.
    await page.goto("/inventario");await page.getByLabel("Código del artículo").fill(code);
    await page.getByLabel("Cantidad",{exact:true}).fill("5");await page.getByLabel("Motivo auditable").fill("Synthetic initial stock");
    await page.getByRole("button",{name:"Guardar movimiento",exact:true}).click();await expect(page.getByRole("status")).toContainText("Movimiento persistido");
    const movement={requestId:randomUUID(),code,unit:"units",kind:"in",quantity:2,reason:"Synthetic receipt"};
    expect((await owner.request.post("/api/v2/inventory",{headers,data:movement})).status()).toBe(201);
    expect((await (await owner.request.post("/api/v2/inventory",{headers,data:movement})).json()).replayed).toBe(true);
    expect((await owner.request.post("/api/v2/inventory",{headers,data:{...movement,requestId:randomUUID(),kind:"out",quantity:3}})).status()).toBe(201);
    expect((await owner.request.post("/api/v2/inventory",{headers,data:{...movement,requestId:randomUUID(),kind:"out",quantity:20}})).status()).toBe(409);
    expect((await owner.request.post("/api/v2/inventory",{headers,data:{...movement,requestId:randomUUID(),code:`NO-OPEN-${code}`}})).status()).toBe(409);
    await page.reload();await expect(page.getByRole("cell",{name:code,exact:true}).first()).toBeVisible();
    const stock=await (await owner.request.get("/api/v2/inventory")).json();expect(stock.balances.find((b:{code:string})=>b.code===code).balance).toBe(4);
    // Upload in UI, reload, authenticated byte-for-byte download.
    await page.goto(`/reportes?${filter}`);
    await page.getByLabel("Archivo",{exact:true}).setInputFiles({name:"synthetic.png",mimeType:"image/png",buffer:png});
    await page.getByLabel("Motivo / descripción").fill("Synthetic private image");
    await page.getByRole("button",{name:"Guardar adjunto privado"}).click();
    await expect(page.getByRole("link",{name:"synthetic.png",exact:true})).toBeVisible();
    await page.reload();await expect(page.getByRole("img",{name:"Synthetic private image",exact:true})).toBeVisible();
    const list=await (await owner.request.get(`/api/v2/report-attachments?${new URLSearchParams({reportKey})}`)).json();const id=list.attachments[0].id;
    const download=await owner.request.get(`/api/v2/report-attachments/${id}`);
    expect(download.status()).toBe(200);expect(download.headers()["x-content-type-options"]).toBe("nosniff");
    expect(createHash("sha256").update(await download.body()).digest("hex")).toBe(createHash("sha256").update(png).digest("hex"));
    const upload=(buffer:Buffer,mimeType:string,name="test.png")=>owner.request.post("/api/v2/report-attachments",{headers,multipart:{reportKey,reason:"Synthetic security test",file:{name,mimeType,buffer}}});
    expect((await upload(Buffer.from("<svg><script>alert(1)</script></svg>"),"image/png")).status()).toBe(415);
    expect((await upload(Buffer.alloc(3*1024*1024+1),"image/png")).status()).toBe(413);
    const pdf=await upload(Buffer.from("%PDF-1.7\nSynthetic nonrendered fixture"),"application/pdf","synthetic.pdf");expect(pdf.status()).toBe(201);
    const pdfDownload=await owner.request.get(`/api/v2/report-attachments/${(await pdf.json()).id}`);expect(pdfDownload.headers()["content-disposition"]).toContain("attachment;");
    // Role and tenant isolation, including tenant query spoofing and byte endpoint.
    const reviewer=await account(browser,baseURL!,"reviewer");contexts.push(reviewer);
    expect((await reviewer.request.get("/api/v2/inventory")).status()).toBe(200);
    expect((await reviewer.request.post("/api/v2/inventory",{headers,data:{...movement,requestId:randomUUID()}})).status()).toBe(403);
    expect((await reviewer.request.post("/api/v2/report-attachments",{headers,multipart:{reportKey,reason:"Denied reviewer write",file:{name:"test.png",mimeType:"image/png",buffer:png}}})).status()).toBe(403);
    expect((await reviewer.request.post("/api/v2/catalog",{headers,data:{kind:"rig",record:{code:`DENIED-${code}`},reason:"Denied reviewer write"}})).status()).toBe(403);
    const redacted=await (await reviewer.request.get("/api/v2/catalog")).json();expect(redacted.rigs.find((r:{code:string})=>r.code===rig)).not.toHaveProperty("hourlyCostUsd");
    const other=await account(browser,baseURL!,"other");contexts.push(other);
    expect((await other.request.get(`/api/v2/report-attachments/${id}`)).status()).toBe(404);
    expect((await other.request.get(`/api/v2/report-attachments?${new URLSearchParams({reportKey})}`)).status()).toBe(200);
    expect((await (await other.request.get(`/api/v2/report-attachments?${new URLSearchParams({reportKey})}`)).json()).attachments).toHaveLength(0);
    expect((await other.request.get("/api/v2/inventory?tenantId=00000000-0000-4000-8000-000000000e21")).status()).toBe(403);
    expect((await (await other.request.get("/api/v2/inventory")).json()).balances.some((b:{code:string})=>b.code===code)).toBe(false);
    expect((await other.request.post("/api/v2/report-attachments",{headers,multipart:{reportKey,reason:"Other tenant denied",file:{name:"test.png",mimeType:"image/png",buffer:png}}})).status()).toBe(404);
    const client=await account(browser,baseURL!,"client");contexts.push(client);expect((await client.request.get("/api/v2/inventory")).status()).toBe(403);
    const anon=await browser.newContext({baseURL});contexts.push(anon);expect((await anon.request.get(`/api/v2/report-attachments/${id}`)).status()).toBe(401);
    await page.emulateMedia({media:"print"});await expect(page.getByRole("img",{name:"Synthetic private image",exact:true})).toBeVisible();await page.emulateMedia({media:"screen"});
    await page.setViewportSize({width:820,height:1180});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:"test-results/recovery-workflows/synthetic-report-ipad.png",fullPage:true});
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
