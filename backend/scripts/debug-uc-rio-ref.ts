import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit, parseMoney, round2 } from "../src/parse/helpers.js";
import type { UploadedFile } from "../src/types.js";

function parseCsv(text: string) {
  return parse(text, { relax_column_count: true, skip_empty_lines: false }) as string[][];
}

function sumImportAmounts(csvPath: string) {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const amtCol = headers.findIndex((h) => h.includes("water") || h === "amount");
  let sum = 0;
  let count = 0;
  for (const row of rows.slice(1)) {
    const unit = (row[0] ?? "").trim();
    if (!unit || unit.toUpperCase() === "TOTAL") continue;
    const amt = Number(String(row[amtCol] ?? "").replace(/[$,]/g, ""));
    if (Number.isFinite(amt)) {
      sum += amt;
      count += 1;
    }
  }
  return { sum: round2(sum), count };
}

async function analyzeUC() {
  const ROOT = path.resolve("..", "utilitybillingjuly (3)", "UC");
  const files: UploadedFile[] = [
    { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
    { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
    { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "UC_July_2026_Billing_95pct.xlsx")) },
  ];
  const importPath = path.resolve("..", "utilitybillingjuly (3)", "Import", "UC_August_2026_Billing_95pct (1).csv");
  const importRows = parseCsv(fs.readFileSync(importPath, "utf8"));
  const target = 11144.21 * 0.95;
  const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
  const occupants = parseOccupantCount(requireFile(files, "occupantCount", "oc"));
  const rentRoll = parseRentRoll(requireFile(files, "rentRoll", "rr"));
  const roster = buildRoster(occupants, rentRoll);
  const prevMap = indexPrevious(prev);
  const prevByName = indexPreviousByName(prev);

  // Sum prev totals for units in import
  const importUnits = new Set<string>();
  let importPrevWeight = 0;
  let importAmountSum = 0;
  for (const row of importRows.slice(4)) {
    const unit = (row[1] ?? "").trim();
    if (!unit || unit === "TOTALS") continue;
    importUnits.add(unit);
    const total = Number(String(row[14] ?? "").replace(/[$,]/g, ""));
    if (Number.isFinite(total)) importAmountSum += total;
  }
  for (const unit of roster) {
    if (!importUnits.has(unit.displayUnit)) continue;
    const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    const prevTotal = p ? p.water + p.sewer || p.total : 0;
    importPrevWeight += prevTotal;
  }
  console.log("UC:", {
    target: round2(target),
    importAmountSum: round2(importAmountSum),
    importPrevWeight: round2(importPrevWeight),
    impliedRatio: round2(importAmountSum / importPrevWeight),
    refRatio: 1.1362,
    refWeight: round2(target / 1.1362),
  });

  // Check rent roll accounts
  const rr = parseRentRoll(requireFile(files, "rentRoll", "rr"));
  console.log("UC rent roll sample accounts:", rr.slice(0, 5).map((r) => ({ unit: r.unit, account: r.account })));
}

async function analyzeRio() {
  const importPath = path.resolve("..", "utilitybillingjuly (3)", "Import", "0728-RI354-WaterSewer_Combined (1).csv");
  const { sum, count } = sumImportAmounts(importPath);
  const target = 14329.34 * 0.95;
  console.log("Rio import:", { sum, count, target: round2(target), impliedRatioFromPrev12400: round2(target / 12400) });

  const ROOT = path.resolve("..", "utilitybillingjuly (3)", "RIO");
  const prev = parsePreviousBilling({
    field: "previousBilling",
    originalName: "pb.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: fs.readFileSync(path.join(ROOT, "RIO July.xlsx")),
  });
  let prevSum = 0;
  for (const p of prev) prevSum += p.water + p.sewer || p.total;
  console.log("Rio prev file sum:", round2(prevSum), "rows:", prev.length);

  // Compare unit 0120
  const importRows = parseCsv(fs.readFileSync(importPath, "utf8"));
  for (const row of importRows.slice(1)) {
    if ((row[0] ?? "").trim() === "0120") console.log("0120 import:", row);
  }
}

analyzeUC().then(analyzeRio);
