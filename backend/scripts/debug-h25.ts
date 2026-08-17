import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parseRentRoll } from "../src/parse/inputs.js";
import { buildRoster } from "../src/parse/roster.js";
import { isBillableUnit } from "../src/parse/helpers.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "VALENCIA");
const oc = parseOccupantCount({
  field: "o",
  originalName: "o.xlsx",
  mimeType: "x",
  buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")),
});
const rr = parseRentRoll({
  field: "r",
  originalName: "r.xls",
  mimeType: "x",
  buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")),
});
const h25oc = oc.filter((r) => /H-?25/i.test(r.unit));
console.log("H-25 occupant rows", h25oc);
const roster = buildRoster(oc, rr);
const h25 = roster.filter((r) => /H-?25/i.test(r.displayUnit));
console.log("H-25 roster", h25);
for (const u of h25) {
  console.log("billable", isBillableUnit(u.occupants, u.resident, u.displayUnit));
}
