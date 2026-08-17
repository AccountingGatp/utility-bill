import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { deriveWsCapByOccupants, wsCapForOccupants, wsTotal } from "../src/billing/derived.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "Mila");
const oc = parseOccupantCount({
  field: "o",
  originalName: "o.xlsx",
  mimeType: "x",
  buffer: fs.readFileSync(path.join(ROOT, "Occupant Count (1).xlsx")),
});
const rr = parseRentRoll({
  field: "r",
  originalName: "r.xlsx",
  mimeType: "x",
  buffer: fs.readFileSync(path.join(ROOT, "Rent Roll (1).xlsx")),
});
const prev = parsePreviousBilling({
  field: "pb",
  originalName: "pb.xlsx",
  mimeType: "x",
  buffer: fs.readFileSync(path.join(ROOT, "Mila_July_2026_Utility_Billing.xlsx")),
});
const caps = deriveWsCapByOccupants(prev);
const roster = buildRoster(oc, rr);
const prevMap = indexPrevious(prev);
const prevByName = indexPreviousByName(prev);

for (const id of ["A3", "B1"]) {
  const u = roster.find((r) => r.displayUnit === id)!;
  const p = lookupPrevious(u.unit, u.displayUnit, u.resident, prevMap, prevByName);
  console.log(id, {
    resident: u.resident,
    occs: u.occupants,
    cap: wsCapForOccupants(caps, u.occupants),
    prev: p ? { unit: p.unit, resident: p.resident, ws: wsTotal(p), electric: p.electric, gas: p.gas } : null,
  });
}
console.log("caps map", Object.fromEntries(caps));
