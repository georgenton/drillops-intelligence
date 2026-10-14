/** Explicit opt-in only: missing configuration must never disclose demo data. */
export function isDemoMode() { return process.env.DEMO_MODE === "true"; }
export function isCommerciallyClosed() {
  return process.env.DRILLOPS_ENV === "production" && process.env.COMMERCIAL_ACCESS_ENABLED !== "true";
}
