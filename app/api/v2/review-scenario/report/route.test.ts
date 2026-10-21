import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),read:vi.fn(),csv:vi.fn(),html:vi.fn()}));
vi.mock("@/lib/private-auth",()=>({privateSession:mocks.session}));
vi.mock("@/lib/review-scenario",()=>({readReviewScenario:mocks.read}));
vi.mock("@/lib/review-report",()=>({reviewCsv:mocks.csv,reviewHtml:mocks.html}));
import {GET} from "./route";
const session={tenantId:"synthetic-a",userId:"actor-a",role:"operational_reviewer",plan:"Premium"};
const scenario={id:"REVISION_RAUL_2026_10_V1",sourceVersion:"synthetic-source",manifest:[{field:"stock",value:5,kind:"SINTETICO"}]};
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue(session);mocks.read.mockResolvedValue(scenario);mocks.csv.mockReturnValue("field,value\nstock,5");mocks.html.mockReturnValue("<html><body>Synthetic report</body></html>");});
describe("private review report downloads",()=>{
 it("requires authentication and rejects cross-tenant query before reading",async()=>{
  mocks.session.mockResolvedValueOnce(null);expect((await GET(new Request("http://localhost/api/v2/review-scenario/report"))).status).toBe(401);
  expect((await GET(new Request("http://localhost/api/v2/review-scenario/report?tenantId=other"))).status).toBe(403);expect(mocks.read).not.toHaveBeenCalled();
 });
 it("disabled scenario is 404, never a substitute report",async()=>{mocks.read.mockResolvedValue(null);expect((await GET(new Request("http://localhost/api/v2/review-scenario/report"))).status).toBe(404);expect(mocks.html).not.toHaveBeenCalled();});
 it("JSON exports the exact resolved scenario",async()=>{const response=await GET(new Request("http://localhost/api/v2/review-scenario/report?format=json"));expect(await response.json()).toEqual(scenario);expect(response.headers.get("content-disposition")).toContain(".json");expect(mocks.read).toHaveBeenCalledWith(session);});
 it("CSV uses the same manifest and remains a private download",async()=>{const response=await GET(new Request("http://localhost/api/v2/review-scenario/report?format=csv"));expect(await response.text()).toContain("stock,5");expect(mocks.csv).toHaveBeenCalledWith(scenario);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("content-disposition")).toContain("attachment;");});
 it("HTML rendering uses exact scenario with restrictive CSP",async()=>{const response=await GET(new Request("http://localhost/api/v2/review-scenario/report"));expect(mocks.html).toHaveBeenCalledWith(scenario);expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");expect(response.headers.get("x-content-type-options")).toBe("nosniff");});
 it("read and rendering errors return 503 without sensitive detail or fallback",async()=>{
  mocks.read.mockRejectedValueOnce(Error("sensitive database detail"));let response=await GET(new Request("http://localhost/api/v2/review-scenario/report"));expect(response.status).toBe(503);expect(await response.text()).not.toContain("sensitive");
  mocks.html.mockImplementationOnce(()=>{throw Error("private template detail");});response=await GET(new Request("http://localhost/api/v2/review-scenario/report"));expect(response.status).toBe(503);expect(await response.text()).not.toContain("private template");
 });
});
