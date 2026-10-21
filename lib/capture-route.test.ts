import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),origin:vi.fn(),transaction:vi.fn(),read:vi.fn(),export:vi.fn()}));
vi.mock("./private-auth",()=>({privateSession:mocks.session,assertSameOrigin:mocks.origin}));
vi.mock("./operational-db",()=>({tenantTransaction:mocks.transaction}));
vi.mock("./operational-store",()=>({readOperation:mocks.read}));
vi.mock("./export-service",()=>({exportOperationalXlsx:mocks.export}));
import { POST } from "@/app/api/v2/capture/route";
import { GET } from "@/app/api/v2/export/route";
const reviewer={userId:"reviewer",tenantId:"tenant-A",role:"operational_reviewer",plan:"Premium"};
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue(reviewer);mocks.read.mockResolvedValue({shifts:[],crowns:[],reports:[]});mocks.export.mockResolvedValue(Buffer.from("PK"));});
describe("capture/export server boundary",()=>{
 it("denies direct reviewer mutation even before invalid payload parsing",async()=>{
   const res=await POST(new Request("https://example.invalid/api/v2/capture",{method:"POST",body:"invalid"}));expect(res.status).toBe(403);expect(mocks.transaction).not.toHaveBeenCalled();
 });
 it("denies missing login and bad origin",async()=>{
   mocks.session.mockResolvedValue(null);expect((await POST(new Request("https://example.invalid",{method:"POST"}))).status).toBe(401);
   mocks.origin.mockImplementationOnce(()=>{throw new Error("ORIGIN_DENIED");});expect((await POST(new Request("https://example.invalid",{method:"POST"}))).status).toBe(403);
 });
 it("cannot export a different tenant even with reader permission",async()=>{
   expect((await GET(new Request("https://example.invalid/api/v2/export?tenantId=tenant-B"))).status).toBe(403);expect(mocks.read).not.toHaveBeenCalled();
 });
 it("passes only session tenant and actual filters to exporter",async()=>{
   const res=await GET(new Request("https://example.invalid/api/v2/export?rig=RIG-X&from=2026-05-01"));expect(res.status).toBe(200);expect(res.headers.get("content-type")).toContain("spreadsheetml");
   expect(mocks.read).toHaveBeenCalledWith("tenant-A",{rig:"RIG-X",from:"2026-05-01",to:undefined,hole:undefined});
 });
 it("denies export when role cannot access reports",async()=>{
   mocks.session.mockResolvedValue({...reviewer,role:"control"});expect((await GET(new Request("https://example.invalid/api/v2/export"))).status).toBe(403);expect(mocks.read).not.toHaveBeenCalled();
 });
});
