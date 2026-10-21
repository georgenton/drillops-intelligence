import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),read:vi.fn()}));
vi.mock("@/lib/private-auth",()=>({privateSession:mocks.session}));
vi.mock("@/lib/review-scenario",()=>({readReviewScenario:mocks.read}));
import {GET} from "./route";
const session={tenantId:"synthetic-a",userId:"actor-a",role:"operational_reviewer",plan:"Premium"};
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue(session);mocks.read.mockResolvedValue({id:"REVISION_RAUL_2026_10_V1",sourceVersion:"synthetic-source",manifest:[]});});
describe("review scenario HTTP read boundary",()=>{
 it("denies anonymous requests before resolving scenario",async()=>{mocks.session.mockResolvedValue(null);expect((await GET(new Request("http://localhost/api/v2/review-scenario"))).status).toBe(401);expect(mocks.read).not.toHaveBeenCalled();});
 it("rejects other-tenant override and scopes lookup to authenticated membership",async()=>{
  expect((await GET(new Request("http://localhost/api/v2/review-scenario?tenantId=synthetic-b"))).status).toBe(403);expect(mocks.read).not.toHaveBeenCalled();
  const response=await GET(new Request("http://localhost/api/v2/review-scenario?tenantId=synthetic-a"));expect(response.status).toBe(200);expect(mocks.read).toHaveBeenCalledWith(session);
 });
 it("allows read-only review without granting writes and disables caching",async()=>{const response=await GET(new Request("http://localhost/api/v2/review-scenario"));expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("x-content-type-options")).toBe("nosniff");expect((await response.json()).scenario.id).toBe("REVISION_RAUL_2026_10_V1");});
 it("keeps explicitly disabled scenario null, not synthetic fallback",async()=>{mocks.read.mockResolvedValue(null);const response=await GET(new Request("http://localhost/api/v2/review-scenario"));expect(response.status).toBe(200);expect(await response.json()).toEqual({scenario:null});});
 it("database failure is 503 without source detail or fallback",async()=>{mocks.read.mockRejectedValue(Error("private database credentials"));const response=await GET(new Request("http://localhost/api/v2/review-scenario"));expect(response.status).toBe(503);const body=await response.json();expect(body).not.toHaveProperty("scenario");expect(JSON.stringify(body)).not.toContain("credentials");});
});
