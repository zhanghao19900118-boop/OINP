import { authenticate, clearSessionCookie, issueSession, readSession, registerUser, sessionCookie } from "../../../lib/server-store";

const json = (body: unknown, status = 200, cookie?: string) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(cookie ? { "set-cookie": cookie } : {}) } });

export async function GET(request: Request) {
  const session = readSession(request.headers.get("cookie"));
  return json({ user: session ? { username: session.username, role: session.role } : null });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; username?: string; phone?: string; password?: string };
    if (body.action === "logout") return json({ ok: true }, 200, clearSessionCookie());
    const username = body.username?.trim() || "", password = body.password || "";
    if (username.length < 2 || password.length < 8) return json({ error: "用户名至少2位，密码至少8位" }, 400);
    if (body.action === "register") {
      const phone = body.phone?.trim() || "";
      if (!/^[+()\d\s-]{7,20}$/.test(phone)) return json({ error: "请输入有效手机号" }, 400);
      const user = await registerUser(username, phone, password);
      return json({ user: { username: user.username, role: "user" } }, 201, sessionCookie(issueSession({ id: user.id, username: user.username, role: "user" })));
    }
    const user = await authenticate(username, password);
    return user ? json({ user: { username: user.username, role: user.role } }, 200, sessionCookie(issueSession(user))) : json({ error: "用户名或密码错误" }, 401);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "操作失败" }, 400); }
}
