import { describe, expect, it } from "vitest";
import { calculateSurveyTrajectory, type SurveyConfiguration } from "./survey-trajectory";
const config: SurveyConfiguration = { angleConvention: "dip_negative_down", azimuthReference: "true_north", method: "minimum_curvature", anchor: { depthM: 0, eastM: 0, northM: 0, tvdM: 0 }, evidence: "Synthetic test convention" };
const station = (depthM: number, dip = -90, azimuth = 0) => ({ depthM, dip, azimuth, valid: true });
describe("explicit minimum-curvature survey", () => {
  it("does not infer a convention", () => expect(calculateSurveyTrajectory([station(0), station(30)]).status).toBe("configuration_required"));
  it("vertical negative DIP descends with zero lateral displacement", () => {
    const end = calculateSurveyTrajectory([station(0), station(30)], config).points[1];
    expect(end.tvd).toBeCloseTo(30); expect(end.east).toBeCloseTo(0); expect(end.north).toBeCloseTo(0);
  });
  it("positive DIP convention gives equivalent vertical path", () => expect(calculateSurveyTrajectory([station(0, 90), station(30, 90)], { ...config, angleConvention: "dip_positive_down" }).points[1].tvd).toBeCloseTo(30));
  it("integrates a circular quarter-turn analytically", () => {
    const end = calculateSurveyTrajectory([station(0, -90, 90), station(100, 0, 90)], config).points[1];
    expect(end.east).toBeCloseTo(200 / Math.PI); expect(end.tvd).toBeCloseTo(200 / Math.PI); expect(end.north).toBeCloseTo(0);
  });
  it("handles azimuth wrap through north, not south", () => {
    const end = calculateSurveyTrajectory([station(0, 0, 359), station(30, 0, 1)], config).points[1];
    expect(end.north).toBeGreaterThan(29.9); expect(end.east).toBeCloseTo(0);
  });
  it("deduplicates identical observations but blocks contradictory depths", () => {
    expect(calculateSurveyTrajectory([station(0), station(30), station(30)], config).duplicates).toBe(1);
    expect(calculateSurveyTrajectory([station(0), station(30), station(30, -80)], config).status).toBe("invalid_stations");
  });
  it("does not invent collar segment", () => expect(calculateSurveyTrajectory([station(10), station(30)], config).status).toBe("configuration_required"));
  it("preserves explicit anchor coordinates", () => {
    const end = calculateSurveyTrajectory([station(10), station(30)], { ...config, anchor: { depthM: 10, eastM: 5, northM: 6, tvdM: 7 } }).points[1];
    expect(end).toMatchObject({ east: 5, north: 6, tvd: 27 });
  });
  it("rejects missing data, bad angles, and antipodal directions", () => {
    expect(calculateSurveyTrajectory([station(0), { ...station(30), dip: null }], config).points).toEqual([]);
    expect(calculateSurveyTrajectory([station(0), station(30, -100)], config).points).toEqual([]);
    expect(calculateSurveyTrajectory([station(0), station(30, 90)], config).points).toEqual([]);
  });
});
