import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, parseSawsBills } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, lookupPrevious } from "../src/parse/roster.js";
import { firstOfNextMonth, isBillableUnit, proration, unitKey } from "../src/parse/helpers.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "VALENCIA");
const oc = parseOccupantCount({ field: "o", originalName: "o", mimeType: "x", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) });
const rr = parseRentRoll({ field: "r", originalName: "r", mimeType: "x", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) });
const prev = parsePreviousBilling({ field: "pb", originalName: "pb", mimeType: "x", buffer: fs.readFileSync(path.join(ROOT, "Valencia_July_2026_Billing.xlsx")) });
const prevMap = indexPrevious(prev);
const files = ["VALENCIA 022 SAWSeBill.pdf", "VALENCIA 161 SAWSeBill.pdf"].map((name) => ({
  field: "sawsBill",
  originalName: name,
  mimeType: "application/pdf",
  buffer: fs.readFileSync(path.join(ROOT, name)),
}));
const { combined: saws } = await parseSawsBills(files);
const due = firstOfNextMonth(saws.end!);
const roster = buildRoster(oc, rr);

for (const unit of roster) {
  const { ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
  if (ratio > 0 || !unit.moveIn || unit.moveIn <= saws.end!) continue;
  if (!isBillableUnit(unit.occupants, unit.resident, unit.displayUnit)) continue;
  if (unit.moveIn > due) continue;
  const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, new Map());
  console.log(unit.displayUnit, unit.resident, "inPrev", Boolean(p), "moveIn", unit.moveIn.toISOString().slice(0, 10));
}
