import { SaxesParser } from "saxes";
import { readZip, type ZipExpansionBudget } from "./zip";
export interface Cell { value: string | number | null; formula: string | null }
export interface Sheet { name: string; cells: Map<string, Cell>; merges?: string[] }
type Node = { name: string; attrs: Record<string, string>; text: string; children: Node[] };
function xml(data: Buffer | undefined): Node {
  if (!data || data.length > 16 * 1024 * 1024) throw new Error("XML_MISSING_OR_TOO_LARGE");
  const root: Node = { name: "root", attrs: {}, text: "", children: [] }, stack = [root];
  const parser = new SaxesParser({ xmlns: false }); let nodes = 0;
  parser.on("doctype", () => { throw new Error("XML_DTD_FORBIDDEN"); });
  parser.on("opentag", tag => {
    if (++nodes > 200000 || stack.length > 40) throw new Error("XML_LIMIT");
    const node: Node = { name: tag.name.split(":").pop()!, attrs: tag.attributes as Record<string, string>, text: "", children: [] };
    stack.at(-1)!.children.push(node); stack.push(node);
  });
  parser.on("text", value => { stack.at(-1)!.text += value; });
  parser.on("cdata", value => { stack.at(-1)!.text += value; });
  parser.on("closetag", () => { stack.pop(); });
  parser.write(data.toString("utf8")).close(); return root;
}
function descendants(node: Node, name: string): Node[] { return node.children.flatMap(child => [...(child.name === name ? [child] : []), ...descendants(child, name)]); }
function textContent(node: Node): string { return node.text + node.children.map(textContent).join(""); }
/** Reads cached values only. External relationships/formulas are never resolved. */
export function operationalSheets(input: Buffer, budget?: ZipExpansionBudget, alreadyRead?: Map<string, Buffer>): { sheets: Sheet[]; externalLinks: boolean } {
  const files = alreadyRead ?? readZip(input, budget);
  if ([...files.keys()].some(name => /vbaProject|macrosheet|activeX|embeddings\//i.test(name))) throw new Error("MACROS_FORBIDDEN");
  const workbook = xml(files.get("xl/workbook.xml"));
  if (descendants(workbook, "workbookPr").some(node => ["1", "true"].includes(node.attrs.date1904))) throw new Error("DATE_1904_UNSUPPORTED");
  const relations = descendants(xml(files.get("xl/_rels/workbook.xml.rels")), "Relationship");
  const strings = files.has("xl/sharedStrings.xml") ? descendants(xml(files.get("xl/sharedStrings.xml")), "si").map(textContent) : [];
  const sheets: Sheet[] = [];
  const selected = descendants(workbook, "sheet").filter(sheet => /^RIG-[A-Z0-9-]+$/i.test(sheet.attrs.name) && (!sheet.attrs.state || sheet.attrs.state === "visible"));
  if (selected.length > 8) throw new Error("OPERATIONAL_SHEET_LIMIT");
  for (const sheet of selected) {
    const rel = relations.find(node => node.attrs.Id === sheet.attrs["r:id"]);
    if (!rel || rel.attrs.TargetMode === "External" || !/^worksheets\/sheet\d+\.xml$/.test(rel.attrs.Target)) throw new Error("SHEET_RELATION_INVALID");
    const cells = new Map<string, Cell>();
    const document = xml(files.get(`xl/${rel.attrs.Target}`));
    for (const node of descendants(document, "c")) {
      const ref = node.attrs.r;
      // No footer, signatures, personnel tables or arbitrary workbook text leaves this layer.
      if (!/^[A-Z]{1,2}\d{1,3}$/.test(ref) || Number(ref.replace(/\D/g, "")) > 74) continue;
      const raw = node.children.find(n => n.name === "v")?.text ?? "";
      const formula = node.children.find(n => n.name === "f")?.text ?? null;
      let value: Cell["value"] = null;
      if (node.attrs.t === "s") value = strings[Number(raw)] ?? null;
      else if (node.attrs.t === "inlineStr") value = node.children.filter(n => n.name === "is").map(textContent).join("");
      else if (node.attrs.t === "str") value = raw;
      else if (!node.attrs.t || node.attrs.t === "n") value = raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) : null;
      cells.set(ref, { value, formula });
    }
    // Operational blocks end before observations/personnel; do not export narrative.
    const boundary = [...cells].filter(([, c]) => typeof c.value === "string" && /^(OBSERVACIONES|PERSONAL|FIRMAS)/i.test(c.value.trim())).map(([r]) => Number(r.replace(/\D/g, ""))).filter(r => r > 48);
    const end = Math.min(75, ...boundary);
    for (const ref of cells.keys()) if (Number(ref.replace(/\D/g, "")) >= end) cells.delete(ref);
    sheets.push({ name: sheet.attrs.name, cells, merges: descendants(document, "mergeCell").map(n => n.attrs.ref) });
  }
  return { sheets, externalLinks: [...files.keys()].some(name => name.startsWith("xl/externalLinks/")) };
}
