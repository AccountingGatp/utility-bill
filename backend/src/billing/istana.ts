import { csvFromAoA, xlsxFromAoA } from "../output.js";
import {
  filesByField,
  parseOccupantCount,
  parsePreviousBilling,
  parseRentRoll,
  parseSawsBill,
  requireFile,
} from "../parse/inputs.js";
import {
  buildRoster,
  indexPrevious,
  indexPreviousByName,
  lookupPrevious,
  occupantAverages,
} from "../parse/roster.js";
import { deriveWaterShare, splitWaterSewer, wsTotal } from "./derived.js";
import {
  firstOfNextMonth,
  formatDate,
  occupancyMultiplier,
  proration,
  round2,
} from "../parse/helpers.js";
import type { ProcessResult, RunOptions, UploadedFile } from "../types.js";

export async function processIstana(
  files: UploadedFile[],
  options: RunOptions,
): Promise<ProcessResult> {
  const recapture = options.recaptureRate ?? 0.95;
  const occupants = parseOccupantCount(requireFile(files, "occupantCount", "Occupant Count"));
  const rentRoll = parseRentRoll(requireFile(files, "rentRoll", "Rent Roll"));
  const domestic = await parseSawsBill(requireFile(files, "sawsDomestic", "SAWS domestic bill"));
  const irrigationFile = filesByField(files, "sawsIrrigation")[0];
  const irrigation = irrigationFile ? await parseSawsBill(irrigationFile) : null;
  const previous = parsePreviousBilling(
    requireFile(files, "previousBilling", "Previous month billing file"),
  );
  if (!domestic.start || !domestic.end) {
    throw new Error("Could not read service dates from the domestic SAWS bill.");
  }

  const roster = buildRoster(occupants, rentRoll);
  const prevMap = indexPrevious(previous);
  const prevByName = indexPreviousByName(previous);
  const averages = occupantAverages(previous);
  const waterShare = deriveWaterShare(previous);
  const target = round2(domestic.total * recapture);

  const withPrev = roster.map((unit) => {
    const prev = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    const prevWater = prev?.water ?? 0;
    const prevSewer = prev?.sewer ?? 0;
    const prevTotal = prevWater + prevSewer || prev?.total || 0;
    return { unit, prev, prevWater, prevSewer, prevTotal };
  });

  const occupied = withPrev.filter((row) => row.unit.resident && row.unit.occupants > 0);
  const baselineSum = occupied.reduce(
    (sum, row) => sum + (row.prevTotal > 0 ? row.prevTotal : 0),
    0,
  );
  const ratio = baselineSum > 0 ? target / baselineSum : 1;
  const due = firstOfNextMonth(domestic.end);

  const drafted = occupied.map((row) => {
    const { days, ratio: pror } = proration(
      row.unit.moveIn,
      row.unit.moveOut,
      domestic.start!,
      domestic.end!,
    );
    let flag = "";
    let newWater = 0;
    let newSewer = 0;
    if (pror <= 0) {
      flag = "Post-Period — No Charge";
    } else if (row.prevTotal > 0) {
      const amount = row.prevTotal * ratio * pror;
      const split = splitWaterSewer(amount, row.prevWater, row.prevSewer, waterShare);
      newWater = split.water;
      newSewer = split.sewer;
      if (pror < 1) flag = "New Move-In";
    } else {
      const avg = averages.get(row.unit.occupants) ?? averages.get(1);
      const fallback = avg?.total ?? target / Math.max(1, roster.length);
      const split = splitWaterSewer(fallback * ratio * pror, avg?.water ?? 0, avg?.sewer ?? 0, waterShare);
      newWater = split.water;
      newSewer = split.sewer;
      flag = pror < 1 ? "New Move-In — Formerly Vacant" : "Zero-Usage Adjusted";
    }
    return {
      unit: row.unit.displayUnit,
      resident: row.unit.resident || "VACANT",
      moveIn: formatDate(row.unit.moveIn),
      occ: row.unit.occupants,
      mult: occupancyMultiplier(row.unit.occupants),
      days,
      pror,
      prevWater: round2(row.prevWater),
      prevSewer: round2(row.prevSewer),
      prevTotal: round2(row.prevTotal),
      newWater: round2(newWater),
      newSewer: round2(newSewer),
      newTotal: round2(newWater + newSewer),
      flag,
    };
  });

  const rawCollected = drafted.reduce((sum, row) => sum + row.newTotal, 0);
  const hit = rawCollected > 0 ? target / rawCollected : 1;
  const billed = drafted.map((row) => {
    const newWater = round2(row.newWater * hit);
    const newSewer = round2(row.newSewer * hit);
    return { ...row, newWater, newSewer, newTotal: round2(newWater + newSewer) };
  });

  const collected = round2(billed.reduce((sum, row) => sum + row.newTotal, 0));
  const month = due.toLocaleString("en-US", { month: "long" });
  const year = due.getFullYear();
  const period = `${formatDate(domestic.start)} – ${formatDate(domestic.end)} (${domestic.days} days)`;

  const aoa: unknown[][] = [
    [`ISTANA AT WURZBACH — ${month} ${year} Utility Billing`],
    [`SAWS Service Period: ${period}  |  Property absorbs irrigation ($${(irrigation?.total ?? 0).toFixed(2)})`],
    ["Summary"],
    ["SAWS Domestic ($)", domestic.total, "", "Base Ratio (auto)", ratio],
    ["Recapture Rate", recapture, "", "Actual Collected ($)", collected],
    ["Service Period Days", domestic.days, "", "Avg per Resident ($)", billed.length ? collected / billed.length : 0],
    ["Target Recovery ($)", target, "", "Effective Recapture", domestic.total ? collected / domestic.total : 0],
    [],
    [],
    ["#", "Unit", "Resident", "Move-In", "Occ", "Mult", "Days", "Proration", "Prev Water $", "Prev Sewer $", "Prev Total", "New Water $", "New Sewer $", "New Total $"],
  ];
  billed.forEach((row, index) => {
    aoa.push([
      index + 1,
      row.unit,
      row.resident,
      row.moveIn,
      row.occ,
      row.mult,
      row.days,
      round2(row.pror),
      row.prevWater,
      row.prevSewer,
      row.prevTotal,
      row.newWater,
      row.newSewer,
      row.newTotal,
    ]);
  });
  aoa.push([]);
  aoa.push(["COLOUR LEGEND"]);
  aoa.push(["", "New Move-In", "Moved in mid-cycle; had a prior reading, prorated"]);
  aoa.push(["", "New Move-In — Formerly Vacant", "Moved in mid-cycle, unit was vacant"]);
  aoa.push(["", "Zero-Usage Adjusted", "Full-month resident with $0 prior reading"]);
  aoa.push(["", "Post-Period — No Charge", "Moved in after the SAWS service period ended"]);

  const importRows = billed
    .filter((row) => row.newTotal > 0)
    .map((row) => [
      row.unit,
      row.resident,
      "Water/Sewer",
      row.newTotal,
      formatDate(due),
      `${formatDate(domestic.start)} - ${formatDate(domestic.end)} utility bill-back`,
    ]);

  const prefix = `Istana_${month}_${year}_Water_Bill`;
  return {
    files: [
      await xlsxFromAoA(`${prefix}.xlsx`, [{ name: `${month} ${year} Final Bill`, rows: aoa }]),
      csvFromAoA(`${prefix}.csv`, aoa),
      csvFromAoA(`${prefix}_ResMan_Import.csv`, [
        ["Unit", "Resident", "Charge Code", "Amount", "Charge Date", "Memo"],
        ...importRows,
      ]),
    ],
    zipName: `${prefix}.zip`,
    summary: {
      property: "Istana at Wurzbach",
      sawsDomestic: domestic.total,
      irrigation: irrigation?.total ?? 0,
      target,
      collected,
      units: importRows.length,
    },
  };
}
