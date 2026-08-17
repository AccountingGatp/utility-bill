import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parseRentRoll, parseSawsBills } from "../src/parse/inputs.js";
import { buildRoster } from "../src/parse/roster.js";
import { billingProration, firstOfNextMonth, isBillableUnit } from "../src/parse/helpers.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "VALENCIA");
const oc = parseOccupantCount({ field: "o", originalName: "o", mimeType: "x", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) });
const rr = parseRentRoll({ field: "r", originalName: "r", mimeType: "x", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) });
const files = ["VALENCIA 022 SAWSeBill.pdf", "VALENCIA 161 SAWSeBill.pdf"].map((name) => ({
  field: "sawsBill",
  originalName: name,
  mimeType: "application/pdf",
  buffer: fs.readFileSync(path.join(ROOT, name)),
}));
const { combined: saws } = await parseSawsBills(files);
const due = firstOfNextMonth(saws.end!);
const roster = buildRoster(oc, rr);
let postCycle = 0;
for (const unit of roster) {
  const base = billingProration(unit.moveIn, unit.moveOut, saws.start!, saws.end!, due);
  const plain = unit.moveIn && unit.moveIn > saws.end! ? 0 : 1;
  if (base.ratio > 0 && unit.moveIn && unit.moveIn > saws.end! && isBillableUnit(unit.occupants, unit.resident, unit.displayUnit)) {
    postCycle += 1;
    if (postCycle <= 5) console.log("post-cycle bill", unit.displayUnit, unit.resident, unit.moveIn);
  }
}
console.log("post-cycle billable count", postCycle);
