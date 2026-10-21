import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import type {PrivateSession} from "./private-auth";
const mocks=vi.hoisted(()=>({query:vi.fn(),operation:vi.fn(),catalog:vi.fn(),build:vi.fn()}));
vi.mock("./operational-db",()=>({operationalPool:()=>({query:mocks.query})}));
vi.mock("./operational-store",()=>({readOperation:mocks.operation}));
vi.mock("./operational-catalog",()=>({readCatalog:mocks.catalog}));
vi.mock("@/packages/domain/review-scenario",()=>({buildReviewScenario:mocks.build}));
import {readReviewScenario} from "./review-scenario";
const reviewer:PrivateSession={tenantId:"synthetic-a",userId:"actor-a",email:"test@example.invalid",name:"Synthetic",role:"operational_reviewer",plan:"Premium"};
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("DRILLOPS_ENV","staging");
 mocks.query.mockResolvedValue({rows:[{id:"REVISION_RAUL_2026_10_V1"}]});
 mocks.operation.mockResolvedValue({shifts:[],reports:[],crowns:[],decisions:[{private:true}],quickRecords:[{private:true}]});
 mocks.catalog.mockResolvedValue({rigs:[],holes:[],crowns:[]});
 mocks.build.mockReturnValue({id:"REVISION_RAUL_2026_10_V1",manifest:[]});
});
afterEach(()=>vi.unstubAllEnvs());
describe("review scenario tenant opt-in and permissions",()=>{
 it("is unavailable outside staging and for public demo without DB access",async()=>{
  vi.stubEnv("DRILLOPS_ENV","production");expect(await readReviewScenario(reviewer)).toBeNull();
  vi.stubEnv("DRILLOPS_ENV","staging");expect(await readReviewScenario({...reviewer,demo:true})).toBeNull();expect(mocks.query).not.toHaveBeenCalled();
 });
 it("does not expand a role without operation access",async()=>{expect(await readReviewScenario({...reviewer,role:"control"})).toBeNull();expect(mocks.query).not.toHaveBeenCalled();});
 it("requires exact active-tenant opt-in and never falls back",async()=>{
  mocks.query.mockResolvedValue({rows:[{id:"OTHER_SCENARIO"}]});expect(await readReviewScenario(reviewer)).toBeNull();expect(mocks.operation).not.toHaveBeenCalled();expect(mocks.build).not.toHaveBeenCalled();
 });
 it("reads only session tenant, original May period, and redacted catalog",async()=>{
  const result=await readReviewScenario(reviewer);
  expect(mocks.query.mock.calls[0][1]).toEqual(["synthetic-a"]);expect(mocks.query.mock.calls[0][0]).toContain("active=true");
  expect(mocks.operation).toHaveBeenCalledWith("synthetic-a",{from:"2026-05-01",to:"2026-05-31"});expect(mocks.catalog).toHaveBeenCalledWith(reviewer);
  expect(mocks.build.mock.calls[0][0].decisions).toEqual([]);expect(mocks.build.mock.calls[0][0].quickRecords).toEqual([]);
  expect(result?.sourceVersion).toMatch(/^[a-f0-9]{64}$/);
 });
 it("does not expand ordinary clients or drillers to a review membership",async()=>{
  mocks.operation.mockResolvedValue({shifts:[{crowns:[{serial:"secret"}]}],reports:[{survey:[{private:true}],consumptions:[{private:true}],materials:[{private:true}]}],crowns:[{serial:"secret"}],decisions:[],quickRecords:[]});
  expect(await readReviewScenario({...reviewer,role:"driller",plan:"Básico"})).toBeNull();
  expect(await readReviewScenario({...reviewer,role:"client"})).toBeNull();
  expect(mocks.query).not.toHaveBeenCalled();expect(mocks.build).not.toHaveBeenCalled();
 });
 it("DB and original-data errors propagate, never generating synthetic fallback",async()=>{
  mocks.query.mockRejectedValueOnce(Error("DB down"));await expect(readReviewScenario(reviewer)).rejects.toThrow("DB down");expect(mocks.build).not.toHaveBeenCalled();
  mocks.operation.mockRejectedValueOnce(Error("Read failed"));await expect(readReviewScenario(reviewer)).rejects.toThrow("Read failed");expect(mocks.build).not.toHaveBeenCalled();
 });
});
