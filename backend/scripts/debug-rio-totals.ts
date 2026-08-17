import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, parseSawsBills, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit } from "../src/parse/helpers.js";
import type { UploadedFile } from "../src/types.js";

async function main() {
  const ROOT = path.resolve("..", "utilitybillingjuly (3)", "RIO");
  const files: UploadedFile[] = [
    { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
    { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
    { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "RIO July.xlsx")) },
    { field: "sawsBill", originalName: "saws.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(ROOT, "RIO 557 SAWSeBill.pdf")) },
  ];
  const { combined: saws } = await parseSawsBills([requireFile(files, "sawsBill", "saws")]);
  const target = saws.total * 0.95;
  const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
  const roster = buildRoster(parseOccupantCount(requireFile(files, "occupantCount", "oc")), parseRentRoll(requireFile(files, "rentRoll", "rr")));
  const prevMap = indexPrevious(prev);
  const prevByName = indexPreviousByName(prev);

  let ws = 0, tot = 0, billWs = 0, billTot = 0, allTot = 0;
  for (const unit of roster) {
    const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    if (!p) continue;
    const w = p.water + p.sewer;
    const t = p.total || w;
    ws += w;
    tot += t;
    allTot += t;
    if (isBillableUnit(unit.occupants, unit.resident, unit.displayUnit)) {
      billWs += w;
      billTot += t;
    }
  }
  let fileTot = 0;
  for (const p of prev) fileTot += p.total || p.water + p.sewer;

  const u110 = lookupPrevious("110", "0110", "Jaucari James", prevMap, prevByName);
  console.log({
    target,
    refWeight: target / 1.0187,
    ws,
    tot,
    billWs,
    billTot,
    fileTot,
    scaleWs: target / ws,
    scaleTot: target / tot,
    scaleBillTot: target / billTot,
    u110,
    calcWs: u110 ? (u110.water + u110.sewer) * (target / ws) : null,
    calcTot: u110 ? u110.total * (target / tot) : null,
    calcBillTot: u110 ? u110.total * (target / billTot) : null,
  });
}

main();
