import { describe, expect, it } from "vitest";
import { doglegSeverity, projectSurveyTrend } from "./survey";

describe("proyección de survey", () => {
  const stations=[0,30,60,90,120].map((depth,index)=>({depth,inclination:-60-index*.6,azimuth:110+index*1.5}));

  it("calcula dogleg normalizado por 30 m",()=>{
    expect(doglegSeverity(stations[3],stations[4])).toBeGreaterThan(0);
  });

  it("proyecta estaciones sin alterar los datos medidos",()=>{
    const result=projectSurveyTrend(stations,3);
    expect(result.projected).toHaveLength(3);
    expect(result.projected[0].depth).toBe(150);
    expect(stations.at(-1)?.depth).toBe(120);
  });
});
