import { describe, expect, it, vi } from "vitest";
vi.mock("./operational-db",()=>({tenantTransaction:vi.fn()}));
import { prepareCapture } from "./capture-service";
import { exportOperationalXlsx, safeExcelText } from "./export-service";
import { readZip } from "@/packages/import/zip";
describe("true XLSX export",()=>{
  it("retains meter endpoints and distinguishes manually appended evidence from source Excel",async()=>{
    const {payload,report}=prepareCapture({userId:"s",tenantId:"t",email:"s@example.invalid",name:"Synthetic",role:"operations_supervisor",plan:"Premium"},{date:"2026-10-19",rigCode:"TEST",holeCode:"TEST",shiftType:"day",startDepthM:0,endDepthM:10,activities:[{label:"PERFORACIÓN",hours:12}],parameters:{},consumptions:[{label:"Agua",mode:"readings",start:100,end:125,unit:"m3"}],reason:"Synthetic only"});
    report.consumptions.push({...report.consumptions[0],key:"quick:synthetic",cells:{},warnings:["Complemento sintético"]});
    const files=readZip(await exportOperationalXlsx({shifts:[payload],reports:[report],crowns:[]}));
    const xml=[...files.values()].map(value=>value.toString()).join("");
    for(const text of ["Lectura inicial","Lectura final","<v>100</v>","<v>125</v>","Registro complementario manual","Complemento sintético"])expect(xml).toContain(text);
  });
  it("neutralizes formula injection text without changing numeric observations",()=>{
    for(const value of ["=HYPERLINK(1)"," +1","@SUM(A1)","-CMD"])expect(safeExcelText(value)).toBe("'"+value);
    expect(safeExcelText("HQ")).toBe("HQ");
  });
  it("creates genuine OOXML workbook with five named tabs, typed numbers, no formulas or personnel",async()=>{
    const {payload,report}=prepareCapture({userId:"s",tenantId:"t",email:"s@example.invalid",name:"Synthetic",role:"operations_supervisor",plan:"Premium"},{date:"2026-10-19",rigCode:"=1+1",holeCode:"TEST",shiftType:"day",startDepthM:0,endDepthM:10,activities:[{label:"PERFORACIÓN",hours:12}],parameters:{},reason:"Synthetic only"});
    const bytes=await exportOperationalXlsx({shifts:[payload],reports:[report],crowns:[]});
    expect(bytes.subarray(0,2).toString()).toBe("PK");
    const files=readZip(bytes);const workbook=files.get("xl/workbook.xml")!.toString();
    for(const name of ["Turnos","Actividades","Survey","Consumos","Coronas"])expect(workbook).toContain(name);
    const xml=[...files.values()].map(b=>b.toString()).join("");
    expect(xml).not.toMatch(/<f[ >]/);expect(xml).not.toContain("s@example.invalid");expect(xml).toContain("<t>'=1+1</t>");
    expect(files.get("xl/worksheets/sheet1.xml")!.toString()).toContain("<v>10</v>");
  });
});
