import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, parseSawsBills, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit, proration } from "../src/parse/helpers.js";
import type { UploadedFile } from "../src/types.js";

async function main() {
  const ROOT = path.resolve("..", "utilitybillingjuly (3)", "UC");
  const files: UploadedFile[] = [
    { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
    { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
    { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "UC_July_2026_Billing_95pct.xlsx")) },
    { field: "sawsBill", originalName: "saws.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(ROOT, "UC 125 SAWSeBill.pdf")) },
  ];
  const { combined: saws } = await parseSawsBills([requireFile(files, "sawsBill", "saws")]);
  const target = 11144.21 * 0.95;
  const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
  const roster = buildRoster(parseOccupantCount(requireFile(files, "occupantCount", "oc")), parseRentRoll(requireFile(files, "rentRoll", "rr")));
  const prevMap = indexPrevious(prev);
  const prevByName = indexPreviousByName(prev);

  let w1 = 0; // billable + vac*(1-ratio)
  let w2 = 0; // billableRatio + billableNoRatio + vac*(1-ratio)
  for (const unit of roster) {
    const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    const prevTotal = p ? p.water + p.sewer || p.total : 0;
    if (prevTotal <= 0) continue;
    const { ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
    const bill = isBillableUnit(unit.occupants, unit.resident, unit.displayUnit);
    if (bill) w1 += prevTotal;
    else w1 += prevTotal * (1 - ratio);
    if (bill && ratio > 0) w2 += prevTotal;
    else if (bill) w2 += prevTotal;
    else w2 += prevTotal * (1 - ratio);
  }
  console.log({ target, refW: target / 1.1362, w1, w2, r1: target / w1, r2: target / w2 });
}

main();
