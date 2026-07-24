import { getAdminData, readSession, updateSettings } from "../../../lib/server-store";

const admin = (request: Request) => readSession(request.headers.get("cookie"))?.role === "admin";
export async function GET(request: Request) {
  return admin(request) ? Response.json(await getAdminData()) : Response.json({ error: "无权访问" }, { status: 403 });
}
export async function PUT(request: Request) {
  if (!admin(request)) return Response.json({ error: "无权访问" }, { status: 403 });
  const body = await request.json() as { wechat?: string; qr?: string; consultationText?: string };
  if ((body.qr?.length || 0) > 3_000_000) return Response.json({ error: "二维码图片过大" }, { status: 400 });
  return Response.json(await updateSettings({ wechat: body.wechat?.trim() || "", qr: body.qr || "", consultationText: body.consultationText?.trim() || "" }));
}
