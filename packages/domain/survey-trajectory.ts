/** Minimum curvature, with explicit angular convention and measured anchor.
 * No collar extrapolation, magnetic correction, or client-specific defaults.
 */
export type SurveyConfiguration = {
  angleConvention: "inclination_from_vertical" | "dip_negative_down" | "dip_positive_down";
  azimuthReference: "true_north" | "magnetic_north" | "grid_north";
  method: "minimum_curvature";
  anchor: { depthM: number; eastM: number; northM: number; tvdM: number };
  evidence: string;
};
export type MeasuredStation = { depthM: number | null; dip: number | null; azimuth: number | null; valid: boolean };
export type CalculatedStation = { depth: number; inclination: number; azimuth: number; east: number; north: number; tvd: number };
export type SurveyTrajectory = { status: "ready" | "configuration_required" | "invalid_stations"; points: CalculatedStation[]; reasons: string[]; duplicates: number };

export function calculateSurveyTrajectory(stations: MeasuredStation[], config?: SurveyConfiguration | null): SurveyTrajectory {
  const fail = (status: SurveyTrajectory["status"], reason: string): SurveyTrajectory => ({ status, points: [], reasons: [reason], duplicates: 0 });
  if (!config) return fail("configuration_required", "Declare convención DIP, referencia de norte y coordenadas de una estación de anclaje medida.");
  if (!["inclination_from_vertical", "dip_negative_down", "dip_positive_down"].includes(config.angleConvention) ||
      !["true_north", "magnetic_north", "grid_north"].includes(config.azimuthReference) ||
      config.method !== "minimum_curvature" || !config.evidence?.trim() ||
      !config.anchor || ![config.anchor.depthM, config.anchor.eastM, config.anchor.northM, config.anchor.tvdM].every(Number.isFinite) || config.anchor.depthM < 0)
    return fail("configuration_required", "La configuración requiere método de curvatura mínima, referencia, anclaje finito y evidencia de confirmación.");
  if (stations.some(s => !s.valid || s.depthM === null || s.dip === null || s.azimuth === null ||
      ![s.depthM, s.dip, s.azimuth].every(Number.isFinite) || s.depthM < 0 || s.azimuth < 0 || s.azimuth > 360 ||
      (config.angleConvention === "inclination_from_vertical" ? s.dip < 0 || s.dip > 180 : Math.abs(s.dip) > 90)))
    return fail("invalid_stations", "Hay estaciones inválidas o incompletas. Corrija la fuente; no se conectan huecos de medición silenciosamente.");
  const unique = new Map<number, CalculatedStation>();
  let duplicates = 0;
  for (const s of stations) {
    const inclination = config.angleConvention === "inclination_from_vertical" ? s.dip! :
      config.angleConvention === "dip_negative_down" ? 90 + s.dip! : 90 - s.dip!;
    const point = { depth: s.depthM!, inclination, azimuth: s.azimuth! % 360, east: 0, north: 0, tvd: 0 };
    const previous = unique.get(point.depth);
    if (previous && (previous.inclination !== inclination || previous.azimuth !== point.azimuth))
      return fail("invalid_stations", `Lecturas contradictorias a ${point.depth} m MD; se requiere resolver la fuente.`);
    if (previous) duplicates++; else unique.set(point.depth, point);
  }
  const points = [...unique.values()].sort((a, b) => a.depth - b.depth);
  if (points.length < 2) return fail("invalid_stations", "Se requieren al menos dos estaciones distintas completas.");
  if (points[0].depth !== config.anchor.depthM)
    return fail("configuration_required", `El anclaje debe coincidir con la primera estación medida (${points[0].depth} m MD); no se extrapola hasta el collar.`);
  Object.assign(points[0], { east: config.anchor.eastM, north: config.anchor.northM, tvd: config.anchor.tvdM });
  const vector = (p: CalculatedStation) => {
    const i = p.inclination * Math.PI / 180, a = p.azimuth * Math.PI / 180;
    return [Math.sin(i) * Math.sin(a), Math.sin(i) * Math.cos(a), Math.cos(i)];
  };
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1], current = points[index], a = vector(previous), b = vector(current);
    const dogleg = Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, n, i) => sum + n * b[i], 0))));
    if (Math.PI - dogleg < 1e-7) return fail("invalid_stations", "Direcciones antipodales: arco de curvatura mínima indeterminado.");
    const rf = dogleg < 1e-5 ? 1 + dogleg ** 2 / 12 + dogleg ** 4 / 120 : 2 * Math.tan(dogleg / 2) / dogleg;
    const scale = (current.depth - previous.depth) * rf / 2;
    current.east = previous.east + scale * (a[0] + b[0]);
    current.north = previous.north + scale * (a[1] + b[1]);
    current.tvd = previous.tvd + scale * (a[2] + b[2]);
  }
  return { status: "ready", points, reasons: [], duplicates };
}
