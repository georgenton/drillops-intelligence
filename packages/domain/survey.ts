export interface SurveyStation { depth: number; inclination: number; azimuth: number }

const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (radiansValue: number) => radiansValue * 180 / Math.PI;
const normalizeAzimuth = (value: number) => ((value % 360) + 360) % 360;

export function doglegSeverity(previous: SurveyStation, current: SurveyStation): number {
  const courseLength = current.depth - previous.depth;
  if (courseLength <= 0) return 0;
  const i1 = radians(Math.abs(previous.inclination));
  const i2 = radians(Math.abs(current.inclination));
  const azimuthChange = radians(current.azimuth - previous.azimuth);
  const cosine = Math.cos(i1) * Math.cos(i2) + Math.sin(i1) * Math.sin(i2) * Math.cos(azimuthChange);
  const dogleg = Math.acos(Math.max(-1, Math.min(1, cosine)));
  return degrees(dogleg) * 30 / courseLength;
}

export function projectSurveyTrend(stations: SurveyStation[], count = 5): { projected: SurveyStation[]; doglegDegPer30m: number; confidence: "low" | "medium" | "high" } {
  const ordered = stations.slice().sort((a, b) => a.depth - b.depth);
  const recent = ordered.slice(-5);
  const last = recent.at(-1);
  const previous = recent.at(-2);
  if (!last || !previous) return { projected: [], doglegDegPer30m: 0, confidence: "low" };
  const steps = recent.slice(1).map((station, index) => Math.max(0.01, station.depth - recent[index].depth));
  const depthStep = steps.reduce((sum, value) => sum + value, 0) / steps.length;
  const inclinationRates = recent.slice(1).map((station, index) => (station.inclination - recent[index].inclination) / steps[index]);
  const azimuthRates = recent.slice(1).map((station, index) => {
    let change = station.azimuth - recent[index].azimuth;
    if (change > 180) change -= 360;
    if (change < -180) change += 360;
    return change / steps[index];
  });
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const inclinationRate = average(inclinationRates);
  const azimuthRate = average(azimuthRates);
  const projected = Array.from({ length: count }, (_, index) => {
    const deltaDepth = depthStep * (index + 1);
    return {
      depth: last.depth + deltaDepth,
      inclination: Math.max(-180, Math.min(180, last.inclination + inclinationRate * deltaDepth)),
      azimuth: normalizeAzimuth(last.azimuth + azimuthRate * deltaDepth),
    };
  });
  const rateSpread = average(inclinationRates.map((value) => Math.abs(value - inclinationRate))) + average(azimuthRates.map((value) => Math.abs(value - azimuthRate)));
  const confidence = recent.length >= 5 && rateSpread < 0.02 ? "high" : recent.length >= 4 && rateSpread < 0.06 ? "medium" : "low";
  return { projected, doglegDegPer30m: doglegSeverity(previous, last), confidence };
}
