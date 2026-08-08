import { describe, expect, it } from "vitest";
import { assertTenantAccess, scopeToTenant } from "./tenant-guard";

describe("aislamiento multi-tenant",()=>{
  const rows=[{id:1,tenantId:"a"},{id:2,tenantId:"b"}];
  it("nunca devuelve registros de otro tenant",()=>expect(scopeToTenant(rows,"a")).toEqual([{id:1,tenantId:"a"}]));
  it("bloquea acceso cruzado para usuario de tenant",()=>expect(()=>assertTenantAccess({role:"supervisor",tenantId:"a"},"b")).toThrow("TENANT_ACCESS_DENIED"));
  it("permite selección explícita al platform admin",()=>expect(()=>assertTenantAccess({role:"platform_admin",tenantId:"a"},"b")).not.toThrow());
});
