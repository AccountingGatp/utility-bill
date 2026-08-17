import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const p = path.resolve("..", "utilitybillingjuly (3)", "Green oaks", "GO July_2026_Billing_FINAL (1).xlsx");
const wb = XLSX.read(fs.readFileSync(p));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
let headerAt = -1;
for (let i = 0; i < rows.length; i++) {
  const row = rows[i] as unknown[];
  if (row.some((c) => String(c).toLowerCase().includes("water/sewer"))) headerAt = i;
}
console.log("header row", headerAt, rows[headerAt]);
const header = (rows[headerAt] as string[]).map((h) => String(h).toLowerCase());
const unitIdx = header.findIndex((h) => h.includes("unit") || h === "#");
const wsIdx = header.findIndex((h) => h.includes("water"));
const occIdx = header.findIndex((h) => h.includes("occ"));
const totals: number[] = [];
for (const row of rows.slice(headerAt + 1)) {
  const r = row as unknown[];
  const unit = String(r[unitIdx > 0 ? unitIdx : 3] ?? "").trim();
  const amt = Number(String(r[wsIdx > 0 ? wsIdx : 8] ?? "").replace(/[$,]/g, ""));
  const occ = Number(r[occIdx > 0 ? occIdx : 5] ?? 0);
  if (unit && Number.isFinite(amt) && amt > 0 && amt < 200) totals.push(amt);
}
totals.sort((a, b) => a - b);
console.log("sample amounts", totals.slice(0, 10), "...", totals.slice(-5));
console.log("unique rounded", [...new Set(totals.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b).slice(0, 20));
