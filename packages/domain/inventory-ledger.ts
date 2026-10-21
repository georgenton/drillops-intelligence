import { z } from "zod";
export const inventoryMovementSchema = z.object({
  requestId:z.string().uuid(),
  code:z.string().trim().min(1).max(80).transform(v=>v.toUpperCase()),
  unit:z.enum(["units","kg","litres","metres"]),
  kind:z.enum(["opening","in","out","adjustment"]),
  quantity:z.number().finite().min(-1_000_000).max(1_000_000).refine(v=>Math.abs(v*1000-Math.round(v*1000))<1e-6,"Máximo tres decimales"),
  reason:z.string().trim().min(5).max(500),
}).strict().superRefine((v,ctx)=>{
  if((v.kind==="opening"&&v.quantity<0)||(["in","out"].includes(v.kind)&&v.quantity<=0)||(v.kind==="adjustment"&&v.quantity===0))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Cantidad incompatible con el tipo de movimiento"});
  if(v.unit==="units"&&!Number.isInteger(v.quantity))ctx.addIssue({code:z.ZodIssueCode.custom,message:"Las unidades son enteras"});
});
export type InventoryMovementInput=z.infer<typeof inventoryMovementSchema>;
export type InventoryBalance={code:string;unit:InventoryMovementInput["unit"];balance:number;initialized:true};
export type InventoryMovement=InventoryMovementInput&{id:string;balanceAfter:number;createdAt:string};
export type InventorySnapshot={balances:InventoryBalance[];movements:InventoryMovement[];canWrite:boolean};
export function applyInventoryMovement(prior:InventoryBalance|undefined,input:InventoryMovementInput):InventoryBalance {
  if(!prior&&input.kind!=="opening")throw Error("OPENING_REQUIRED");
  if(prior&&input.kind==="opening")throw Error("ALREADY_OPENED");
  if(prior&&prior.unit!==input.unit)throw Error("UNIT_MISMATCH");
  const delta=input.kind==="out"?-input.quantity:input.quantity;
  const balance=Math.round(((prior?.balance??0)+delta)*1000)/1000;
  if(balance<0)throw Error("INSUFFICIENT_STOCK");
  return {code:input.code,unit:input.unit,balance,initialized:true};
}
