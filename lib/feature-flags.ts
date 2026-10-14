export function isBillingTabEnabled(value = process.env.BILLING_TAB_ENABLED) {
  return value?.trim().toLowerCase() === "true";
}
