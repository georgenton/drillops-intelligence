import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {chromium} from "@playwright/test";
const base=process.env.REVIEW_BASE_URL??"http://127.0.0.1:3329";
if(!["http://127.0.0.1:3329","https://staging.drillops.syntavera.dev"].includes(base))throw Error("Review target not authorized");
const root=process.env.REVIEW_EVIDENCE_DIR;
if(!root||!path.isAbsolute(root))throw Error("Private evidence directory required");
fs.mkdirSync(root,{recursive:true,mode:0o700});
const access=JSON.parse(fs.readFileSync(path.join(process.env.HOME,".config/syntavera/secrets/drillops-raul-staging-access.json"),"utf8"));
const browser=await chromium.launch();
const context=await browser.newContext({baseURL:base,viewport:{width:1440,height:1000}});
const outcomes=[];
try{
 const loginPage=await context.newPage();
 await loginPage.goto("/login");await loginPage.waitForLoadState("networkidle");
 await loginPage.getByLabel("Correo electrónico",{exact:true}).fill(access.email);
 await loginPage.getByLabel("Contraseña",{exact:true}).fill(access.password);
 await loginPage.getByRole("button",{name:"Ingresar",exact:true}).click();
 await loginPage.waitForURL("**/dashboard");await loginPage.close();
 const before=await(await context.request.get("/api/v2/operation")).json();
 assert.equal(before.summary.shiftCount,248);assert.ok(Math.abs(before.summary.advanceM-2813.25)<1e-8);assert.equal(before.summary.drillingHours,1280);
 const response=await context.request.get("/api/v2/review-scenario");assert.equal(response.status(),200);
 const {scenario}=await response.json();assert.equal(scenario.id,"REVISION_RAUL_2026_10_V1");assert.equal(scenario.revision,"RAUL_V2_2026_10_20");
 for(const sample of scenario.raulMse)assert.deepEqual(scenario.manifest.find(row=>row.field===sample.id)?.value,sample);
 const repeat=await(await context.request.get("/api/v2/review-scenario")).json();assert.deepEqual(repeat.scenario,scenario);
 fs.writeFileSync(path.join(root,"datos-y-supuestos.json"),JSON.stringify(scenario,null,2),{mode:0o600});
 for(const [format,file]of [["csv","datos-y-supuestos.csv"],["html","informe-datos-y-supuestos.html"]]){
  const res=await context.request.get(`/api/v2/review-scenario/report?format=${format}`);assert.equal(res.status(),200);
  fs.writeFileSync(path.join(root,file),await res.body(),{mode:0o600});
 }
 const errors=[];const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
 for(const width of [1440,1024]){
  await page.setViewportSize({width,height:width===1440?1000:768});
  for(const section of ["dashboard","operacion","turnos","sondeos","taladros","intervalos","coronas","bit-advisor","survey","depth-intelligence","inventario","consumibles","analitica","drill-assistant","reportes"]){
   await page.goto(`/${section}`);await page.waitForLoadState("networkidle");
   await page.getByText("Versión de revisión · reportes reales + supuestos para validar",{exact:true}).waitFor();
   assert.equal(new URL(page.url()).pathname,`/${section}`);
   const canvases=await page.locator("canvas").count();
   const chartRequired=["dashboard","operacion","coronas","bit-advisor","survey","depth-intelligence","consumibles","analitica"].includes(section);
   if(chartRequired)assert.ok(canvases>0||await page.locator(".trajectory-3d svg,.recommend-card .score-bar span").count()>0,`${section}: rendered chart`);
   const writes=page.getByRole("button",{name:/^(Guardar decisión|Nuevo turno online|Registrar taladro|Nuevo sondeo|Guardar movimiento|Guardar adjunto privado|Registrar intervalo)$/});
   for(const button of await writes.all())assert.equal(await button.isEnabled(),false,`${section}: write denied`);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
   assert.equal(overflow,false,`${section}: horizontal overflow ${width}`);
   if(section==="coronas"){
    const chart=page.getByRole("img",{name:/^ROP histórica por corona:/});
    const verifyComparison=async()=>{
     const rows=await page.locator(".crown-ranking>div").evaluateAll(els=>els.map(el=>({brand:el.querySelector("b").textContent,type:el.querySelector("small").textContent.split(" · ")[0],rop:el.querySelector("dd").textContent})));
     assert.ok(rows.length>0);
     assert.equal(await chart.getAttribute("aria-label"),`ROP histórica por corona: ${rows.map(r=>`${r.brand} · ${r.type}: ${r.rop}`).join("; ")}`);
     const panel=chart.locator("xpath=ancestor::section[1]");
     assert.doesNotMatch(await panel.innerText(),/sintétic|simulad|catálogo didáctico/i);
     await chart.locator("canvas").first().waitFor();
     assert.ok(await chart.locator("canvas").first().evaluate(el=>el.getContext("2d").getImageData(0,0,el.width,el.height).data.some((v,i)=>i%4===3&&v>0)));
     return rows;
    };
    const rows=await verifyComparison();
    const expand=page.getByRole("button",{name:/^Ver \d+ comparaciones$/});
    if(await expand.count()){await expand.click();await verifyComparison();await page.getByRole("button",{name:"Ver cinco",exact:true}).click();await verifyComparison();}
    outcomes.push({section,width,comparison:rows,chartMatchesTable:true});
   }
   if(section==="intervalos"||section==="depth-intelligence"){
    assert.doesNotMatch(await page.locator("main").innerText(),/MSE sin familia|unsupported_family|missing_or_nonfinite_input|invalid_input|nonfinite_result|Familia desconocida/i);
    const valid=page.getByRole("button",{name:/^Información: MSE (HQ|NQ) · cálculo y fuente$/});
    assert.ok(await valid.count()>0);
    await valid.first().click();
    assert.match(await page.locator("main").innerText(),/Pulldown/);
    await valid.first().click();
    if(section==="intervalos"){
     const cells=page.locator(".table-panel tbody tr td:nth-child(7)");
     let unavailable=0;
     for(const cell of await cells.all())if((await cell.innerText()).trim()==="—"){unavailable++;assert.equal(await cell.locator("button").count(),0);}
     outcomes.push({section,width,unavailableCells:unavailable,invalidDetailsHidden:true});
    }
   }
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:path.join(root,`${section}-${width}.png`),fullPage:true});
   if(section==="coronas")await page.locator(".split-grid").first().screenshot({path:path.join(root,`comparacion-coronas-${width}.png`)});
   const essential={dashboard:".planning-grid",survey:".survey-visual","bit-advisor":".advisor-layout","depth-intelligence":".depth-layout"}[section];
   if(width===1440&&essential)await page.locator(essential).screenshot({path:path.join(root,`detalle-${section}.png`)});
   if(section==="depth-intelligence"){await page.locator(".depth-chart-panel").evaluate(el=>{el.scrollLeft=el.scrollWidth;});await page.locator(".depth-layout").screenshot({path:path.join(root,`depth-mse-${width}.png`)});}
   outcomes.push({section,width,canvases,pass:true});
   if(section==="survey"){await page.getByRole("button",{name:"Perfil 2D",exact:true}).click();await page.locator(".survey-visual canvas").first().waitFor();await page.waitForTimeout(1000);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(root,`survey-2d-${width}.png`),fullPage:true});}
  }
 }
 await page.goto("/dashboard");await page.waitForLoadState("networkidle");
 await page.getByRole("button",{name:"Sólo datos del Excel",exact:true}).click();
 await page.getByText("Sólo datos del Excel · sin complementos",{exact:true}).waitFor();
 await page.screenshot({path:path.join(root,"dashboard-solo-excel.png"),fullPage:true});
 await page.getByRole("button",{name:"Ver escenario completo",exact:true}).click();
 await page.goto("/drill-assistant");await page.waitForLoadState("networkidle");
 await page.getByRole("button",{name:"¿Cuál es el stock del escenario?",exact:true}).click();
 await page.getByText(/REV-CORONA-1: 5 unidades, 1 reservadas, 4 disponibles/).waitFor();
 for(const endpoint of ["operation","review-scenario","review-scenario/report"])assert.equal((await context.request.get(`/api/v2/${endpoint}?tenantId=00000000-0000-4000-8000-000000000e22`)).status(),403);
 const after=await(await context.request.get("/api/v2/operation")).json();assert.deepEqual(after,before);
 assert.deepEqual(errors,[]);
 assert.equal((await context.request.delete("/api/auth/login",{headers:{origin:base}})).status(),200);
 assert.equal((await context.request.get("/api/v2/review-scenario")).status(),401);
 fs.writeFileSync(path.join(root,"verificacion.json"),JSON.stringify({base,scenarioId:scenario.id,revision:scenario.revision,sourceVersion:scenario.sourceVersion,outcomes,originalControls:before.summary,errors,readOnly:true,acceptanceRaul:"pending"},null,2),{mode:0o600});
 console.log(JSON.stringify({target:base,checks:outcomes.length,errors,originalControls:"248 / 2813.25m / 1280h",evidence:root}));
}finally{await context.close();await browser.close();}
