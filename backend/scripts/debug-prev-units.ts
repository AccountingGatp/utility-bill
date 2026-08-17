import fs from "node:fs";
import path from "node:path";

import { parsePreviousBilling, requireFile } from "../src/parse/inputs.js";
import { readAllSheets } from "../src/parse/helpers.js";
import type { UploadedFile } from "../src/types.js";

function findUnit(rows: unknown[][], unit: string) {
  for (const sheet of rows) {
    for (const row of sheet.rows) {
      const text = row.map((c) => String(c ?? "")).join("|");
      if (text.includes(unit)) console.log(sheet.name, row);
    }
  }
}

const ROOT = path.resolve("..", "utilitybillingjuly (3)");
const rioPrev: UploadedFile = {
  field: "previousBilling",
  originalName: "pb.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  buffer: fs.readFileSync(path.join(ROOT, "RIO", "RIO July.xlsx")),
};
const parsed = parsePreviousBilling(rioPrev);
for (const p of parsed) {
  if (p.unit === "120" || p.unit === "0120" || p.unit.includes("120")) {
    console.log("Rio prev parsed:", p);
  }
}

const ucPrev: UploadedFile = {
  field: "previousBilling",
  originalName: "pb.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  buffer: fs.readFileSync(path.join(ROOT, "UC", "UC_July_2026_Billing_95pct.xlsx")),
};
const ucParsed = parsePreviousBilling(ucPrev);
console.log("UC 101:", ucParsed.find((p) => p.unit === "101"));

const ucSheets = readAllSheets(ucPrev.buffer, ucPrev.originalName);
console.log("UC sheets:", ucSheets.map((s) => s.name));
const headerRow = ucSheets[0]?.rows.find((r) => String(r[1] ?? "").trim() === "Unit");
console.log("UC header:", headerRow);

const ocSheets = readAllSheets(fs.readFileSync(path.join(ROOT, "UC", "Occupant Count.xlsx")), "oc.xlsx");
for (const sheet of ocSheets) {
  for (const row of sheet.rows) {
    if (String(row[0] ?? "").includes("101") || String(row[1] ?? "").includes("101")) {
      if (String(row).includes("40311748") || String(row).includes("Timothy")) console.log("UC OC:", sheet.name, row);
    }
  }
}
