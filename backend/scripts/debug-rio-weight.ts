import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit } from "../src/parse/helpers.js";
import type { UploadedFile } from "../src/types.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "RIO");
const files: UploadedFile[] = [
  { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
  { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
  { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "RIO July.xlsx")) },
];
const target = 14329.34 * 0.95;
const occupants = parseOccupantCount(requireFile(files, "occupantCount", "oc"));
const rentRoll = parseRentRoll(requireFile(files, "rentRoll", "rr"));
const previous = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
const prevMap = indexPrevious(previous);
const prevByName = indexPreviousByName(previous);
const roster = buildRoster(occupants, rentRoll);
let all = 0, bill = 0, prevOnly = 0;
for (const unit of roster) {
  const prev = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
  const prevTotal = prev ? prev.water + prev.sewer || prev.total : 0;
  if (prevTotal > 0) all += prevTotal;
  if (isBillableUnit(unit.occupants, unit.resident, unit.displayUnit) && prevTotal > 0) bill += prevTotal;
}
for (const p of previous) prevOnly += p.water + p.sewer || p.total;
console.log({ target, all, bill, prevOnly, ratioAll: target/all, ratioBill: target/bill, refRatio: 1.0187, refWeight: target/1.0187 });
