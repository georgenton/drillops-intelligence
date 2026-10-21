import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {parseOperationalArchive} from "../packages/import/may-2026";
// Read-only source audit. Outputs exclude personnel, signatures and raw narrative.
async function main(){
 const input=process.argv[2],output=process.argv[3];
 if(!input||!output)throw new Error("USAGE: audit-expanded-import.ts source.zip private-output.json");
 const parsed=parseOperationalArchive(await readFile(input));
 const reports=parsed.operationalReports??[];
 const coverage=reports.map(r=>({file:r.source.file,sheet:r.source.sheet,date:r.date,sourceHash:r.source.fileSha256,
   survey:r.survey.map(x=>({cells:Object.values(x.cells).map(c=>c.cell),valid:x.valid})),
   groups:Object.fromEntries((["consumptions","materials","equipmentHours","fluidParameters"] as const).map(k=>[k,r[k].map(x=>({label:x.label,shiftType:x.shiftType,unit:x.unit,validity:x.validity,cells:Object.values(x.cells).map(c=>c.cell),warnings:x.warnings}))]))}));
 const totals={reports:reports.length,survey:reports.flatMap(r=>r.survey).length,validSurvey:reports.flatMap(r=>r.survey).filter(x=>x.valid).length,
  measurements:Object.fromEntries((["consumptions","materials","equipmentHours","fluidParameters"] as const).map(k=>[k,{total:reports.flatMap(r=>r[k]).length,observed:reports.flatMap(r=>r[k]).filter(x=>x.validity==="observed").length}]))};
 await writeFile(resolve(output),JSON.stringify({adapterVersion:parsed.adapterVersion,archiveSha256:parsed.archiveSha256,controls:parsed.summary,totals,coverage,issues:parsed.issues},null,2),{mode:0o600,flag:"wx"});
 console.log(JSON.stringify({adapterVersion:parsed.adapterVersion,controls:parsed.summary,totals}));
}
main().catch(()=>{console.error("Expanded import audit failed; no source changes made");process.exitCode=1;});
