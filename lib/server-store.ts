import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import officialDrawSeed from "../data/official-draws.seed.json";

export type ScoreItem = { index: number; category: string; answer: string; score: number; max: number };
type User = { id: string; username: string; phone: string; passwordHash: string; createdAt: string };
export type PredictionInput = { stream: string; region: string; noc: string; targeted: boolean };
export type PredictionResult = {
  next: number; month3: number; month6: number; month12: number;
  confidence: "低" | "中" | "高"; modelVersion: string; dataCutoff: string; generatedAt: string;
};
export type AdminPredictionInput = PredictionInput & { score: number };
export type AdminPredictionResult = PredictionResult & {
  predictedCutoff: { low: number; central: number; high: number };
  nextIta: { low: number; central: number; high: number };
  invitationVolume: { month3: number; month6: number; month12: number };
  sampleSize: number;
  basis: string[];
};
type AdminPredictionRun = { id: string; input: AdminPredictionInput; result: AdminPredictionResult; createdAt: string };
type Score = { userId: string; total: number; max: number; items: ScoreItem[]; updatedAt: string; version?: number };
type PredictionRun = { id: string; userId: string; scoreUpdatedAt: string; input: PredictionInput; result: PredictionResult };
export type DrawRecord = {
  id: string; year: number; drawDate: string; stream: string; itaCount: number;
  scoreCutoff: string; targeted: boolean; targetCategory: string; region: string;
  profilePeriod: string; officialNotes: string; sourceUrl: string;
  scoreMin: number | null; scoreMax: number | null; drawType: string;
};
type DrawImport = {
  id: string; importedAt: string; filename: string; mode: "upsert" | "replace";
  inputRows: number; inserted: number; updated: number; totalRows: number; itaTotal: number;
};
type Data = {
  users: User[]; scores: Score[]; predictions: PredictionRun[];
  adminPredictions?: AdminPredictionRun[];
  settings: { wechat: string; qr: string; consultationText?: string };
  draws: DrawRecord[]; drawImports: DrawImport[];
};

const dataDir = process.env.OINP_DATA_DIR || path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "oinp.json");
const seededDraws = () => structuredClone(officialDrawSeed.records) as DrawRecord[];
const emptyData = (): Data => ({ users: [], scores: [], predictions: [], adminPredictions: [], draws: seededDraws(), drawImports: [{
  id: "initial-official-import", importedAt: officialDrawSeed.metadata.importedAt,
  filename: officialDrawSeed.metadata.sourceFile, mode: "replace",
  inputRows: officialDrawSeed.records.length, inserted: officialDrawSeed.records.length, updated: 0,
  totalRows: officialDrawSeed.records.length, itaTotal: officialDrawSeed.records.reduce((sum, row) => sum + row.itaCount, 0),
}], settings: { wechat: "OINP-Consult", qr: "", consultationText: "扫码添加顾问，发送您的用户名" } });

async function load(): Promise<Data> {
  await mkdir(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(dataFile, "utf8")) as Data;
    parsed.predictions ||= [];
    parsed.adminPredictions ||= [];
    parsed.draws ||= seededDraws();
    parsed.drawImports ||= [];
    parsed.settings.consultationText ||= "扫码添加顾问，发送您的用户名";
    return parsed;
  }
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
  const previous = data.scores.find(s => s.userId === userId);
  const score = { userId, total, max, items, updatedAt: new Date().toISOString(), version: (previous?.version || 0) + 1 };
  const index = data.scores.findIndex(s => s.userId === userId);
  if (index >= 0) data.scores[index] = score; else data.scores.push(score);
  await save(data);
}

const clamp = (value: number) => Math.max(2, Math.min(96, Math.round(value)));
export function calculatePrediction(total: number, input: PredictionInput, draws: DrawRecord[]): PredictionResult {
  const streamNames: Record<string, string[]> = {
    employer: ["Employer Job Offer"], masters: ["Masters Graduate"], phd: ["PhD Graduate"],
    trades: ["Skilled Trades"], french: ["French-Speaking"], hcp: ["Human Capital Priorities"],
  };
  const regionNames: Record<string, string[]> = {
    north: ["Northern Ontario"], east: ["Eastern Ontario"], central: ["Central Ontario"],
    southwest: ["Southwestern Ontario"], gta: ["Greater Toronto Area"], toronto: ["Toronto"],
  };
  const streamMatches = streamNames[input.stream] || [];
  const regionMatches = regionNames[input.region] || [];
  let matches = draws.filter(row => streamMatches.some(name => row.stream.includes(name)) && row.scoreMin != null);
  const regional = matches.filter(row => !regionMatches.length || regionMatches.some(name => row.region.includes(name)));
  if (regional.length >= 2) matches = regional;
  if (input.targeted) {
    const targeted = matches.filter(row => row.targeted);
    if (targeted.length >= 2) matches = targeted;
  }
  matches = matches.sort((a, b) => b.drawDate.localeCompare(a.drawDate)).slice(0, 20);
  const qualifyingRate = matches.length ? matches.filter(row => total >= (row.scoreMin as number)).length / matches.length : .3;
  const margin = matches.length ? matches.reduce((sum, row) => sum + total - (row.scoreMin as number), 0) / matches.length : total - 65;
  const next = clamp(qualifyingRate * 70 + 15 + margin * .7);
  const cumulative = (draws: number) => clamp((1 - Math.pow(1 - next / 100, draws)) * 100);
  const cutoff = draws.map(row => row.drawDate).sort().at(-1) || "未知";
  return {
    next, month3: cumulative(2), month6: cumulative(4), month12: cumulative(7),
    confidence: matches.length >= 6 ? "中" : "低", modelVersion: "official-draw-history-1.1", dataCutoff: cutoff,
    generatedAt: new Date().toISOString(),
  };
}

export async function createPrediction(userId: string, input: PredictionInput) {
  const data = await load();
  const score = data.scores.find(s => s.userId === userId);
  if (!score) throw new Error("请先保存评分");
  const result = calculatePrediction(score.total, input, data.draws);
  const run: PredictionRun = { id: randomBytes(10).toString("hex"), userId, scoreUpdatedAt: score.updatedAt, input, result };
  data.predictions.push(run);
  await save(data);
  return { score, input, result };
}

function matchingDraws(input: PredictionInput, draws: DrawRecord[]) {
  const streamNames: Record<string, string[]> = {
    employer: ["Employer Job Offer"], masters: ["Masters Graduate"], phd: ["PhD Graduate"],
    trades: ["Skilled Trades"], french: ["French-Speaking"], hcp: ["Human Capital Priorities"],
  };
  const regionNames: Record<string, string[]> = {
    north: ["Northern Ontario"], east: ["Eastern Ontario"], central: ["Central Ontario"],
    southwest: ["Southwestern Ontario"], gta: ["Greater Toronto Area"], toronto: ["Toronto"],
  };
  const streamMatches = streamNames[input.stream] || [];
  const regionMatches = regionNames[input.region] || [];
  let rows = draws.filter(row => streamMatches.some(name => row.stream.includes(name)));
  const regional = rows.filter(row => regionMatches.some(name => row.region.includes(name)));
  if (regional.length >= 2) rows = regional;
  if (input.targeted) {
    const targeted = rows.filter(row => row.targeted);
    if (targeted.length >= 2) rows = targeted;
  }
  return rows.sort((a, b) => b.drawDate.localeCompare(a.drawDate)).slice(0, 24);
}

export async function createAdminPrediction(input: AdminPredictionInput) {
  const data = await load();
  const rows = matchingDraws(input, data.draws);
  const scoreRows = rows.filter(row => row.scoreMin != null);
  const weights = scoreRows.map((_, index) => Math.pow(.88, index));
  const weighted = (values: number[]) => {
    const denominator = weights.slice(0, values.length).reduce((sum, value) => sum + value, 0) || 1;
    return values.reduce((sum, value, index) => sum + value * weights[index], 0) / denominator;
  };
  const centralCutoff = Math.round(weighted(scoreRows.map(row => row.scoreMin as number)) || input.score);
  const deviations = scoreRows.map(row => Math.abs((row.scoreMin as number) - centralCutoff));
  const spread = Math.max(2, Math.round(weighted(deviations) || 4));
  const itaCentral = Math.max(0, Math.round(weighted(rows.map(row => row.itaCount)) || 0));
  const base = calculatePrediction(input.score, input, data.draws);
  const annualizedDraws = rows.length >= 2
    ? Math.max(1, Math.min(18, Math.round(rows.length * 365 / Math.max(30, (Date.parse(rows[0].drawDate) - Date.parse(rows.at(-1)!.drawDate)) / 86400000))))
    : 2;
  const volume = (months: number) => Math.round(itaCentral * annualizedDraws * months / 12);
  const result: AdminPredictionResult = {
    ...base,
    predictedCutoff: { low: centralCutoff - spread, central: centralCutoff, high: centralCutoff + spread },
    nextIta: { low: Math.round(itaCentral * .75), central: itaCentral, high: Math.round(itaCentral * 1.25) },
    invitationVolume: { month3: volume(3), month6: volume(6), month12: volume(12) },
    sampleSize: rows.length,
    confidence: rows.length >= 10 ? "中" : "低",
    modelVersion: "admin-official-draw-1.0",
    basis: [
      `匹配 ${rows.length} 次历史 Draw，其中 ${scoreRows.length} 次有可用分数线`,
      `近期样本按时间衰减加权，估计每年约 ${annualizedDraws} 次同类 Draw`,
      input.targeted ? "已优先使用定向邀请样本" : "使用该 Stream/地区的综合历史样本",
    ],
  };
  const run: AdminPredictionRun = { id: randomBytes(10).toString("hex"), input, result, createdAt: new Date().toISOString() };
  data.adminPredictions ||= [];
  data.adminPredictions.push(run);
  await save(data);
  return { input, result, recentRuns: data.adminPredictions.slice(-10).reverse() };
}

export async function getAdminPredictionHistory() {
  const data = await load();
  return { recentRuns: (data.adminPredictions || []).slice(-10).reverse(), drawDatabase: getDrawDatabaseSummary(data) };
}

export async function getMyData(userId: string) {
  const data = await load();
  const user = data.users.find(u => u.id === userId);
  if (!user) return null;
  return {
    user: { username: user.username, phone: user.phone.replace(/.(?=.{4})/g, "•"), createdAt: user.createdAt },
    score: data.scores.find(s => s.userId === userId) || null,
    predictions: data.predictions.filter(p => p.userId === userId).slice(-10).reverse(),
  };
}

export async function getAdminData() {
  const data = await load();
  return {
    customers: data.users.map(user => ({
      id: user.id, username: user.username, phone: user.phone, createdAt: user.createdAt,
      score: data.scores.find(s => s.userId === user.id) || null,
      predictions: data.predictions.filter(p => p.userId === user.id).slice(-5).reverse(),
    })),
    settings: data.settings,
    analytics: getAnalytics(data.draws),
    drawDatabase: getDrawDatabaseSummary(data),
  };
}

export async function getSettings() { return (await load()).settings; }
export async function updateSettings(settings: { wechat: string; qr: string; consultationText?: string }) {
  const data = await load(); data.settings = settings; await save(data); return settings;
}

const drawKey = (row: DrawRecord) => [row.drawDate, row.stream, row.targetCategory, row.region].join("|").toLowerCase();
export async function importDrawRecords(records: DrawRecord[], filename: string, mode: "upsert" | "replace") {
  const data = await load();
  let inserted = 0; let updated = 0;
  if (mode === "replace") {
    data.draws = records;
    inserted = records.length;
  } else {
    const index = new Map(data.draws.map((row, i) => [drawKey(row), i]));
    for (const record of records) {
      const existing = index.get(drawKey(record));
      if (existing == null) { data.draws.push(record); index.set(drawKey(record), data.draws.length - 1); inserted++; }
      else { data.draws[existing] = record; updated++; }
    }
  }
  const log: DrawImport = {
    id: randomBytes(10).toString("hex"), importedAt: new Date().toISOString(), filename, mode,
    inputRows: records.length, inserted, updated, totalRows: data.draws.length,
    itaTotal: data.draws.reduce((sum, row) => sum + row.itaCount, 0),
  };
  data.drawImports.push(log); await save(data); return { ...log, summary: getDrawDatabaseSummary(data), analytics: getAnalytics(data.draws) };
}

export async function exportDrawRecords() { return (await load()).draws; }

function getDrawDatabaseSummary(data: Data) {
  const years = [...new Set(data.draws.map(row => row.year))].sort();
  return {
    recordCount: data.draws.length,
    itaTotal: data.draws.reduce((sum, row) => sum + row.itaCount, 0),
    years,
    cutoffDate: data.draws.map(row => row.drawDate).sort().at(-1) || "",
    latestImport: data.drawImports.at(-1) || null,
    importHistory: data.drawImports.slice(-10).reverse(),
  };
}

export function getAnalytics(draws: DrawRecord[]) {
  const latestMonth = draws.map(row => row.drawDate.slice(0, 7)).sort().at(-1);
  const latestDate = new Date(`${latestMonth || new Date().toISOString().slice(0, 7)}-01T00:00:00Z`);
  const months = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() - (23 - index), 1));
    return date.toISOString().slice(0, 7);
  });
  const recentRows = draws.filter(row => months.includes(row.drawDate.slice(0, 7)));
  const regions = [...new Set(recentRows.map(row => row.region.trim()).filter(Boolean))].sort();
  const streams = [...new Set(recentRows.map(row => row.stream.trim()).filter(Boolean))].sort();
  const trendSeries = regions.flatMap(region => streams.map(stream => {
    const points = months.map(month => {
      const rows = recentRows.filter(row =>
        row.region.trim() === region && row.stream.trim() === stream &&
        row.drawDate.startsWith(month) && row.scoreMin != null
      );
      if (!rows.length) return null;
      const values = rows.map(row => row.scoreMin as number);
      return {
        month,
        score: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
        cutoff: [...new Set(rows.map(row => row.scoreCutoff).filter(Boolean))].join("；"),
        drawCount: rows.length,
      };
    }).filter((point): point is NonNullable<typeof point> => point != null);
    return { region, stream, points };
  })).filter(series => series.points.length);

  // Each database row represents one official region/stream allocation. Aggregate
  // those rows once by month, then expose the exact contributing stream totals.
  const heatmap = regions.map(region => {
    const streamRows = streams.map(stream => ({
      stream,
      values: months.map(month => recentRows
        .filter(row => row.region.trim() === region && row.stream.trim() === stream && row.drawDate.startsWith(month))
        .reduce((sum, row) => sum + row.itaCount, 0)),
    })).filter(row => row.values.some(Boolean));
    return {
      region,
      values: months.map((_, index) => streamRows.reduce((sum, row) => sum + row.values[index], 0)),
      streams: streamRows,
    };
  });
  const heatmapTotal = heatmap.reduce((total, row) => total + row.values.reduce((sum, value) => sum + value, 0), 0);
  const databaseRegionalTotal = recentRows.filter(row => row.region.trim()).reduce((sum, row) => sum + row.itaCount, 0);
  const cutoff = draws.map(row => row.drawDate).sort().at(-1) || "未知";
  return {
    months, regions, streams, trendSeries, heatmap,
    verification: { heatmapTotal, databaseRegionalTotal, matched: heatmapTotal === databaseRegionalTotal },
    sourceStatus: `正式 Draw 数据：${draws.length} 条，数据截止 ${cutoff}，图表由数据库实时计算`,
  };
}
