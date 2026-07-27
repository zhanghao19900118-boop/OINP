import { createAdminPrediction, getAdminPredictionHistory, readSession, type AdminPredictionInput } from "../../../../lib/server-store";

const authorized = (request: Request) => readSession(request.headers.get("cookie"))?.role === "admin";

export async function GET(request: Request) {
  return authorized(request)
    ? Response.json(await getAdminPredictionHistory())
    : Response.json({ error: "无权访问" }, { status: 403 });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "无权访问" }, { status: 403 });
  try {
    const input = await request.json() as AdminPredictionInput;
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 200)
      return Response.json({ error: "EOI 分数必须在 0–200 之间" }, { status: 400 });
    if (!input.stream || !input.region || !/^[A-Za-z0-9-]{2,10}$/.test(input.noc || ""))
      return Response.json({ error: "请完整填写 Stream、地区和 NOC" }, { status: 400 });
    return Response.json(await createAdminPrediction(input));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "预测失败" }, { status: 400 });
  }
}
