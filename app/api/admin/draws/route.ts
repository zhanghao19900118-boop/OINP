import { randomBytes } from "node:crypto";
import { exportDrawRecords, importDrawRecords, readSession, type DrawRecord } from "../../../../lib/server-store";

const isAdmin = (request: Request) => readSession(request.headers.get("cookie"))?.role === "admin";
const text = (value: unknown) => value == null ? "" : String(value).trim();
const numberOrNull = (value: unknown) => value == null || value === "" ? null : Number(value);
const dateValue = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const parseCsv = (input: string) => {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows;
};

export async function GET(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "无权访问" }, { status: 403 });
  const records = await exportDrawRecords();
  const headers = ["Draw Year","Draw Date","Stream","ITA Count","EOI Score Cutoff","Targeted?","Target Category / Occupation","Region","Profile Creation Period","Official Notes","Source URL","Score Min","Score Max","Draw Type"];
  const rows = records.map(row => [row.year,row.drawDate,row.stream,row.itaCount,row.scoreCutoff,row.targeted?"Yes":"No",row.targetCategory,row.region,row.profilePeriod,row.officialNotes,row.sourceUrl,row.scoreMin,row.scoreMax,row.drawType]);
  const csv = "\ufeff" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="oinp-draw-database-${new Date().toISOString().slice(0,10)}.csv"` } });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) return Response.json({ error: "无权访问" }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "replace" ? "replace" : "upsert";
  if (!(file instanceof File)) return Response.json({ error: "请选择 Excel 文件" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".csv")) return Response.json({ error: "仅支持从后台下载的 .csv 数据文件" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ error: "文件不能超过 8MB" }, { status: 400 });

  const rows = parseCsv((await file.text()).replace(/^\ufeff/, ""));
  const expected = ["Draw Year","Draw Date","Stream","ITA Count","EOI Score Cutoff","Targeted?","Target Category / Occupation","Region","Profile Creation Period","Official Notes","Source URL","Score Min","Score Max","Draw Type"];
  const actual = expected.map((_, index) => text(rows[0]?.[index]));
  if (expected.some((header, index) => actual[index] !== header)) {
    return Response.json({ error: "CSV 第1行字段不匹配，请先从后台下载当前数据并在其结构上更新", expected, actual }, { status: 400 });
  }

  const records: DrawRecord[] = [];
  const errors: string[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const rowNumber = rowIndex + 1;
    const row = rows[rowIndex] || [];
    if (!row[0] && !row[1] && !row[2]) continue;
    const record: DrawRecord = {
      id: randomBytes(10).toString("hex"), year: Number(row[0]),
      drawDate: dateValue(row[1]), stream: text(row[2]),
      itaCount: Number(row[3]), scoreCutoff: text(row[4]),
      targeted: text(row[5]).toLowerCase() === "yes",
      targetCategory: text(row[6]), region: text(row[7]),
      profilePeriod: text(row[8]), officialNotes: text(row[9]),
      sourceUrl: text(row[10]), scoreMin: numberOrNull(row[11]),
      scoreMax: numberOrNull(row[12]), drawType: text(row[13]),
    };
    if (!Number.isInteger(record.year) || !record.drawDate || !record.stream || !Number.isFinite(record.itaCount) || record.itaCount < 0) {
      errors.push(`第 ${rowNumber} 行：年份、日期、Stream 或 ITA 数量无效`);
    } else records.push(record);
  }
  if (errors.length) return Response.json({ error: "数据校验失败，未写入数据库", errors: errors.slice(0, 20) }, { status: 400 });
  if (!records.length) return Response.json({ error: "没有可导入的数据" }, { status: 400 });
  return Response.json(await importDrawRecords(records, file.name, mode));
}
