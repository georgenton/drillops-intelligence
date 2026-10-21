"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SurveyPoint } from "@/packages/bi/types";

export interface TrajectoryPoint extends SurveyPoint {
  east: number;
  north: number;
  tvd: number;
}

export function circularMidpointDegrees(a:number,b:number){
  const delta=((b-a+540)%360)-180;
  return ((a+delta/2)%360+360)%360;
}

export function surveyToTrajectory(survey: SurveyPoint[]): TrajectoryPoint[] {
  if (!survey.length) return [];
  let east = 0;
  let north = 0;
  let tvd = 0;
  return survey.map((point, index) => {
    if (index > 0) {
      const previous = survey[index - 1];
      const delta = Math.max(0, point.depth - previous.depth);
      const inclination = Math.abs((point.inclination + previous.inclination) / 2) * Math.PI / 180;
      const azimuth = circularMidpointDegrees(previous.azimuth,point.azimuth) * Math.PI / 180;
      const horizontal = delta * Math.sin(inclination);
      tvd += delta * Math.cos(inclination);
      east += horizontal * Math.sin(azimuth);
      north += horizontal * Math.cos(azimuth);
    }
    return { ...point, east, north, tvd };
  });
}

export function Trajectory3D({ survey, holeCode, trajectoryPoints, originLabel, methodLabel }: { survey: SurveyPoint[]; holeCode: string; trajectoryPoints?: TrajectoryPoint[]; originLabel?: string; methodLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(38);
  const points = useMemo(() => trajectoryPoints ?? surveyToTrajectory(survey), [survey, trajectoryPoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points.length) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(dpr, dpr);
      context.clearRect(0, 0, rect.width, rect.height);
      const angle = rotation * Math.PI / 180;
      const projected = points.map((point) => {
        const horizontal = point.east * Math.cos(angle) - point.north * Math.sin(angle);
        const depthPerspective = point.east * Math.sin(angle) + point.north * Math.cos(angle);
        return { ...point, px: horizontal, py: point.tvd + depthPerspective * 0.28 };
      });
      const xs = projected.map((point) => point.px);
      const ys = projected.map((point) => point.py);
      const xMin = Math.min(...xs, 0), xMax = Math.max(...xs, 0), yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 1);
      const padding = { left: 64, right: 70, top: 38, bottom: 46 };
      const scale = Math.min((rect.width - padding.left - padding.right) / Math.max(1, xMax - xMin), (rect.height - padding.top - padding.bottom) / Math.max(1, yMax - yMin));
      const x = (value: number) => padding.left + (value - xMin) * scale;
      const y = (value: number) => padding.top + (value - yMin) * scale;

      context.strokeStyle = "rgba(121,140,151,.16)";
      context.lineWidth = 1;
      context.font = "11px Inter, sans-serif";
      context.fillStyle = "#a8b7bf";
      for (let index = 0; index <= 5; index += 1) {
        const gy = padding.top + (rect.height - padding.top - padding.bottom) * index / 5;
        context.beginPath(); context.moveTo(padding.left, gy); context.lineTo(rect.width - padding.right, gy); context.stroke();
        context.fillText(`${(yMin+(gy-padding.top)/scale).toFixed(0)}`,10,gy+4);
      }
      const barMetres=100/scale,barY=rect.height-25;
      context.strokeStyle="#a8b7bf";context.beginPath();context.moveTo(padding.left,barY);context.lineTo(padding.left+100,barY);context.stroke();
      context.fillText(`${barMetres.toFixed(1)} m en proyección`,padding.left,barY-8);
      const cx=rect.width-48,cy=65,radius=23;
      context.beginPath();context.arc(cx,cy,radius,0,2*Math.PI);context.stroke();
      const northAngle=(-90-rotation)*Math.PI/180;
      context.beginPath();context.moveTo(cx,cy);context.lineTo(cx+radius*Math.cos(northAngle),cy+radius*Math.sin(northAngle));context.stroke();
      context.fillText("N ref.",cx-16,cy-radius-8);
      context.fillText(`Az ${points.at(-1)!.azimuth.toFixed(1)}°`,cx-30,cy+radius+17);
      const gradient = context.createLinearGradient(0, padding.top, 0, rect.height - padding.bottom);
      gradient.addColorStop(0, "#56c7ff");
      gradient.addColorStop(0.55, "#d7ff43");
      gradient.addColorStop(1, "#ff9f43");
      context.strokeStyle = gradient;
      context.lineWidth = 4;
      context.lineJoin = "round";
      context.shadowColor = "rgba(215,255,67,.18)";
      context.shadowBlur = 12;
      context.beginPath();
      projected.forEach((point, index) => index === 0 ? context.moveTo(x(point.px), y(point.py)) : context.lineTo(x(point.px), y(point.py)));
      context.stroke();
      context.shadowBlur = 0;
      for (const [index, point] of projected.entries()) {
        context.fillStyle = index === projected.length - 1 ? "#ff9f43" : "#d7ff43";
        context.beginPath(); context.arc(x(point.px), y(point.py), index === projected.length - 1 ? 5 : 2.5, 0, Math.PI * 2); context.fill();
      }
      context.fillStyle = "#92a0a7";
      context.font = "10px Inter, sans-serif";
      context.fillText(originLabel ?? "COLLAR · 0 m", x(projected[0].px) + 10, y(projected[0].py) - 8);
      const end = projected.at(-1)!;
      context.fillStyle = "#edf2f4";
      context.fillText(`${trajectoryPoints ? "ESTACIÓN" : "FONDO"} · ${end.depth.toFixed(0)} m MD`, Math.min(rect.width - 145, x(end.px) + 10), y(end.py) + 4);
      context.fillStyle = "#718087";
      context.fillText("m proyectados ↓", 8, 16);
      context.fillText("Proyección E–N", rect.width - 130, rect.height - 18);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [points, rotation, originLabel, trajectoryPoints]);

  const end = points.at(-1);
  return <div className="trajectory-3d">
    <div className="trajectory-controls">
      <div><b>Trayectoria espacial · {holeCode}</b><span>{methodLabel ?? "Proyección 3D calculada desde inclinación, azimut y profundidad medida"}</span></div>
      <label>Rotación <input aria-label="Rotación de trayectoria" type="range" min="0" max="180" value={rotation} onChange={(event) => setRotation(Number(event.target.value))}/><output>{rotation}°</output></label>
    </div>
    <canvas ref={canvasRef} role="img" aria-label={`Trayectoria tridimensional de ${holeCode}`} />
    <div className="trajectory-stats"><span>{trajectoryPoints ? "Coordenada E" : "Desplazamiento E"} <b>{end?.east.toFixed(1) ?? "0.0"} m</b></span><span>{trajectoryPoints ? "Coordenada N" : "Desplazamiento N"} <b>{end?.north.toFixed(1) ?? "0.0"} m</b></span><span>TVD calculada <b>{end?.tvd.toFixed(1) ?? "0.0"} m</b></span><span>Azimut última estación <b>{end?.azimuth.toFixed(2)??"—"}° / 360°</b></span></div>
    <p className="source-note">Escala uniforme en metros proyectados; la perspectiva combina TVD y posición horizontal. E/N/TVD son relativos al ancla. N ref. sigue la referencia declarada arriba, no certifica norte geográfico. El perfil 2D conserva MD y grados observados.</p>
  </div>;
}
