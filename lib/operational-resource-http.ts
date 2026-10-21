import { ZodError } from "zod";
export const privateResourceHeaders={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export function resourceError(error:unknown){
  const code=error instanceof Error?error.message:"UNAVAILABLE";
  const status=error instanceof ZodError||error instanceof SyntaxError?400:
    ["FORBIDDEN","ORIGIN_DENIED"].includes(code)?403:code==="UNAUTHORIZED"?401:code==="NOT_FOUND"?404:
    ["FILE_SIZE","ATTACHMENT_QUOTA"].includes(code)?413:code==="FILE_TYPE"?415:
    ["OPENING_REQUIRED","ALREADY_OPENED","UNIT_MISMATCH","INSUFFICIENT_STOCK","REQUEST_CONFLICT"].includes(code)?409:503;
  const messages:Record<string,string>={OPENING_REQUIRED:"Registra primero un saldo inicial explícito.",ALREADY_OPENED:"Ya existe saldo inicial; usa un ajuste con motivo.",UNIT_MISMATCH:"Conserva la unidad registrada del artículo.",INSUFFICIENT_STOCK:"La salida dejaría saldo negativo.",REQUEST_CONFLICT:"La solicitud ya existe con otros valores.",FILE_SIZE:"Archivo vacío o mayor de 3 MiB.",FILE_TYPE:"Sólo PNG, JPEG y PDF con firma y tipo coherentes.",ATTACHMENT_QUOTA:"Se alcanzó el límite privado de adjuntos de esta empresa."};
  return Response.json({error:messages[code]??(status===400?"Entrada inválida":status===403?"Acceso denegado":status===401?"No autorizado":status===404?"Registro no encontrado":"Servicio no disponible")},{status,headers:privateResourceHeaders});
}
/** Bound actual stream bytes, including requests without Content-Length. */
export async function boundedBody(request:Request,max:number){
  const reader=request.body?.getReader();if(!reader)throw Error("FILE_SIZE");
  const chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error("FILE_SIZE");}chunks.push(value);}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks,size);
}
