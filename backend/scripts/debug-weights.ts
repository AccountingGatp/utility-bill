import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, parseSawsBills, requireFile } from "../src/parse/inputs.js";
import { buildRoster, indexPrevious, indexPreviousByName, lookupPrevious } from "../src/parse/roster.js";
import { isBillableUnit, proration } from "../src/parse/helpers.js";
import type { UploadedFile } from "../src/types.js";

async function weight(property: string, recapture: number, refRatio: number) {
  const ROOT = path.resolve("..", "utilitybillingjuly (3)", property);
  const files: Record<string, string> =
    property === "UC"
      ? {
          oc: "Occupant Count.xlsx",
          rr: "Rent Roll.xls",
          pb: "UC_July_2026_Billing_95pct.xlsx",
          saws: "UC 125 SAWSeBill.pdf",
        }
      : {
          oc: "Occupant Count.xlsx",
          rr: "Rent Roll.xls",
          pb: "RIO July.xlsx",
          saws: "RIO 557 SAWSeBill.pdf",
        };

  const uploaded = (field: string, name: string) => ({
    field,
    originalName: name,
    mimeType: name.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: fs.readFileSync(path.join(ROOT, name)),
  });
  const { combined: saws } = await parseSawsBills([uploaded("sawsBill", files.saws)]);
  const target = saws.total * recapture;
  const prev = parsePreviousBilling(uploaded("previousBilling", files.pb));
  const roster = buildRoster(
    parseOccupantCount(uploaded("occupantCount", files.oc)),
    parseRentRoll(uploaded("rentRoll", files.rr)),
  );
  const prevMap = indexPrevious(prev);
  const prevByName = indexPreviousByName(prev);

  const buckets = {
    all: 0,
    billable: 0,
    billableRatio: 0,
    billableNoRatio: 0,
    vacantRatio: 0,
    prevFile: 0,
    importUnits: 0,
  };
  for (const p of prev) buckets.prevFile += p.water + p.sewer || p.total;
  for (const unit of roster) {
    const p = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    const prevTotal = p ? p.water + p.sewer || p.total : 0;
    const { ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
    const billable = isBillableUnit(unit.occupants, unit.resident, unit.displayUnit);
    if (prevTotal > 0) buckets.all += prevTotal;
    if (billable && prevTotal > 0) buckets.billable += prevTotal;
    if (billable && prevTotal > 0 && ratio > 0) buckets.billableRatio += prevTotal;
    if (billable && prevTotal > 0 && ratio <= 0) buckets.billableNoRatio += prevTotal;
    if (!billable && prevTotal > 0 && ratio > 0) buckets.vacantRatio += prevTotal;
  }
  console.log(property, {
    target,
    refWeight: target / refRatio,
    ...buckets,
    ratios: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, typeof v === "number" && k !== "importUnits" ? (target / v).toFixed(4) : v]),
    ),
  });
}

await weight("UC", 0.95, 1.1362);
await weight("RIO", 0.95, 1.0187);
