import { describe,it,expect } from "vitest";
import { MAX_ATTACHMENT_BYTES,validateAttachment } from "./private-attachment";
describe("private attachment validation",()=>{
  it("accepts matching allowed magic bytes",()=>{expect(validateAttachment(new Uint8Array([137,80,78,71,13,10,26,10]),"image/png","a.png").mime).toBe("image/png");expect(validateAttachment(new Uint8Array([255,216,255,0]),"image/jpeg","a.jpg").mime).toBe("image/jpeg");expect(validateAttachment(new TextEncoder().encode("%PDF-1.7"),"application/pdf","a.pdf").mime).toBe("application/pdf");});
  it("rejects SVG, HTML and MIME disguise",()=>{expect(()=>validateAttachment(new TextEncoder().encode("<svg/>"),"image/png","a.png")).toThrow("FILE_TYPE");expect(()=>validateAttachment(new TextEncoder().encode("%PDF-1.7"),"image/jpeg","a.jpg")).toThrow("FILE_TYPE");});
  it("bounds actual bytes and removes unsafe filename characters",()=>{expect(()=>validateAttachment(new Uint8Array(MAX_ATTACHMENT_BYTES+1),"image/png","a.png")).toThrow("FILE_SIZE");expect(()=>validateAttachment(new Uint8Array(),"image/png","a.png")).toThrow("FILE_SIZE");expect(validateAttachment(new Uint8Array([255,216,255]),"image/jpeg",'../"\r\n.jpg').name).not.toMatch(/[/\r\n"]/);});
});
