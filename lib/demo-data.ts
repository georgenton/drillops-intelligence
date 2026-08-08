import type { Crown, Drillhole, Interval, Rig, Shift, Tenant } from "@/packages/domain/types";

export const tenants: Tenant[] = [
  { id:"extract", name:"Extract Services Demo", slug:"extract-services", color:"#d7ff43", plan:"Professional", status:"active" },
  { id:"minera-a", name:"Cliente Minero Demo A", slug:"minero-demo-a", color:"#56c7ff", plan:"Starter", status:"trial" },
  { id:"minera-b", name:"Cliente Minero Demo B", slug:"minero-demo-b", color:"#ff9e64", plan:"Enterprise", status:"active" },
];

export const rigs: Rig[] = [
  { id:"mp-07", tenantId:"extract", code:"MP-07", manufacturer:"Multipower", model:"Discovery II", serial:"MP-D2-0719", site:"Secoya Norte", hourlyCost:148, active:true, source:"manual_analog", capabilities:["pressure","torque","rpm","depth"] },
  { id:"hc-03", tenantId:"extract", code:"HC-03", manufacturer:"Hydracore", model:"2000", serial:"HC2K-0308", site:"Secoya Norte", hourlyCost:132, active:true, source:"manual_analog", capabilities:["pressure","rpm","depth"] },
  { id:"mp-a1", tenantId:"minera-a", code:"MP-A1", manufacturer:"Multipower", model:"Discovery II", serial:"MP-A-119", site:"Proyecto Cóndor", hourlyCost:141, active:true, source:"manual_analog", capabilities:["pressure","torque","depth"] },
  { id:"hc-b1", tenantId:"minera-b", code:"HC-B1", manufacturer:"Hydracore", model:"4000", serial:"HC-B-405", site:"Campaña Sur", hourlyCost:162, active:true, source:"digital", capabilities:["pressure","torque","rpm","water","depth"] },
];

export const drillholes: Drillhole[] = [
  { id:"sec-42d", tenantId:"extract", code:"SEC-42D", project:"Campaña Secoya 2026", rigId:"mp-07", targetDepth:600, currentDepth:426, diameter:"HQ", status:"drilling", startDate:"2026-07-21", eta:"2026-08-13" },
  { id:"sec-41d", tenantId:"extract", code:"SEC-41D", project:"Campaña Secoya 2026", rigId:"hc-03", targetDepth:480, currentDepth:480, diameter:"NQ", status:"completed", startDate:"2026-06-17", eta:"2026-07-12" },
  { id:"ama-08", tenantId:"extract", code:"AMA-08", project:"Amazonas Deep", rigId:"mp-07", targetDepth:750, currentDepth:138, diameter:"PQ", status:"planned", startDate:"2026-08-18", eta:"2026-09-25" },
  { id:"con-12", tenantId:"minera-a", code:"CON-12", project:"Proyecto Cóndor", rigId:"mp-a1", targetDepth:520, currentDepth:294, diameter:"HQ", status:"drilling", startDate:"2026-07-28", eta:"2026-08-22" },
  { id:"sur-05", tenantId:"minera-b", code:"SUR-05", project:"Campaña Sur", rigId:"hc-b1", targetDepth:680, currentDepth:351, diameter:"NQ", status:"drilling", startDate:"2026-07-14", eta:"2026-08-29" },
];

const nptSets: Record<string,number>[] = [
  { "Cambio de corona":0.7, "Suministro de agua":0.5, "Estabilización":0.4, "Otros":0.2 },
  { "Cambio de turno":0.5, "Mantenimiento":0.8, "Survey":0.4, "Otros":0.3 },
  { "Avería":1.4, "Espera de repuestos":0.7, "Suministro de agua":0.4, "Otros":0.2 },
  { "Cambio de corona":0.6, "Directional drilling":0.5, "Survey":0.3, "Otros":0.2 },
];

export const shifts: Shift[] = Array.from({ length: 14 }, (_, i) => {
  const metres = [33,36,30,39,34.5,27,24,36,39,37.5,42,40.5,36,43.5][i];
  const end = 426 - (13 - i) * 36;
  return { id:`sh-${i+1}`, tenantId:"extract", drillholeId:"sec-42d", rigId:"mp-07", date:`2026-08-${String(1 + Math.floor(i/2)).padStart(2,"0")}`, type:i%2?"Noche":"Día", crew:i%2?"Bravo":"Águila", depthStart:end-metres, depthEnd:end, effectiveHours:[8.4,9.1,7.8,9.4,8.7,6.8,6.1,8.9,9.2,9.0,9.7,9.4,8.8,9.8][i], totalHours:12, npt:nptSets[i%4] };
});

const bits = ["GT-X7", "DIAB-M8", "GT-X7", "TORQ-A9"];
const comments = ["Perforación estable", "Fracturación moderada", "Retorno parcial de agua", "Vibración elevada", "Cambio de corona", "Recuperación estable"];
export const intervals: Interval[] = Array.from({ length: 96 }, (_, i) => {
  const startDepth = 138 + i * 3;
  const anomaly = i >= 61 && i <= 66;
  const minutes = anomaly ? 76 + (i%3)*5 : 39 + ((i*7)%18);
  const hardness = i < 24 ? 2 : i < 52 ? 3 : i < 79 ? 4 : 5;
  return {
    id:`int-${i+1}`, tenantId:"extract", drillholeId:"sec-42d", shiftId:`sh-${Math.min(14, Math.floor(i/7)+1)}`, rigId:"mp-07", startDepth, endDepth:startDepth+3, minutes, bitCode:bits[Math.floor(i/24)%bits.length], pressure:22 + hardness*8 + ((i*3)%7), torque:310 + hardness*74 + ((i*17)%60), rpm:880 - hardness*65 + ((i*11)%50), waterFlow:32 - hardness*2 + (i%4), waterReturn:i%17===0?"lost":i%7===0?"partial":"complete", recovery:Math.max(72, 98 - (i%9)*2 - (anomaly?8:0)), hardness, fracturing:i%11<2?"high":i%5<2?"medium":"low", abrasivity:hardness>=4?"high":hardness===3?"medium":"low", vibration:anomaly?"high":i%6===0?"medium":"low", stability:anomaly||i%13===0?"unstable":"stable", comment:comments[i%comments.length], source:i<8?"imported":"manual"
  };
});

const crownBase: Omit<Crown,"tenantId">[] = [
  { id:"gt-x7", manufacturer:"GoldTech", product:"Velocity X7", matrix:"X7-12", diameter:"HQ", price:2280, stock:5, reserved:1, reorder:2, historicalRop:3.8, historicalCost:42, historicalLife:188, observations:18, hardnessFit:[3,4], fracturingFit:["medium","high"] },
  { id:"diab-m8", manufacturer:"Diamantec", product:"Matrix M8", matrix:"M8-14", diameter:"HQ", price:1990, stock:8, reserved:1, reorder:3, historicalRop:3.1, historicalCost:34, historicalLife:224, observations:27, hardnessFit:[4,5], fracturingFit:["low","medium"] },
  { id:"torq-a9", manufacturer:"TorqCore", product:"Apex A9", matrix:"A9-13", diameter:"HQ", price:2470, stock:3, reserved:0, reorder:2, historicalRop:3.45, historicalCost:37, historicalLife:246, observations:13, hardnessFit:[4,5], fracturingFit:["medium","high"] },
  { id:"nq-r6", manufacturer:"GoldTech", product:"Resist R6", matrix:"R6-10", diameter:"NQ", price:1740, stock:4, reserved:1, reorder:2, historicalRop:4.1, historicalCost:30, historicalLife:265, observations:9, hardnessFit:[2,3], fracturingFit:["low","medium"] },
  { id:"pq-v5", manufacturer:"Diamantec", product:"Vector V5", matrix:"V5-09", diameter:"PQ", price:2840, stock:0, reserved:0, reorder:2, historicalRop:2.8, historicalCost:51, historicalLife:210, observations:4, hardnessFit:[2,3], fracturingFit:["low"] },
];

export const crowns: Crown[] = [
  ...crownBase.map(c => ({ ...c, tenantId:"extract" as const })),
  { ...crownBase[0], id:"a-x7", tenantId:"minera-a", stock:2, observations:6 },
  { ...crownBase[3], id:"b-r6", tenantId:"minera-b", stock:7, observations:21 },
];

export const survey = Array.from({length:15}, (_,i) => ({ depth:i*30, inclination:-62-(i*0.72), azimuth:118+(i*1.9) }));

export function tenantData<T extends { tenantId: string }>(rows: T[], tenantId: string): T[] { return rows.filter(r => r.tenantId === tenantId); }
