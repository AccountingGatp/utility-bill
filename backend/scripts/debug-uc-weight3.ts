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

  let billable = 0;
  let billablePlusVacPror = 0;
  let allMinusVacFull = 0;
  for (const unit of roster) {
    const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    const prevTotal = p ? p.water + p.sewer || p.total : 0;
    const { ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
    const bill = isBillableUnit(unit.occupants, unit.resident, unit.displayUnit);
    if (bill && prevTotal > 0) billable += prevTotal;
    if (prevTotal > 0) {
      if (bill) billablePlusVacPror += prevTotal;
      else billablePlusVacPror += prevTotal * ratio;
      if (bill || ratio < 1) allMinusVacFull += prevTotal;
    }
  }
  console.log({
    target,
    refWeight: target / 1.1362,
    billable,
    billablePlusVacPror,
    allMinusVacFull,
    r1: target / billable,
    r2: target / billablePlusVacPror,
    r3: target / allMinusVacFull,
  });
}

main();
