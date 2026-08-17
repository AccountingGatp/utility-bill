import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { unitKey } from "../src/parse/helpers.js";
import type { UploadedFile } from "../src/types.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "UC");
const files: UploadedFile[] = [
  { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
  { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
  { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "UC_July_2026_Billing_95pct.xlsx")) },
];
const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
const roster = buildRoster(parseOccupantCount(requireFile(files, "occupantCount", "oc")), parseRentRoll(requireFile(files, "rentRoll", "rr")));
const rosterKeys = new Set(roster.map((u) => unitKey(u.displayUnit)));
let orphan = 0;
for (const p of prev) {
  if (!rosterKeys.has(unitKey(p.unit))) orphan += p.water + p.sewer || p.total;
}
console.log({ orphan, refDelta: 81 });
