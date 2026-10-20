import { beforeEach,describe,it,expect,vi } from "vitest";
import type { PrivateSession } from "./private-auth";
const db=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("./operational-db",()=>({tenantTransaction:vi.fn(async(_tenant,work)=>work(db))}));
import { saveInventoryMovement,readInventory } from "./operational-inventory";
import { saveAttachment,readAttachmentBytes } from "./operational-attachments";
const owner:PrivateSession={tenantId:"test-tenant",userId:"test-actor",role:"general_manager",plan:"Premium",name:"Synthetic",email:"synthetic@example.invalid"};
const movement={requestId:"00000000-0000-4000-8000-000000000001",code:"TEST",unit:"units",kind:"opening",quantity:2,reason:"Synthetic opening"};
const attachment={reportKey:"test-report",reason:"Synthetic test attachment",name:"test.jpg",mime:"image/jpeg",bytes:new Uint8Array([255,216,255])};
beforeEach(()=>{db.query.mockReset();db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("RETURNING id")?[{id:"saved"}]:sql.includes("sum(size)")?[{bytes:"0"}]:[],rowCount:sql.includes("SELECT 1 FROM operational_reports")?1:0}));});
describe("private resources permissions and audit",()=>{
  it.each(["operational_reviewer","client"] as const)("denies %s writes before DB",async role=>{
    await expect(saveInventoryMovement({...owner,role},movement)).rejects.toThrow("FORBIDDEN");
    await expect(saveAttachment({...owner,role},attachment)).rejects.toThrow("FORBIDDEN");
    expect(db.query).not.toHaveBeenCalled();
  });
  it("denies demo writes and client inventory reads",async()=>{
    await expect(saveInventoryMovement({...owner,demo:true},movement)).rejects.toThrow("FORBIDDEN");
    await expect(saveAttachment({...owner,demo:true},attachment)).rejects.toThrow("FORBIDDEN");
    await expect(readInventory({...owner,role:"client"})).rejects.toThrow("FORBIDDEN");
  });
  it("serializes stock changes and records session tenant and actor",async()=>{
    await saveInventoryMovement(owner,movement);
    expect(db.query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    const insert=db.query.mock.calls.find(([sql])=>sql.startsWith("INSERT"));
    expect(insert?.[1]).toEqual(["test-tenant",movement.requestId,"TEST","units","opening",2,2,movement.reason,"test-actor"]);
  });
  it("replays identical inventory requests without inserting twice",async()=>{
    db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("request_id=$2")?[{...movement,id:"saved",balanceAfter:2}]:[]}));
    expect(await saveInventoryMovement(owner,movement)).toMatchObject({replayed:true,balance:2});
    expect(db.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
    await expect(saveInventoryMovement(owner,{...movement,quantity:3})).rejects.toThrow("REQUEST_CONFLICT");
  });
  it("checks report belongs to tenant and retains private bytes+actor",async()=>{
    await saveAttachment(owner,attachment);
    const lookup=db.query.mock.calls.find(([sql])=>sql.includes("SELECT 1 FROM operational_reports"));
    expect(lookup?.[1]).toEqual(["test-tenant","test-report"]);
    const insert=db.query.mock.calls.find(([sql])=>sql.startsWith("INSERT"));
    expect(insert?.[1][0]).toBe("test-tenant");expect(insert?.[1].at(-1)).toBe("test-actor");
    expect(Buffer.isBuffer(insert?.[1][5])).toBe(true);
  });
  it("does not attach to unknown/other-tenant report or download unknown ID",async()=>{
    db.query.mockResolvedValue({rows:[],rowCount:0});
    await expect(saveAttachment(owner,attachment)).rejects.toThrow("NOT_FOUND");
    await expect(readAttachmentBytes(owner,"00000000-0000-4000-8000-000000000001")).rejects.toThrow("NOT_FOUND");
    expect(db.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
  });
});
