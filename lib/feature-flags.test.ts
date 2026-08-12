import { describe, expect, it } from "vitest";
import { isBillingTabEnabled } from "./feature-flags";

describe("feature flags", () => {
  it("mantiene facturación desactivada por defecto", () => {
    expect(isBillingTabEnabled(undefined)).toBe(false);
    expect(isBillingTabEnabled("false")).toBe(false);
  });

  it("permite reactivar facturación explícitamente", () => {
    expect(isBillingTabEnabled("true")).toBe(true);
    expect(isBillingTabEnabled(" TRUE ")).toBe(true);
  });
});
