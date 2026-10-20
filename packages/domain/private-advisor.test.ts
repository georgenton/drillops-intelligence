import { describe, expect, it } from "vitest";
import { missingAdvisorCriteria, privateAdvisorRanking, ORIGINAL_ADVISOR_WEIGHTS, type PrivateAdvisorProduct } from "./private-advisor";
import { recommendCrowns } from "./advisor";
import type { AdvisorInput, Crown } from "./types";
const input:AdvisorInput={tenantId:"synthetic",diameter:"HQ",hardness:4,fracturing:"high",abrasivity:"low",waterReturn:"complete",priority:"balanced"};
const crown:Crown={id:"synthetic-a",tenantId:"synthetic",manufacturer:"Synthetic",product:"A",matrix:"A",diameter:"HQ",price:100,stock:3,reserved:1,reorder:2,historicalRop:2,historicalCost:4,historicalLife:25,observations:12,hardnessFit:[4],fracturingFit:["high"]};
describe("private original advisor contract",()=>{
 it("uses exact original ranking when every criterion is supplied",()=>expect(privateAdvisorRanking([crown],input,true).results).toEqual(recommendCrowns([crown],input)));
 it("keeps all weights, never renormalizes missing life",()=>{const product:PrivateAdvisorProduct={...crown,historicalLife:null};expect(missingAdvisorCriteria(product)).toContain("vida histórica de corridas terminadas");expect(privateAdvisorRanking([product],input,true).results).toEqual([]);expect(ORIGINAL_ADVISOR_WEIGHTS.balanced).toEqual([.35,.25,.2,.1,.1]);});
 it("does not encode restricted cost in scores",()=>expect(privateAdvisorRanking([crown],input,false).results).toEqual([]));
 it("does not filter out incomplete candidates to change normalization",()=>expect(privateAdvisorRanking([crown,{...crown,id:"b",stock:null}],input,true).results).toEqual([]));
 it("zero observed stock is known but unavailable, not missing",()=>{expect(missingAdvisorCriteria({...crown,stock:0,reserved:0})).toEqual([]);expect(privateAdvisorRanking([{...crown,stock:0,reserved:0}],input,true).results).toEqual([]);});
 it("a registered gross balance does not imply zero reservations or rankable net stock",()=>{const product={...crown,stock:5,reserved:null};expect(missingAdvisorCriteria(product).length).toBeGreaterThan(0);expect(privateAdvisorRanking([product],input,true).results).toEqual([]);});
});
