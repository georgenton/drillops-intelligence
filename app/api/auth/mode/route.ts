import { isDemoMode, isCommerciallyClosed } from "@/lib/runtime-mode";
export function GET(){return Response.json({demo:isDemoMode(),closed:isCommerciallyClosed()});}
