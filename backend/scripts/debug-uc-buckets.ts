import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, parseSawsBills, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit, occupancyMultiplier, proration, round2 } from "../src/parse/helpers.js";
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
  const target = round2(saws.total * 0.95);
  const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));
  const roster = buildRoster(parseOccupantCount(requireFile(files, "occupantCount", "oc")), parseRentRoll(requireFile(files, "rentRoll", "rr")));
  const prevMap = indexPrevious(prev);
  const prevByName = indexPreviousByName(prev);

  const buckets: Record<string, number> = {};
  const add = (k: string, v: number) => { buckets[k] = (buckets[k] ?? 0) + v; };

  for (const unit of roster) {
    const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    if (!p) continue;
    const prevTotal = p.water + p.sewer || p.total;
    const { ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
    const bill = isBillableUnit(unit.occupants, unit.resident, unit.displayUnit);
    if (bill && ratio > 0) add("bill*ratio", prevTotal * ratio);
    if (bill && ratio > 0) add("bill*ratio*mult", prevTotal * ratio * occupancyMultiplier(unit.occupants));
    if (bill) add("billRaw", prevTotal);
    if (bill && ratio > 0) {
      const bases = p.total - (p.water + p.sewer);
      const ws = p.water + p.sewer;
      if (p.occupants > 0 && p.occupants !== unit.occupants && ws > 0) {
        const adj = (ws / occupancyMultiplier(p.occupants)) * occupancyMultiplier(unit.occupants) + bases;
        add("billAdj", adj * ratio);
      } else add("billTotal*ratio", p.total * ratio);
    }
    if (!bill && ratio > 0 && ratio < 1) add("vac*ratio", prevTotal * ratio);
    if (!bill && ratio > 0 && ratio < 1) add("vac*(1-ratio)", prevTotal * (1 - ratio));
  }

  console.log("target", target, "refWeight", round2(target / 1.1362));
  for (const [k, v] of Object.entries(buckets).sort((a, b) => Math.abs(target / a[1] - 1.1362) - Math.abs(target / b[1] - 1.1362))) {
    console.log(k, round2(v), "ratio", round2(target / v));
  }
}

main();
