import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/private-auth",()=>({privateSession:mocks.session,assertSameOrigin:vi.fn()}));
vi.mock("@/lib/operational-store",()=>({readOperation:mocks.read,correctShift:vi.fn()}));
import {GET} from "./route";
beforeEach(()=>{
 mocks.session.mockResolvedValue({tenantId:"tenant",userId:"user",role:"client",plan:"Premium",name:"Client",email:"test@example.invalid"});
 mocks.read.mockImplementation(async()=>({crowns:[],shifts:[],decisions:[{private:true}],quickRecords:[{kind:"consumption",logicalKey:"shift",payload:{item:"private item"}},{kind:"interval",logicalKey:"shift",payload:{startDepthM:1,endDepthM:2}}],reports:[{survey:[],consumptions:[{label:"private item"}],materials:[{label:"private material"}]}]}));
});
describe("operation quick record redaction",()=>{
 it("withholds consumption journal and projected consumptions from client",async()=>{
  const response=await GET(new Request("https://test.invalid/api/v2/operation"));expect(response.status).toBe(200);
  const data=await response.json();expect(data.quickRecords.map((r:{kind:string})=>r.kind)).toEqual(["interval"]);
  expect(data.reports[0].consumptions).toEqual([]);expect(data.reports[0].materials).toEqual([]);expect(data.decisions).toEqual([]);
  expect(JSON.stringify(data)).not.toContain("private item");
 });
 it("retains consumption evidence for operational reviewer without granting writes",async()=>{
  mocks.session.mockResolvedValue({tenantId:"tenant",userId:"user",role:"operational_reviewer",plan:"Premium"});
  const response=await GET(new Request("https://test.invalid/api/v2/operation"));
  const data=await response.json();expect(data.quickRecords).toHaveLength(2);expect(data.reports[0].consumptions).toHaveLength(1);
 });
});
