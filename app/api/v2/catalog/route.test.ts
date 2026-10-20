import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),origin:vi.fn(),read:vi.fn(),save:vi.fn()}));
vi.mock("@/lib/private-auth",()=>({privateSession:mocks.session,assertSameOrigin:mocks.origin}));
vi.mock("@/lib/operational-catalog",()=>({readCatalog:mocks.read,saveCatalog:mocks.save}));
import {GET,POST,PATCH} from "./route";
const session={tenantId:"tenant-a",userId:"user-a",role:"general_manager",plan:"Premium"};
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue(session);mocks.read.mockResolvedValue({rigs:[],holes:[],crowns:[]});mocks.save.mockResolvedValue({ok:true,revision:1});});
describe("catalog HTTP boundary",()=>{
 it("anonymous read and write denied",async()=>{
  mocks.session.mockResolvedValue(null);
  expect((await GET(new Request("http://localhost/api/v2/catalog"))).status).toBe(401);
  expect((await POST(new Request("http://localhost/api/v2/catalog",{method:"POST",body:"{}"}))).status).toBe(401);
  expect(mocks.save).not.toHaveBeenCalled();
 });
 it("cross-company query denied before reading",async()=>{
  expect((await GET(new Request("http://localhost/api/v2/catalog?tenantId=other"))).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
 });
 it("returns only redacted service response with no-store",async()=>{
  const response=await GET(new Request("http://localhost/api/v2/catalog"));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.read).toHaveBeenCalledWith(session);
 });
 it("denies cross-origin mutation",async()=>{
  mocks.origin.mockImplementationOnce(()=>{throw new Error("ORIGIN_DENIED");});
  expect((await POST(new Request("http://localhost/api/v2/catalog",{method:"POST",body:"{}"}))).status).toBe(403);
  expect(mocks.save).not.toHaveBeenCalled();
 });
 it.each([["FORBIDDEN",403],["COST_FORBIDDEN",403],["REVISION_CONFLICT",409],["MACHINE_LIMIT",409],["RIG_NOT_FOUND",404]] as const)("maps %s safely",async(code,status)=>{
  mocks.save.mockRejectedValue(new Error(code));
  expect((await PATCH(new Request("http://localhost/api/v2/catalog",{method:"PATCH",body:"{}"}))).status).toBe(status);
 });
 it("does not leak internal database errors",async()=>{
  mocks.save.mockRejectedValue(new Error("private database detail"));
  const response=await POST(new Request("http://localhost/api/v2/catalog",{method:"POST",body:"{}"}));
  expect(response.status).toBe(503);expect(await response.text()).not.toContain("private database detail");
 });
});
