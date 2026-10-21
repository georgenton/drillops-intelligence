import { privateSession } from "@/lib/private-auth";
import { readAttachmentBytes } from "@/lib/operational-attachments";
import { privateResourceHeaders,resourceError } from "@/lib/operational-resource-http";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{const session=await privateSession();if(!session)throw Error("UNAUTHORIZED");
    const file=await readAttachmentBytes(session,(await params).id);
    return new Response(new Uint8Array(file.content),{headers:{...privateResourceHeaders,"Content-Type":file.mime,"Content-Length":String(file.size),"Content-Security-Policy":"sandbox; default-src 'none'","Content-Disposition":`${file.mime==="application/pdf"?"attachment":"inline"}; filename="${file.name}"`,"Cross-Origin-Resource-Policy":"same-origin"}});
  }catch(error){return resourceError(error);}
}
