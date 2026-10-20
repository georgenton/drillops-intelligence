import { describe,it,expect } from "vitest";
import { applyInventoryMovement,inventoryMovementSchema } from "./inventory-ledger";
const input={requestId:"00000000-0000-4000-8000-000000000001",code:"CROWN-TEST",unit:"units" as const,kind:"opening" as const,quantity:2,reason:"Synthetic opening"};
describe("explicit stock ledger",()=>{
  it("requires opening, never derives consumption as stock",()=>expect(()=>applyInventoryMovement(undefined,{...input,kind:"in"})).toThrow("OPENING_REQUIRED"));
  it("opens once and preserves units",()=>{const prior=applyInventoryMovement(undefined,input);expect(prior.balance).toBe(2);expect(()=>applyInventoryMovement(prior,input)).toThrow("ALREADY_OPENED");expect(()=>applyInventoryMovement(prior,{...input,kind:"in",unit:"kg"})).toThrow("UNIT_MISMATCH");});
  it("supports zero opening, receipt, withdrawal and signed adjustment",()=>{let balance=applyInventoryMovement(undefined,{...input,quantity:0});balance=applyInventoryMovement(balance,{...input,kind:"in",quantity:5});balance=applyInventoryMovement(balance,{...input,kind:"out",quantity:2});expect(applyInventoryMovement(balance,{...input,kind:"adjustment",quantity:-1}).balance).toBe(2);});
  it("blocks negative balances",()=>expect(()=>applyInventoryMovement(applyInventoryMovement(undefined,input),{...input,kind:"out",quantity:3})).toThrow("INSUFFICIENT_STOCK"));
  it("validates signed quantities, integers and strict tenant-free input",()=>{expect(inventoryMovementSchema.safeParse({...input,quantity:-1}).success).toBe(false);expect(inventoryMovementSchema.safeParse({...input,quantity:1.2}).success).toBe(false);expect(inventoryMovementSchema.safeParse({...input,tenantId:"other"}).success).toBe(false);expect(inventoryMovementSchema.parse({...input,code:" test "}).code).toBe("TEST");});
});
