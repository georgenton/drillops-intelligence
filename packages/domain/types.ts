export type TenantId = "extract" | "minera-a" | "minera-b";
export type Diameter = "PQ" | "HQ" | "NQ";
export type Priority = "speed" | "cost" | "life" | "balanced";
export type Level = "low" | "medium" | "high";

export interface Tenant { id: TenantId; name: string; slug: string; color: string; plan: string; status: "active" | "trial"; }
export interface Rig { id: string; tenantId: TenantId; code: string; manufacturer: string; model: string; serial: string; site: string; hourlyCost: number; active: boolean; source: "manual_analog" | "digital" | "sensor"; capabilities: string[]; }
export interface Drillhole { id: string; tenantId: TenantId; code: string; project: string; rigId: string; targetDepth: number; currentDepth: number; diameter: Diameter; status: "drilling" | "planned" | "completed"; startDate: string; eta: string; }
export interface Shift { id: string; tenantId: TenantId; drillholeId: string; rigId: string; date: string; type: "Día" | "Noche"; crew: string; depthStart: number; depthEnd: number; effectiveHours: number; totalHours: number; npt: Record<string, number>; }
export interface Interval { id: string; tenantId: TenantId; drillholeId: string; shiftId: string; rigId: string; startDepth: number; endDepth: number; minutes: number; bitCode: string; pressure?: number; torque?: number; rpm?: number; waterFlow?: number; waterReturn: "complete" | "partial" | "lost"; recovery: number; hardness: number; fracturing: Level; abrasivity: Level; vibration: Level; stability: "stable" | "unstable"; comment: string; source: "manual" | "imported" | "sensor"; }
export interface Crown { id: string; tenantId: TenantId; manufacturer: string; product: string; matrix: string; diameter: Diameter; price: number; stock: number; reserved: number; reorder: number; historicalRop: number; historicalCost: number; historicalLife: number; observations: number; hardnessFit: number[]; fracturingFit: Level[]; }
export interface Recommendation { crown: Crown; score: number; confidence: Level; reasons: string[]; similarity: number; cost: number; rop: number; life: number; inventory: number; }

export interface AdvisorInput { tenantId: TenantId; diameter: Diameter; hardness: number; fracturing: Level; abrasivity: Level; waterReturn: "complete" | "partial" | "lost"; priority: Priority; showUnavailable?: boolean; }
