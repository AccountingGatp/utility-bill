import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, parseSawsBills, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit, occupancyMultiplier, proration, round2 } from "../src/parse/helpers.js";
import { scaleWeight, scaledPrevAmount } from "../src/billing/derived.js";
import type { UploadedFile } from "../src/types.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "UC");
const files: UploadedFile[] = [
  { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
  { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
  { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "UC_July_2026_Billing_95pct.xlsx")) },
  { field: "sawsBill", originalName: "saws.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(ROOT, "UC 125 SAWSeBill.pdf")) },
];

async function main() {
  const { combined: saws } = await parseSawsBills([requireFile(files, "sawsBill", "saws")]);
  const target = round2(saws.total * 0.95);
  const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
  const roster = buildRoster(parseOccupantCount(requireFile(files, "occupantCount", "oc")), parseRentRoll(requireFile(files, "rentRoll", "rr")));
  const prevMap = indexPrevious(prev);
  const prevByName = indexPreviousByName(prev);

  const importRows = parse(fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "Import", "UC_August_2026_Billing_95pct (1).csv"), "utf8"), { relax_column_count: true }) as string[][];

  // Back-calculate implied weight from import: weight = amount / scale / ratio
  // Try scale = 1.1362
  const refScale = 1.1362;
  let impliedWeight = 0;
  for (const row of importRows.slice(4)) {
    const unit = String(row[1] ?? "").trim();
    if (!unit || unit === "TOTALS") continue;
    const amount = Number(String(row[14] ?? "").replace(/[$,]/g, ""));
    const u = roster.find((r) => r.displayUnit === unit);
    if (!u) continue;
    const { ratio } = proration(u.moveIn, u.moveOut, saws.start!, saws.end!);
    if (ratio <= 0) continue;
    impliedWeight += amount / refScale / ratio;
  }
  console.log("Implied weight from import at scale 1.1362:", round2(impliedWeight));

  const formulas: Record<string, number> = {};
  for (const unit of roster) {
    const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    if (!p) continue;
    const prevTotal = p.water + p.sewer || p.total;
    const { ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
    const bill = isBillableUnit(unit.occupants, unit.resident, unit.displayUnit);
    const w1 = bill ? prevTotal : prevTotal * (1 - ratio);
    const w2 = scaleWeight(p, unit.occupants, bill, ratio);
    const w3 = scaledPrevAmount(p, unit.occupants) * (bill ? 1 : 1 - ratio);
    const w4 = scaledPrevAmount(p, unit.occupants) * ratio;
    const w5 = bill && ratio > 0 ? scaledPrevAmount(p, unit.occupants) : bill ? scaledPrevAmount(p, unit.occupants) : scaledPrevAmount(p, unit.occupants) * (1 - ratio);
    formulas.w1 = (formulas.w1 ?? 0) + w1;
    formulas.w2 = (formulas.w2 ?? 0) + w2;
    formulas.w3 = (formulas.w3 ?? 0) + w3;
    formulas.w4 = (formulas.w4 ?? 0) + w4;
    formulas.w5 = (formulas.w5 ?? 0) + w5;
  }
  console.log("Weight formulas:", Object.fromEntries(Object.entries(formulas).map(([k, v]) => [k, round2(v), round2(target / v)])));
}

main();
