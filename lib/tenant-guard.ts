export function scopeToTenant<T extends {tenantId:string}>(rows:T[], tenantId:string):T[] {
  if (!tenantId) return [];
  return rows.filter(row=>row.tenantId===tenantId);
}

export function assertTenantAccess(session:{role:string;tenantId:string}, requestedTenantId:string):void {
  if (session.role!=="platform_admin" && session.tenantId!==requestedTenantId) throw new Error("TENANT_ACCESS_DENIED");
}
