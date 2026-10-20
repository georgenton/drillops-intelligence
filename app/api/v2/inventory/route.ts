import { privateSession, assertSameOrigin } from "@/lib/private-auth";
import { readInventory, saveInventoryMovement } from "@/lib/operational-inventory";
import { boundedBody, privateResourceHeaders, resourceError } from "@/lib/operational-resource-http";
export async function GET(request:Request){
  try{const session=await privateSession();if(!session)throw Error("UNAUTHORIZED");
    const tenant=new URL(request.url).searchParams.get("tenantId");if(tenant&&tenant!==session.tenantId)throw Error("FORBIDDEN");
    return Response.json(await readInventory(session),{headers:privateResourceHeaders});
  }catch(error){return resourceError(error);}
}
export async function POST(request:Request){
  try{assertSameOrigin(request);const session=await privateSession();if(!session)throw Error("UNAUTHORIZED");
    return Response.json(await saveInventoryMovement(session,JSON.parse((await boundedBody(request,8192)).toString("utf8"))),{status:201,headers:privateResourceHeaders});
  }catch(error){return resourceError(error);}
}
