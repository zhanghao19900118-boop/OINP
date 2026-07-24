import { getMyData, readSession } from "../../../lib/server-store";

export async function GET(request: Request) {
  const session = readSession(request.headers.get("cookie"));
  if (!session || session.role !== "user") return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json(await getMyData(session.id));
}
