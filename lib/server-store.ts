import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type ScoreItem = { index: number; category: string; answer: string; score: number; max: number };
type User = { id: string; username: string; phone: string; passwordHash: string; createdAt: string };
type Score = { userId: string; total: number; max: number; items: ScoreItem[]; updatedAt: string };
type Data = { users: User[]; scores: Score[]; settings: { wechat: string; qr: string } };

const dataDir = process.env.OINP_DATA_DIR || path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "oinp.json");
const emptyData = (): Data => ({ users: [], scores: [], settings: { wechat: "OINP-Consult", qr: "" } });

async function load(): Promise<Data> {
  await mkdir(dataDir, { recursive: true });
  try { return JSON.parse(await readFile(dataFile, "utf8")) as Data; }
  catch { const data = emptyData(); await save(data); return data; }
}

async function save(data: Data) {
  await mkdir(dataDir, { recursive: true });
  const temp = `${dataFile}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(temp, dataFile);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const secret = () => process.env.SESSION_SECRET || "";
export function issueSession(payload: { id: string; username: string; role: "user" | "admin" }) {
  if (!secret()) throw new Error("SESSION_SECRET is not configured");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 86400000 })).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}

export function readSession(cookieHeader: string | null) {
  try {
    const token = cookieHeader?.match(/(?:^|;\s*)oinp_session=([^;]+)/)?.[1];
    if (!token || !secret()) return null;
    const [body, signature] = token.split(".");
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    if (!signature || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const value = JSON.parse(Buffer.from(body, "base64url").toString());
    return value.exp > Date.now() ? value as { id: string; username: string; role: "user" | "admin"; exp: number } : null;
  } catch { return null; }
}

export const sessionCookie = (token: string) =>
  `oinp_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
export const clearSessionCookie = () =>
  `oinp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;

export async function registerUser(username: string, phone: string, password: string) {
  const data = await load();
  if (data.users.some(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error("用户名已被使用");
  if (data.users.some(u => u.phone === phone)) throw new Error("该手机号已注册");
  const user: User = { id: randomBytes(12).toString("hex"), username, phone, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
  data.users.push(user); await save(data); return user;
}

export async function authenticate(username: string, password: string) {
  if (username === process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD)
    return { id: "admin", username, role: "admin" as const };
  const data = await load();
  const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  return user && verifyPassword(password, user.passwordHash) ? { id: user.id, username: user.username, role: "user" as const } : null;
}

export async function saveScore(userId: string, total: number, max: number, items: ScoreItem[]) {
  const data = await load();
  const score = { userId, total, max, items, updatedAt: new Date().toISOString() };
  const index = data.scores.findIndex(s => s.userId === userId);
  if (index >= 0) data.scores[index] = score; else data.scores.push(score);
  await save(data);
}

export async function getAdminData() {
  const data = await load();
  return {
    customers: data.users.map(({ passwordHash: _, ...user }) => ({ ...user, score: data.scores.find(s => s.userId === user.id) || null })),
    settings: data.settings,
  };
}

export async function getSettings() { return (await load()).settings; }
export async function updateSettings(settings: { wechat: string; qr: string }) {
  const data = await load(); data.settings = settings; await save(data); return settings;
}
