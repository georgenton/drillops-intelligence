import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),origin:vi.fn(),read:vi.fn(),save:vi.fn()}));
vi.mock("@/lib/private-auth",()=>({privateSession:mocks.session,assertSameOrigin:mocks.origin}));
vi.mock("@/lib/quick-operation-records",()=>({readQuickRecords:mocks.read,saveQuickRecord:mocks.save}));
import {GET,POST} from "./route";
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({tenantId:"a"});mocks.read.mockResolvedValue([]);mocks.save.mockResolvedValue({ok:true});});
const post=()=>new Request("http://localhost/api/v2/quick-records",{method:"POST",body:"{}"});
describe("quick-record HTTP boundary",()=>{
 it("requires auth for reading and writing",async()=>{
  mocks.session.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/api/v2/quick-records"))).status).toBe(401);
  expect((await POST(post())).status).toBe(401);expect(mocks.save).not.toHaveBeenCalled();
 });
 it("rejects cross tenant and cross origin",async()=>{
  expect((await GET(new Request("http://localhost/api/v2/quick-records?tenantId=b"))).status).toBe(403);
  mocks.origin.mockImplementationOnce(()=>{throw Error("ORIGIN_DENIED");});
  expect((await POST(post())).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();
 });
 it.each([["FORBIDDEN",403],["REVISION_CONFLICT",409],["INTERVAL_OVERLAP",409],["SHIFT_NOT_FOUND",404],["OUTSIDE_SHIFT",422],["DEPTH_BOUNDS_REQUIRED",422]])("maps %s without false success",async(code,status)=>{
  mocks.save.mockRejectedValue(Error(code));
  expect((await POST(post())).status).toBe(status);
 });
 it("caps request size and hides unexpected internals",async()=>{
  expect((await POST(new Request("http://localhost/api/v2/quick-records",{method:"POST",body:"x".repeat(10001)}))).status).toBe(413);
  mocks.save.mockRejectedValue(Error("private host"));
  const response=await POST(post());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private host");
 });
});
