import {describe,it,expect} from "vitest";
import type {ReviewScenario} from "@/packages/domain/review-scenario";
import {reviewCsv,reviewHtml} from "./review-report";
const scenario=(manifest:Record<string,unknown>[])=>({id:"REVISION_RAUL_2026_10_V1",manifest,consumptionEntries:[],surveys:[]} as unknown as ReviewScenario);
describe("review report escaping and exact manifest export",()=>{
 it("escapes source HTML, attributes and nested evidence",()=>{
  const html=reviewHtml(scenario([{screen:"Survey",field:'<script>alert("x")</script>',kind:"SUPUESTO",value:'<img src=x onerror="alert(1)">',source:{file:"<iframe src=evil>"} }]));
  expect(html).not.toContain("<script>");expect(html).not.toContain("<img src=x");expect(html).not.toContain("<iframe src=evil>");
  expect(html).toContain("&lt;script&gt;");expect(html).toContain("&lt;img");expect(html).toContain("&lt;iframe");
 });
 it("does not pre-accept review or omit scenario identity",()=>{
  const html=reviewHtml(scenario([{screen:"Inventario",field:"stock",kind:"SINTETICO",value:5}]));
  expect(html).toContain("REVISION_RAUL_2026_10_V1");expect(html).toContain("pendiente");expect(html).not.toContain('checked="');
 });
 it("neutralizes spreadsheet formulas including whitespace prefixes",()=>{
  const csv=reviewCsv(scenario([{field:"=HYPERLINK(\"evil\")",value:"+1+2",source:" @SUM(1)",reason:"-2+3"}]));
  expect(csv).toContain(`"'=HYPERLINK(""evil"")"`);expect(csv).toContain(`"'+1+2"`);expect(csv).toContain(`"' @SUM(1)"`);expect(csv).toContain(`"'-2+3"`);
 });
 it("quotes commas, newlines and exact nested support without mutating inputs",()=>{
  const data=scenario([{field:"Agua, diesel",value:15,source:{file:'source "A".xlsx',cells:["A1","B1"]},reason:"line1\nline2"}]),before=JSON.stringify(data);
  const csv=reviewCsv(data);expect(csv.startsWith("\uFEFF")).toBe(true);expect(csv).toContain('"Agua, diesel"');expect(csv).toContain('"line1\nline2"');expect(csv).toContain('""cells"":[""A1"",""B1""]');expect(JSON.stringify(data)).toBe(before);
 });
});
