export const MAX_ATTACHMENT_BYTES=3*1024*1024;
export function validateAttachment(bytes:Uint8Array,mime:string,name:string) {
  if(!bytes.length||bytes.length>MAX_ATTACHMENT_BYTES)throw Error("FILE_SIZE");
  const starts=(signature:number[])=>signature.every((n,i)=>bytes[i]===n);
  const actual=starts([137,80,78,71,13,10,26,10])?"image/png":starts([255,216,255])?"image/jpeg":starts([37,80,68,70,45])?"application/pdf":null;
  if(!actual||actual!==mime)throw Error("FILE_TYPE");
  const safeName=name.replace(/[^a-zA-Z0-9._ -]/g,"_").slice(0,120).replace(/^\.+/,"")||"adjunto";
  return {mime:actual,name:safeName,size:bytes.length};
}
export type ReportAttachment={id:string;reportKey:string;name:string;mime:string;size:number;reason:string;createdAt:string};
