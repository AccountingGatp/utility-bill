import fs from "node:fs";
import path from "node:path";
import { readAllSheets, normalizeHeader } from "../src/parse/helpers.js";

const sheets = readAllSheets(
  fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "UC", "UC_July_2026_Billing_95pct.xlsx")),
  "x",
);
for (const sheet of sheets) {
  for (let i = 0; i < sheet.rows.length; i++) {
    const headers = (sheet.rows[i] ?? []).map(normalizeHeader);
    if (headers.includes("unit") && headers.includes("water")) {
      console.log("Sheet", sheet.name, headers);
      const unitIdx = headers.indexOf("unit");
      for (const row of sheet.rows.slice(i + 1, i + 20)) {
        if (String(row[unitIdx]) === "101") console.log("101", row);
      }
    }
  }
}
