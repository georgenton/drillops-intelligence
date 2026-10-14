/** Legacy demo endpoints retired: private records use the authenticated v2 source. */
function retired(){return Response.json({error:"Endpoint legado retirado. Usa el flujo operacional autenticado."},{status:410});}
export const GET=retired;
export const POST=retired;
