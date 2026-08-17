import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit, proration } from "../src/parse/helpers.js";
import { parseSawsBills } from "../src/parse/inputs.js";
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
  const target = 11144.21 * 0.95;
  const refWeight = target / 1.1362;
  const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
  const roster = buildRoster(parseOccupantCount(requireFile(files, "occupantCount", "oc")), parseRentRoll(requireFile(files, "rentRoll", "rr")));
  const prevMap = indexPrevious(prev);
  const prevByName = indexPreviousByName(prev);

  let all = 0, vacant = 0, noRatio = 0, billable = 0, billableRatio = 0;
  const vacantUnits: { unit: string; prev: number }[] = [];
  for (const unit of roster) {
    const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    const prevTotal = p ? p.water + p.sewer || p.total : 0;
    const { ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
    if (prevTotal > 0) all += prevTotal;
    if (prevTotal > 0 && !isBillableUnit(unit.occupants, unit.resident, unit.displayUnit)) {
      vacant += prevTotal;
      vacantUnits.push({ unit: unit.displayUnit, prev: prevTotal });
    }
    if (prevTotal > 0 && ratio <= 0) noRatio += prevTotal;
    if (prevTotal > 0 && isBillableUnit(unit.occupants, unit.resident, unit.displayUnit)) billable += prevTotal;
    if (prevTotal > 0 && isBillableUnit(unit.occupants, unit.resident, unit.displayUnit) && ratio > 0) billableRatio += prevTotal;
  }
  console.log({ target, refWeight, all, vacant, noRatio, billable, billableRatio, allMinusVacant: all - vacant });
  console.log("Top vacant prev:", vacantUnits.sort((a, b) => b.prev - a.prev).slice(0, 10));
}

main();
