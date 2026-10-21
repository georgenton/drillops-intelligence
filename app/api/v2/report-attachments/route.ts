import { privateSession, assertSameOrigin } from "@/lib/private-auth";
import { canWriteAttachment,readAttachments,saveAttachment } from "@/lib/operational-attachments";
import { MAX_ATTACHMENT_BYTES } from "@/packages/domain/private-attachment";
import { boundedBody,privateResourceHeaders,resourceError } from "@/lib/operational-resource-http";
export async function GET(request:Request){
  try{const session=await privateSession();if(!session)throw Error("UNAUTHORIZED");
    const params=new URL(request.url).searchParams;if(params.has("tenantId")&&params.get("tenantId")!==session.tenantId)throw Error("FORBIDDEN");
    return Response.json(await readAttachments(session,params.get("reportKey")??""),{headers:privateResourceHeaders});
  }catch(error){return resourceError(error);}
}
export async function POST(request:Request){
  try{assertSameOrigin(request);const session=await privateSession();if(!session)throw Error("UNAUTHORIZED");if(!canWriteAttachment(session))throw Error("FORBIDDEN");
    const bytes=await boundedBody(request,MAX_ATTACHMENT_BYTES+16*1024);
    const form=await new Response(new Uint8Array(bytes),{headers:{"Content-Type":request.headers.get("content-type")??""}}).formData();
    const file=form.get("file");if(!(file instanceof File))throw Error("FILE_TYPE");
    const result=await saveAttachment(session,{reportKey:String(form.get("reportKey")??""),reason:String(form.get("reason")??""),name:file.name,mime:file.type,bytes:new Uint8Array(await file.arrayBuffer())});
    return Response.json(result,{status:201,headers:privateResourceHeaders});
  }catch(error){return resourceError(error);}
}
