/** Synthetic reserved test accounts only; runner must target disposable DB5448. */
import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
const password="Synthetic-E2E-Only-2026!";
test("original Advisor controls, crown MSE configuration and depth rendering preserve permissions",async({page,baseURL})=>{
 test.setTimeout(120000);
 const origin=new URL(baseURL!).origin;
 expect(["127.0.0.1","localhost"]).toContain(new URL(baseURL!).hostname);
 const headers={origin},suffix=randomUUID().slice(0,8).toUpperCase(),rig=`RIG-MSE-${suffix}`,hole=`HOLE-MSE-${suffix}`,serial=`BIT-MSE-${suffix}`;
 async function login(role:string){expect((await page.request.post("/api/auth/login",{headers,data:{email:`${role}@drillops-e2e.example.invalid`,password}})).status()).toBe(200);}
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 try{
  await login("owner");
  for(const record of [{kind:"rig",record:{code:rig}},{kind:"hole",record:{code:hole,rigCode:rig}}])expect((await page.request.post("/api/v2/catalog",{headers,data:{...record,reason:"Synthetic isolated MSE setup"}})).status()).toBe(201);
  expect((await page.request.post("/api/v2/capture",{headers,data:{date:"2026-05-02",rigCode:rig,holeCode:hole,shiftType:"day",startDepthM:0,endDepthM:12,activities:[{label:"PERFORACIÓN",hours:6},{label:"ESPERA",hours:6}],parameters:{rpm:600,torque:100,pulldownPsi:500},crown:{serial,type:"HQ",brand:"SYNTHETIC"},reason:"Synthetic isolated MSE capture"}})).status()).toBe(201);
  await page.goto("/coronas");await page.getByRole("button",{name:"Nueva corona",exact:true}).click();
  const modal=page.getByRole("dialog");
  await modal.getByLabel("Código / serie de corona").fill(serial);
  await modal.getByLabel("Fabricante",{exact:true}).fill("SYNTHETIC");
  await modal.getByLabel("Producto",{exact:true}).fill("Synthetic reference");
  await modal.getByRole("combobox",{name:"Diámetro",exact:true}).selectOption("HQ");
  await modal.getByLabel("Precio compra USD").fill("200");
  await modal.getByLabel("Vida de referencia declarada (m)").fill("100");
  await modal.getByLabel("Incluir medición MSE").check();
  await modal.getByLabel("Taladro",{exact:true}).fill(rig);await modal.getByLabel("Sondeo",{exact:true}).fill(hole);
  await modal.getByLabel("Fecha",{exact:true}).fill("2026-05-02");
  for(const [label,value] of [["Profundidad (m)","6"],["Fuerza axial (N)","10000"],["Torque (N·m)","100"],["RPM","600"],["ROP medida (m/h)","2"],["Diámetro exterior (m)","0.1"],["Diámetro interior (m)","0.06"]])await modal.getByLabel(label,{exact:true}).fill(value);
  await modal.getByLabel("Unidades confirmadas",{exact:true}).check();await modal.getByLabel("Geometría confirmada",{exact:true}).check();
  await modal.getByLabel("Evidencia de medición").fill("Synthetic calibrated measurement, not customer observation");
  await modal.getByLabel("Motivo",{exact:true}).fill("Synthetic crown configuration test");
  await modal.getByRole("button",{name:"Guardar corona",exact:true}).click();await expect(modal).toHaveCount(0);
  await page.reload();const stored=await(await page.request.get("/api/v2/catalog")).json();
  const crown=stored.crowns.find((c:{code:string})=>c.code===serial);expect(crown).toMatchObject({priceUsd:200,referenceLifeM:100,revision:1,mseCalibration:{wobN:10000,measurementLocation:"surface"}});
  const filter=new URLSearchParams({rig,hole}).toString();
  await page.goto(`/bit-advisor?${filter}`);
  await expect(page.getByRole("button",{name:"Mayor avance",exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Mayor vida",exact:false}).click();
  await page.getByRole("button",{name:"Cómo se calcula",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"Ranking original"})).toContainText("Vida 45%");
  await page.getByRole("button",{name:"Información: Qué controla cada entrada"}).click();
  await expect(page.getByRole("region",{name:"Qué controla cada entrada"})).toContainText("no intervienen en su fórmula");
  await expect(page.locator(".rec-metrics").first()).toContainText("Vida histórica");
  await page.goto(`/depth-intelligence?${filter}`);await expect(page.locator(".depth-chart canvas")).toHaveCount(1);
  await page.getByRole("button",{name:"Información: Discontinuidades y alcance de las pistas"}).click();
  await expect(page.getByRole("region",{name:"Discontinuidades y alcance de las pistas"})).toContainText("1 rangos válidos");
  await page.setViewportSize({width:1024,height:768});
  await page.screenshot({path:"test-results/recovered-advisor-depth/depth-synthetic-ipad.png",fullPage:true});
  await page.request.delete("/api/auth/login",{headers});await login("reviewer");
  await page.goto("/coronas");await expect(page.getByRole("button",{name:"Nueva corona",exact:true})).toHaveCount(0);
  const redacted=await(await page.request.get("/api/v2/catalog")).json();expect(redacted.crowns.find((c:{code:string})=>c.code===serial)).not.toHaveProperty("priceUsd");
  expect((await page.request.patch("/api/v2/catalog",{headers,data:{kind:"crown",record:{code:serial},revision:1,reason:"Denied reviewer change"}})).status()).toBe(403);
  await page.goto(`/bit-advisor?${filter}`);await expect(page.getByRole("button",{name:"Menor costo",exact:false})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Guardar decisión",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Información: Qué controla cada entrada"}).click();
  await expect(page.getByRole("region",{name:"Qué controla cada entrada"})).toBeVisible();
  await page.screenshot({path:"test-results/recovered-advisor-depth/advisor-reviewer-ipad.png",fullPage:true});
  expect(errors).toEqual([]);
 }finally{await page.request.delete("/api/auth/login",{headers,timeout:5000}).catch(()=>{});}
});

test("four original quick actions persist complementary records without double counting",async({page,baseURL})=>{
 const origin=new URL(baseURL!).origin,headers={origin},rig=`RIG-QUICK-${randomUUID().slice(0,8).toUpperCase()}`;
 expect((await page.request.post("/api/auth/login",{headers,data:{email:"supervisor@drillops-e2e.example.invalid",password}})).status()).toBe(200);
 try{
  expect((await page.request.post("/api/v2/capture",{headers,data:{date:"2026-05-03",rigCode:rig,holeCode:"SYNTHETIC-QUICK",shiftType:"day",startDepthM:100,endDepthM:112,activities:[{label:"PERFORACIÓN",hours:6},{label:"ESPERA",hours:6}],parameters:{},reason:"Synthetic isolated quick records"}})).status()).toBe(201);
  const filter=`rig=${rig}`,before=await(await page.request.get(`/api/v2/operation?${filter}`)).json();
  await page.goto(`/operacion?${filter}`);
  const actions:Array<{name:string;fields:Array<[string,string]>}>=[
   {name:"Registrar intervalo",fields:[["Profundidad inicial (m)","100"],["Profundidad final (m)","103"],["Tiempo de perforación del intervalo (min)","60"]]},
   {name:"Registrar evento",fields:[["Actividad o evento","Revisión sintética"],["Duración declarada (h)","1"]]},
   {name:"Registrar cambio de corona",fields:[["Serie entrante","SYNTHETIC-NEXT-BIT"],["Profundidad del cambio (m)","106"]]},
   {name:"Registrar consumo",fields:[["Material o insumo","Agua sintética"],["Cantidad consumida","2"],["Unidad original (p. ej. L, kg, und)","m3"]]},
  ];
  for(const action of actions){
   await page.getByRole("button",{name:action.name,exact:true}).click();
   const modal=page.getByRole("dialog");for(const [name,value] of action.fields)await modal.getByLabel(name,{exact:true}).fill(value);
   await modal.getByLabel("Motivo / evidencia",{exact:true}).fill("Synthetic isolated quick entry");
   const saved=page.waitForResponse(r=>r.url().endsWith("/api/v2/quick-records")&&r.request().method()==="POST");
   await modal.getByRole("button",{name:"Guardar detalle",exact:true}).click();expect((await saved).status()).toBe(201);await expect(modal).toHaveCount(0);
  }
  await page.reload();
  const details=await(await page.request.get("/api/v2/quick-records")).json();expect(details.records.filter((r:{logicalKey:string})=>r.logicalKey===before.shifts[0].logicalKey)).toHaveLength(4);
  const after=await(await page.request.get(`/api/v2/operation?${filter}`)).json();expect(after.summary).toEqual(before.summary);
  await expect(page.getByRole("table").filter({has:page.getByText("Detalles guardados del filtro actual")})).toContainText("SYNTHETIC-NEXT-BIT");
  await page.request.delete("/api/auth/login",{headers});
  await page.request.post("/api/auth/login",{headers,data:{email:"reviewer@drillops-e2e.example.invalid",password}});
  await page.goto(`/operacion?${filter}`);for(const action of actions)await expect(page.getByRole("button",{name:action.name,exact:true})).toHaveCount(0);
  expect((await page.request.post("/api/v2/quick-records",{headers,data:{}})).status()).toBe(403);
 }finally{await page.request.delete("/api/auth/login",{headers,timeout:5000}).catch(()=>{});}
});
