import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import OpenAI from "openai";
import type { ResponseFunctionToolCall, ResponseInput, ResponseReasoningItem } from "openai/resources/responses/responses";
import { verifySession } from "@/lib/auth";
import { assertTenantAccess } from "@/lib/tenant-guard";
import { buildOperationalSnapshot } from "@/packages/bi/analytics";
import { loadBiDataset } from "@/packages/bi/data-source";
import { raulMarchConsumableItems, raulMonthlyConsumableCosts } from "@/lib/raul-data";
import { calculateMseMpa, calculateRop } from "@/packages/domain/calculations";
import {
  chartTypeFromTool,
  executeBiQuery,
  inferBiQuery,
  metricFromTool,
  unitSystemFromTool,
} from "@/packages/bi/query";
import type { BiQueryRequest } from "@/packages/bi/types";
import { canQueryBiMetric, canUseAssistant, canViewOperationalCosts, tenantPlan } from "@/lib/access-control";

const inputSchema = z.object({
  question: z.string().min(2).max(500),
  tenantId: z.enum(["extract", "minera-a", "minera-b"]),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1000) })).max(8).optional(),
});

const queryTool = {
  type: "function" as const,
  name: "query_operational_bi",
  description: "Consulta indicadores operacionales autorizados y genera una especificación de gráfica desde la base de datos del tenant actual.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      metric: {
        type: "string",
        enum: ["metres", "planned", "rop", "utilization", "npt", "depth", "recovery", "pressure", "torque", "rpm", "mse", "consumables", "crowns", "eta", "summary"],
        description: "Indicador que responde mejor la pregunta.",
      },
      chartType: {
        type: ["string", "null"],
        enum: ["bar", "bar3d", "line", "area", "doughnut", "scatter", null],
        description: "Tipo de gráfica solicitado; null cuando el usuario no especifica uno.",
      },
      units: {
        type: "string",
        enum: ["metric", "imperial"],
        description: "Sistema métrico, o imperial cuando solicita pies/ft.",
      },
    },
    required: ["metric", "chartType", "units"],
    additionalProperties: false,
  },
};

function resolveDeterministicQuery(question: string, history: Array<{ role: "user" | "assistant"; text: string }> = []): BiQueryRequest {
  const current = inferBiQuery(question);
  if (current.metric !== "summary") return current;
  const previousQuestion = history.slice().reverse().find((item) => item.role === "user")?.text;
  if (!previousQuestion) return current;
  const previous = inferBiQuery(previousQuestion);
  return {
    metric: previous.metric,
    chartType: current.chartType ?? previous.chartType,
    units: /pie|pies|\bft\b|imperial/i.test(question) ? "imperial" : current.units,
  };
}

async function chooseQueryWithOpenAI(openai: OpenAI, question: string, history: Array<{ role: "user" | "assistant"; text: string }>) {
  const conversation = [...history, { role: "user" as const, text: question }].map((item) => `${item.role === "user" ? "Usuario" : "Asistente"}: ${item.text}`).join("\n");
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6",
    reasoning: { effort: "low" },
    instructions: "Eres el router del BI de perforación. Debes llamar query_operational_bi una sola vez. Conserva el indicador de la conversación cuando la nueva pregunta solo cambie unidades o tipo de gráfica. No respondas con conocimiento externo.",
    input: conversation,
    tools: [queryTool],
    tool_choice: "required",
    parallel_tool_calls: false,
    max_output_tokens: 220,
    store: false,
  });
  const call = response.output.find((item) => item.type === "function_call" && item.name === queryTool.name);
  if (!call || call.type !== "function_call") return null;
  const args = JSON.parse(call.arguments) as Record<string, unknown>;
  return {
    query: {
      metric: metricFromTool(args.metric),
      chartType: chartTypeFromTool(args.chartType),
      units: unitSystemFromTool(args.units),
    } satisfies BiQueryRequest,
    response,
    call,
    conversation,
  };
}

export async function POST(request: Request) {
  const session = verifySession((await cookies()).get("drillops_session")?.value);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Consulta inválida" }, { status: 400 });
  try { assertTenantAccess(session, parsed.data.tenantId); } catch { return NextResponse.json({ error: "Acceso de tenant denegado" }, { status: 403 }); }
  const plan = tenantPlan(parsed.data.tenantId);
  if (!canUseAssistant(session.role, plan)) return NextResponse.json({ error: "El asistente no está incluido para tu perfil o plan" }, { status: 403 });

  const dataset = await loadBiDataset(parsed.data.tenantId);
  const snapshot = buildOperationalSnapshot(dataset);
  const crowns = dataset.crowns.map((crown) => ({
    product: crown.product,
    rop: crown.historicalRop,
    cost: crown.historicalCost,
    available: Math.max(0, crown.stock - crown.reserved),
  }));
  const activeHole = snapshot.hole;
  const diameterMm = activeHole?.diameter === "PQ" ? 122.6 : activeHole?.diameter === "NQ" ? 75.7 : 96;
  const queryContext = {
    crowns,
    intervals: dataset.intervals.map((interval) => ({ ...interval, mse: calculateMseMpa({ wobKn: interval.wobKn, torqueNm: interval.torque, rpm: interval.rpm, ropMetresPerHour: calculateRop(interval.endDepth - interval.startDepth, interval.minutes / 60), holeDiameterMm: diameterMm }) })),
    monthlyConsumables: raulMonthlyConsumableCosts,
    consumableItems: raulMarchConsumableItems,
    includeCosts: canViewOperationalCosts(session.role),
  };
  const history = parsed.data.history ?? [];
  const deterministicQuery = resolveDeterministicQuery(parsed.data.question, history);
  if (!canQueryBiMetric(session.role, plan, deterministicQuery.metric)) return NextResponse.json({ error: "Tu perfil o plan no permite consultar información financiera mediante el asistente" }, { status: 403 });
  const deterministic = executeBiQuery(snapshot, deterministicQuery, queryContext);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ...deterministic, mode: "deterministic", source: dataset.source, query: deterministicQuery });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const selection = await chooseQueryWithOpenAI(openai, parsed.data.question, history);
    if (!selection) return NextResponse.json({ ...deterministic, mode: "fallback", source: dataset.source, query: deterministicQuery });
    if (!canQueryBiMetric(session.role, plan, selection.query.metric)) return NextResponse.json({ error: "Tu perfil o plan no permite consultar información financiera mediante el asistente" }, { status: 403 });
    const result = executeBiQuery(snapshot, selection.query, queryContext);
    const reasoningItems = selection.response.output.filter((item): item is ResponseReasoningItem => item.type === "reasoning");
    const finalInput: ResponseInput = [
      { role: "user" as const, content: selection.conversation },
      ...reasoningItems,
      selection.call as ResponseFunctionToolCall,
      { type: "function_call_output" as const, call_id: selection.call.call_id, output: JSON.stringify({ answer: result.answer, facts: result.facts }) },
    ];
    const narration = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.6",
      reasoning: { effort: "low" },
      instructions: "Responde en español y en máximo 90 palabras. Usa exclusivamente el resultado de la función. No recalcules, no inventes métricas, no hagas inferencias geológicas y aclara incertidumbre cuando corresponda.",
      input: finalInput,
      tools: [queryTool],
      tool_choice: "none",
      max_output_tokens: 220,
      safety_identifier: `tenant_${parsed.data.tenantId}`,
      store: false,
    });
    return NextResponse.json({ ...result, answer: narration.output_text || result.answer, mode: "openai", source: dataset.source, query: selection.query });
  } catch {
    return NextResponse.json({ ...deterministic, answer: `${deterministic.answer} Se utilizó el motor local seguro porque el proveedor de IA no estuvo disponible.`, mode: "fallback", source: dataset.source, query: deterministicQuery });
  }
}
