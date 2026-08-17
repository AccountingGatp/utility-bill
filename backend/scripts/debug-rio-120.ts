import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit, proration, round2 } from "../src/parse/helpers.js";
import { parseSawsBills } from "../src/parse/inputs.js";
import type { UploadedFile } from "../src/types.js";

async function rioUnit120() {
  const ROOT = path.resolve("..", "utilitybillingjuly (3)", "RIO");
  const files: UploadedFile[] = [
    { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
    { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
    { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "RIO July.xlsx")) },
    { field: "sawsBill", originalName: "saws.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(ROOT, "RIO 557 SAWSeBill.pdf")) },
  ];
  const { combined: saws } = await parseSawsBills([files[3]]);
  const prev = parsePreviousBilling(files[4] ?? files[3]); // wrong
}

async function main() {
  const ROOT = path.resolve("..", "utilitybillingjuly (3)", "RIO");
  const files: UploadedFile[] = [
    { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
    { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
    { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "RIO July.xlsx")) },
    { field: "sawsBill", originalName: "saws.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(ROOT, "RIO 557 SAWSeBill.pdf")) },
  ];
  const { combined: saws } = await parseSawsBills([requireFile(files, "sawsBill", "saws")]);
  const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
  const prevMap = indexPrevious(prev);
  const prevByName = indexPreviousByName(prev);
  const roster = buildRoster(parseOccupantCount(requireFile(files, "occupantCount", "oc")), parseRentRoll(requireFile(files, "rentRoll", "rr")));
  const target = round2(saws.total * 0.95);

  let allWeight = 0;
  let billWeight = 0;
  let julyFileSum = 0;
  for (const p of prev) julyFileSum += p.water + p.sewer || p.total;

  for (const unit of roster) {
    const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    const prevTotal = p ? p.water + p.sewer || p.total : 0;
    const { ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
    if (prevTotal > 0) allWeight += prevTotal;
    if (prevTotal > 0 && isBillableUnit(unit.occupants, unit.resident, unit.displayUnit) && ratio > 0) billWeight += prevTotal;
    if (unit.displayUnit === "120" || unit.displayUnit === "0120") {
      console.log("Unit 120:", { unit: unit.displayUnit, resident: unit.resident, prevTotal, ratio, occ: unit.occupants, moveIn: unit.moveIn });
    }
  }
  console.log({ target, julyFileSum, allWeight, billWeight, scaleAll: target / allWeight, scaleBill: target / billWeight });
}

main();
