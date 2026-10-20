import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { PrivateSession } from "./private-auth";
const mocks=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn()}));
vi.mock("./operational-db",()=>({tenantTransaction:mocks.transaction}));
import { captureShift, prepareCapture, captureSchema } from "./capture-service";
const session:PrivateSession={userId:"synthetic-user",tenantId:"synthetic-tenant",email:"synthetic@example.invalid",name:"Synthetic",role:"operations_supervisor",plan:"Premium"};
const input={date:"2026-10-19",rigCode:"RIG-SYNTHETIC",holeCode:"SYNTHETIC",shiftType:"day",startDepthM:0,endDepthM:15,activities:[{label:"PERFORACIÓN",hours:5},{label:"Rimado",hours:7}],parameters:{rpm:650,torque:1000,pulldownPsi:200},consumptions:[{label:"Combustible",value:25,unit:"gls"}],survey:[{depthM:15,dip:-60,azimuth:240,reference:"Magnético declarado",equipment:"EMS"}],crown:{serial:"TEST-1",type:"HQ"},reason:"Synthetic capture only"};
beforeEach(()=>{mocks.query.mockReset();mocks.transaction.mockReset();mocks.transaction.mockImplementation(async(_tenant:string,work:(c:PoolClient)=>Promise<unknown>)=>work({query:mocks.query} as unknown as PoolClient));mocks.query.mockResolvedValue({rows:[]});});
describe("canonical online capture",()=>{
  it("rejects reviewer/client/demo before querying database",async()=>{
    for(const s of [{...session,role:"operational_reviewer" as const},{...session,role:"client" as const},{...session,demo:true}])await expect(captureShift(s,input)).rejects.toThrow("CAPTURE_DENIED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("does not broaden driller rights into crown or survey",()=>{
    expect(()=>prepareCapture({...session,role:"driller"},input)).toThrow("CAPTURE_DENIED");
  });
  it("preserves declared units, one survey observation, true zero and no fake torque unit",()=>{
    const {payload,report}=prepareCapture(session,input);
    expect(payload.advanceM).toBe(15);expect(payload.drillingHours).toBe(5);expect(payload.parameters.torqueUnit).toBeNull();expect(payload.startDepthM).toBe(0);
    expect(report.survey).toHaveLength(1);expect(report.consumptions[0]).toMatchObject({value:25,unit:"gls",shiftType:"day"});
    expect(payload.crowns[0].observedMetres).toBe(15);
  });
  it("rejects invalid date, totals, impossible advance and unrecognized fields",()=>{
    for(const patch of [{date:"2026-02-30"},{date:"invalid"},{endDepthM:-1},{activities:[{label:"PERFORACIÓN",hours:4}]},{tenantId:"other"},{activities:[{label:"PERFORACIÓN",hours:0},{label:"Standby",hours:12}]}])expect(captureSchema.safeParse({...input,...patch}).success).toBe(false);
  });
  it("writes shift, report and auditable revision inside authorized tenant transaction",async()=>{
    expect(await captureShift(session,input)).toMatchObject({ok:true,revision:1});
    expect(mocks.transaction).toHaveBeenCalledWith(session.tenantId,expect.any(Function));
    for(const [sql,params] of mocks.query.mock.calls){expect(params[0]).toBe(session.tenantId);expect(String(sql)).not.toContain("DELETE");}
    expect(mocks.query.mock.calls.filter(([sql])=>String(sql).startsWith("INSERT"))).toHaveLength(4);
  });
  it("existing shift remains untouched rather than overwriting original customer report",async()=>{
    mocks.query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{logical_key:"existing"}]});
    await expect(captureShift(session,input)).rejects.toThrow("SHIFT_EXISTS");
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
});
