import { describe, expect, it } from "vitest";
import { scenarioCoefficients, scenario } from "./rop-model";
import { computeDecisionScenario } from "../../lib/decision-service";

describe("Raúl's didactic example retains hypothetical provenance", () => {
  it("does not label 200 MPa as an independent measurement", () => {
    const result = scenarioCoefficients(4, .5, 2, 200, "Ejemplo de Raúl", "hypothetical");
    expect(result.alphaStatus).toBe("HYPOTHETICAL_UCS");
    expect(result.betaPerHour).toBeCloseTo(1.03972077084, 10);
    expect(result.alphaPerMpaHour).toBeCloseTo(.005198603854, 10);
    const forecast = scenario({ ropNow: .5, beta: result.betaPerHour, horizonHours: 1 });
    expect(forecast.metres).toBeCloseTo(.310875106, 8);
  });
  it("preserves the distinction after server recomputation", () => {
    const result = computeDecisionScenario({ r0: 4, r1: .5, elapsed: 2, horizon: 1, threshold: .25, ucs: 200, ucsSource: "Ejemplo de Raúl", ucsKind: "hypothetical" });
    expect(result.ucsEvidence).toBe("HYPOTHETICAL_NOT_MEASURED");
    expect(result.coefficients.alphaStatus).toBe("HYPOTHETICAL_UCS");
    expect(result.assumptions.ucsKind).toBe("hypothetical");
  });
  it("keeps legacy independent-source validation, null UCS and increasing trends", () => {
    expect(scenarioCoefficients(4, .5, 2, 200, "", "independent").alphaPerMpaHour).toBeNull();
    expect(scenarioCoefficients(4, .5, 2, null, "", "hypothetical").alphaPerMpaHour).toBeNull();
    expect(scenarioCoefficients(.5, 4, 2, 200, "", "hypothetical").alphaPerMpaHour).toBeNull();
    expect(() => scenarioCoefficients(4, .5, 2, 0, "", "hypothetical")).toThrow();
  });
});
