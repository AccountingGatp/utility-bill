import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit, occupancyMultiplier, proration, round2 } from "../src/parse/helpers.js";
import type { UploadedFile } from "../src/types.js";

function prevWeight(
  prev: { water: number; sewer: number; total: number; occupants: number },
  currentOcc: number,
) {
  const bases = prev.total - (prev.water + prev.sewer);
  const prevMult = occupancyMultiplier(prev.occupants || currentOcc);
  const curMult = occupancyMultiplier(currentOcc);
  if (prev.occupants > 0 && prev.occupants !== currentOcc) {
    return ((prev.water + prev.sewer) / prevMult) * curMult + bases;
  }
  return prev.total || prev.water + prev.sewer;
}

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "RIO");
const files: UploadedFile[] = [
  { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
  { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
  { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "RIO July.xlsx")) },
];
const target = 14329.34 * 0.95;
const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
const roster = buildRoster(parseOccupantCount(requireFile(files, "occupantCount", "oc")), parseRentRoll(requireFile(files, "rentRoll", "rr")));
const prevMap = indexPrevious(prev);
const prevByName = indexPreviousByName(prev);

let rawWs = 0, rawTot = 0, adj = 0, adjBill = 0;
for (const unit of roster) {
  const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
  if (!p) continue;
  const w = prevWeight(p, unit.occupants);
  rawWs += p.water + p.sewer;
  rawTot += p.total;
  adj += w;
  if (isBillableUnit(unit.occupants, unit.resident, unit.displayUnit)) adjBill += w;
}

const scale = target / adjBill;
for (const id of ["0110", "0120", "0123"]) {
  const u = roster.find((r) => r.displayUnit === id);
  const p = u && lookupPrevious(u.unit, u.displayUnit, u.resident, prevMap, prevByName);
  if (p && u) {
    const w = prevWeight(p, u.occupants);
    console.log(id, { w, scaled: round2(w * scale), expected: id === "0110" || id === "0120" ? 60.38 : 95.41 });
  }
}
console.log({ target, rawWs, rawTot, adj, adjBill, scale, refScale: 1.0187 });
