import fs from "node:fs";
import path from "node:path";
import { readAllSheets, normalizeHeader } from "../src/parse/helpers.js";

const sheets = readAllSheets(
  fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "RIO", "RIO July.xlsx")),
  "RIO July.xlsx",
);
for (const sheet of sheets) {
  let headerAt = -1;
  for (let i = 0; i < sheet.rows.length; i++) {
    const headers = (sheet.rows[i] ?? []).map(normalizeHeader);
    if (headers.includes("unit") && headers.includes("total")) headerAt = i;
  }
  if (headerAt < 0) continue;
  const headers = (sheet.rows[headerAt] ?? []).map(normalizeHeader);
  console.log("Sheet", sheet.name, "headers", headers);
  const unitIdx = headers.indexOf("unit");
  const totalIdx = headers.indexOf("total");
  for (const row of sheet.rows.slice(headerAt + 1)) {
    const unit = String(row[unitIdx] ?? "").trim();
    if (unit === "0110" || unit === "0120") console.log(unit, row);
  }
}
