/** Private artifact generation from the downloaded deployment manifest and HTML. */
import fs from "node:fs";
import path from "node:path";
import {chromium} from "@playwright/test";
const root=process.env.REVIEW_EVIDENCE_DIR;
if(!root||!path.isAbsolute(root))throw Error("Absolute private evidence directory required");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"datos-y-supuestos.json"),"utf8"));
const verification=JSON.parse(fs.readFileSync(path.join(root,"verificacion.json"),"utf8"));
if(manifest.sourceVersion!==verification.sourceVersion)throw Error("Evidence source differs from the report");
let html=fs.readFileSync(path.join(root,"informe-datos-y-supuestos.html"),"utf8");
const images=["dashboard","survey","bit-advisor","depth-intelligence",...(fs.existsSync(path.join(root,"depth-mse-1440.png"))?["depth-mse"]:[])];
const appendix=`<section style="break-before:page"><h2>Pantallas del despliegue comprobado</h2><p>${verification.base}. Escenario ${manifest.id}. Capturas tomadas con la cuenta individual de revisión, sin modificar los reportes. La aceptación de Raúl sigue pendiente.</p>${images.map((name,i)=>`<figure style="break-inside:avoid;margin:20px 0"><figcaption>Figura ${i+1}. ${name} · contexto predeterminado del escenario</figcaption><img alt="${name}" style="width:100%;max-height:180mm;object-fit:contain" src="data:image/png;base64,${fs.readFileSync(path.join(root,name==="depth-mse"?"depth-mse-1440.png":`detalle-${name}.png`)).toString("base64")}"></figure>`).join("")}</section>`;
html=html.replace("</main>",`${appendix}</main>`);
// Portable offline HTML: links to live/private downloads remain explicitly authenticated.
html=html.replaceAll('href="?format=',`href="${verification.base}/api/v2/review-scenario/report?format=`).replace('href="/dashboard"',`href="${verification.base}/dashboard"`);
fs.writeFileSync(path.join(root,"DrillOps-datos-reportes-y-supuestos.html"),html,{mode:0o600});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.setContent(html,{waitUntil:"load"});
 await page.pdf({path:path.join(root,"DrillOps-datos-reportes-y-supuestos.pdf"),format:"A4",printBackground:true,margin:{top:"14mm",right:"12mm",bottom:"18mm",left:"12mm"},displayHeaderFooter:true,headerTemplate:"<span></span>",footerTemplate:'<div style="font-size:9px;width:100%;text-align:center;color:#53666d">DrillOps · Datos y supuestos para revisar · <span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
 console.log(JSON.stringify({report:path.join(root,"DrillOps-datos-reportes-y-supuestos.pdf"),manifestEntries:manifest.manifest.length,sourceVerified:true}));
}finally{await browser.close();}
