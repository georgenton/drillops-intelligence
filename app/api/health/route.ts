export function GET() { return Response.json({status:"alive",revision:process.env.APP_REVISION??"local"}); }
