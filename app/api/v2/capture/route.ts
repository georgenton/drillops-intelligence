import { z } from "zod";
import { privateSession, assertSameOrigin } from "@/lib/private-auth";
import { canCapture, captureShift } from "@/lib/capture-service";
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const session=await privateSession();
    if(!session)return Response.json({error:"No autorizado"},{status:401});
    if(!canCapture(session))return Response.json({error:"Captura denegada"},{status:403});
    const text=await request.text();
    if(text.length>100_000)return Response.json({error:"Formulario demasiado grande"},{status:413});
    return Response.json(await captureShift(session,JSON.parse(text)),{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return Response.json({error:error.issues.map(i=>i.message).join("; ")},{status:400});
    if(error instanceof SyntaxError)return Response.json({error:"Formulario inválido"},{status:400});
    const code=error instanceof Error?error.message:"";
    if(code==="CAPTURE_DENIED"||code==="ORIGIN_DENIED")return Response.json({error:"Captura denegada"},{status:403});
    if(code==="SHIFT_EXISTS")return Response.json({error:"Ese turno ya existe. No se sobrescribió; revisa el registro original."},{status:409});
    return Response.json({error:"No se guardó el turno. Intenta nuevamente."},{status:503});
  }
}
