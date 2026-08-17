import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { parsePreviousBilling } from "../src/parse/inputs.js";
import { indexPrevious, lookupPrevious } from "../src/parse/roster.js";

const importRows = parse(
  fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "Import", "UC_August_2026_Billing_95pct (1).csv"), "utf8"),
  { relax_column_count: true },
) as string[][];
const prev = parsePreviousBilling({
  field: "pb",
  originalName: "x",
  mimeType: "x",
  buffer: fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "UC", "UC_July_2026_Billing_95pct.xlsx")),
});
const prevMap = indexPrevious(prev);
let ws = 0, tot = 0, importAmt = 0;
for (const row of importRows.slice(4)) {
  const unit = String(row[1] ?? "").trim();
  if (!unit || unit === "TOTALS") continue;
  const p = lookupPrevious(unit, unit, String(row[3] ?? ""), prevMap, new Map());
  const w = p ? p.water + p.sewer || p.total : 0;
  ws += w;
  tot += p?.total ?? w;
  importAmt += Number(String(row[14] ?? "").replace(/[$,]/g, "") || 0);
}
const target = 11144.21 * 0.95;
console.log({ ws, tot, importAmt, target, ratioWs: target / ws, ratioTot: target / tot, refRatio: 1.1362 });
