import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { parsePreviousBilling } from "../src/parse/inputs.js";
import { readAllSheets, parseNumber } from "../src/parse/helpers.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)");

function sumJulyTotals(file: string) {
  const prev = parsePreviousBilling({
    field: "pb",
    originalName: path.basename(file),
    mimeType: "x",
    buffer: fs.readFileSync(file),
  });
  let ws = 0;
  let total = 0;
  for (const p of prev) {
    ws += p.water + p.sewer;
    total += p.total;
  }
  return { rows: prev.length, ws, total };
}

console.log("Rio July:", sumJulyTotals(path.join(ROOT, "RIO", "RIO July.xlsx")));
console.log("UC July:", sumJulyTotals(path.join(ROOT, "UC", "UC_July_2026_Billing_95pct.xlsx")));

const rioImport = parse(fs.readFileSync(path.join(ROOT, "Import", "0728-RI354-WaterSewer_Combined (1).csv"), "utf8")) as string[][];
let importSum = 0;
for (const row of rioImport.slice(1)) {
  const unit = row[0]?.trim();
  if (!unit || unit === "TOTAL") continue;
  importSum += Number(row[4]?.replace(/[$,]/g, "") || 0);
}
console.log("Rio import sum:", importSum, "target/1.0187:", (14329.34 * 0.95) / 1.0187);

// Raw sheet totals for Rio
const sheets = readAllSheets(fs.readFileSync(path.join(ROOT, "RIO", "RIO July.xlsx")), "x");
for (const sheet of sheets) {
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i].map((c) => String(c ?? ""));
    if (row.some((c) => /ratio/i.test(c))) console.log("Rio ratio row", row);
    if (row.some((c) => /SAWS Bill/i.test(c))) console.log("Rio header", row);
  }
}
