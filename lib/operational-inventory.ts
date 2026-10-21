import { tenantTransaction } from "./operational-db";
import type { PrivateSession } from "./private-auth";
import { canAccessSection, canWriteManualRecord } from "./access-control";
import { applyInventoryMovement, inventoryMovementSchema, type InventoryBalance, type InventoryMovement, type InventorySnapshot } from "@/packages/domain/inventory-ledger";
type Session=Pick<PrivateSession,"tenantId"|"userId"|"role"|"plan"|"demo">;
export const canWriteInventory=(s:Session)=>!s.demo&&canAccessSection({...s,section:"inventario"})&&canWriteManualRecord(s.role,s.plan,"inventory_movement");
function assertRead(s:Session){if(!canAccessSection({...s,section:"inventario"}))throw Error("FORBIDDEN");}
const columns=`id,request_id AS "requestId",code,unit,kind,quantity::float8 AS quantity,balance_after::float8 AS "balanceAfter",reason,created_at AS "createdAt"`;
export async function readInventory(s:Session):Promise<InventorySnapshot>{
  assertRead(s);
  return tenantTransaction(s.tenantId,async client=>{
    const movements=await client.query<InventoryMovement>(`SELECT ${columns} FROM operational_inventory_movements WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 500`,[s.tenantId]);
    const balances=await client.query<InventoryBalance>(`SELECT code,min(unit) AS unit,sum(CASE WHEN kind='out' THEN -quantity ELSE quantity END)::float8 AS balance,true AS initialized FROM operational_inventory_movements WHERE tenant_id=$1 GROUP BY code ORDER BY code`,[s.tenantId]);
    return {balances:balances.rows,movements:movements.rows,canWrite:canWriteInventory(s)};
  });
}
export async function saveInventoryMovement(s:Session,raw:unknown){
  if(!canWriteInventory(s))throw Error("FORBIDDEN");
  const input=inventoryMovementSchema.parse(raw);
  return tenantTransaction(s.tenantId,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${s.tenantId}|inventory`]);
    const existing=await client.query<InventoryMovement>(`SELECT ${columns} FROM operational_inventory_movements WHERE tenant_id=$1 AND request_id=$2`,[s.tenantId,input.requestId]);
    if(existing.rows[0]){
      const row=existing.rows[0];
      if(["code","unit","kind","quantity","reason"].some(key=>row[key as keyof InventoryMovement]!==input[key as keyof typeof input]))throw Error("REQUEST_CONFLICT");
      return {ok:true,balance:row.balanceAfter,id:row.id,replayed:true};
    }
    const prior=await client.query<InventoryBalance>(`SELECT code,min(unit) AS unit,sum(CASE WHEN kind='out' THEN -quantity ELSE quantity END)::float8 AS balance,true AS initialized FROM operational_inventory_movements WHERE tenant_id=$1 AND code=$2 GROUP BY code`,[s.tenantId,input.code]);
    const next=applyInventoryMovement(prior.rows[0],input);
    const result=await client.query<{id:string}>(`INSERT INTO operational_inventory_movements(tenant_id,request_id,code,unit,kind,quantity,balance_after,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[s.tenantId,input.requestId,input.code,input.unit,input.kind,input.quantity,next.balance,input.reason,s.userId]);
    return {ok:true,id:result.rows[0].id,balance:next.balance,replayed:false};
  });
}
