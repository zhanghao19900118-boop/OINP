import { readSession, saveScore, type ScoreItem } from "../../../lib/server-store";

export async function POST(request: Request) {
  const session = readSession(request.headers.get("cookie"));
  if (!session || session.role !== "user") return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json() as { total: number; max: number; items: ScoreItem[] };
  if (!Number.isFinite(body.total) || !Array.isArray(body.items) || body.items.length !== 11) return Response.json({ error: "评分数据无效" }, { status: 400 });
  await saveScore(session.id, body.total, body.max, body.items);
  return Response.json({ ok: true });
}
