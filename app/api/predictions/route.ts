import { createPrediction, readSession, type PredictionInput } from "../../../lib/server-store";

export async function POST(request: Request) {
  const session = readSession(request.headers.get("cookie"));
  if (!session || session.role !== "user") return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const input = await request.json() as PredictionInput;
    if (!input.stream || !input.region || !/^[A-Za-z0-9-]{2,10}$/.test(input.noc || ""))
      return Response.json({ error: "请完整填写 Stream、地区和 NOC" }, { status: 400 });
    return Response.json(await createPrediction(session.id, input));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "预测失败" }, { status: 400 });
  }
}
