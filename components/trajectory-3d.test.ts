import {describe,it,expect} from "vitest";
import {circularMidpointDegrees,surveyToTrajectory} from "./trajectory-3d";
describe("Survey circular angles",()=>{
 it("crosses north by the short arc",()=>{expect(circularMidpointDegrees(359,1)).toBe(0);expect(circularMidpointDegrees(1,359)).toBe(0);});
 it("does not send a north crossing south",()=>{const points=surveyToTrajectory([{depth:0,inclination:45,azimuth:359},{depth:10,inclination:45,azimuth:1}]);expect(points[1].north).toBeGreaterThan(0);expect(points[1].east).toBeCloseTo(0);});
});
