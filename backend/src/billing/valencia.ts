import { csvFromAoA, xlsxFromAoA } from "../output.js";
import {
  filesByField,
  parseOccupantCount,
  parsePreviousBilling,
  parseRentRoll,
  parseSawsBills,
  requireFile,
} from "../parse/inputs.js";
import { buildRoster } from "../parse/roster.js";
import { bedroomTier, deriveBases, deriveCapsByTier, postCycleFullMonth } from "./derived.js";
import {
  applyCap,
  firstOfNextMonth,
  formatDate,
  isBillableUnit,
  occupancyMultiplier,
  proration,
  round2,
} from "../parse/helpers.js";
import type { ProcessResult, RunOptions, UploadedFile } from "../types.js";

export async function processValencia(
  propertyName: string,
  files: UploadedFile[],
  options: RunOptions,
): Promise<ProcessResult> {
  const recapture = options.recaptureRate ?? 0.65;
  const occupants = parseOccupantCount(requireFile(files, "occupantCount", "Occupant Count"));
  const rentRoll = parseRentRoll(requireFile(files, "rentRoll", "Rent Roll"));
  const previous = parsePreviousBilling(requireFile(files, "previousBilling", "Previous month billing file"));
  const sawsFiles = filesByField(files, "sawsBill");
  if (sawsFiles.length === 0) throw new Error("Missing required file: SAWS bill.");
  const { combined: saws } = await parseSawsBills(sawsFiles);
  if (!saws.start || !saws.end) {
    throw new Error("Could not read service dates from the SAWS bill.");
  }

  const roster = buildRoster(occupants, rentRoll);
  const capsByTier = deriveCapsByTier(previous, roster);
  const bases = deriveBases(previous, roster);
  const target = round2(saws.total * recapture);
  const due = firstOfNextMonth(saws.end);

  const prepared = roster.map((unit) => {
    let { days, ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
    const postCycle = postCycleFullMonth(unit.moveIn, saws.end!, due);
    if (postCycle != null && isBillableUnit(unit.occupants, unit.resident, unit.displayUnit)) {
      ratio = postCycle;
      days = saws.days;
    }
    const mult = occupancyMultiplier(unit.occupants);
    const effMult = mult * ratio;
    const br = bedroomTier(unit);
    const cap = capsByTier.get(br) ?? 0;
    return {
      unit,
      days,
      ratio,
      mult,
      effMult,
      br,
      cap,
      plan: unit.type || `${br}BR`,
      billable: isBillableUnit(unit.occupants, unit.resident, unit.displayUnit) && ratio > 0,
    };
  });

  const billable = prepared.filter((row) => row.billable);
  const effMultSum = billable.reduce((sum, row) => sum + row.effMult, 0) || 1;
  const perMultRate = target / effMultSum;

  const billed = billable
    .map((row) => {
      const raw = row.effMult * perMultRate + bases;
      const total = row.cap > 0 ? applyCap(raw, row.cap + bases) : round2(raw);
      return {
        unit: row.unit.displayUnit,
        resident: row.unit.resident,
        plan: row.plan,
        br: row.br,
        cap: row.cap,
        moveIn: formatDate(row.unit.moveIn),
        occs: row.unit.occupants,
        mult: row.mult,
        days: row.days,
        pror: row.ratio,
        total,
      };
    })
    .filter((row) => row.total > 0);

  const collected = round2(billed.reduce((sum, row) => sum + row.total, 0));
  const month = due.toLocaleString("en-US", { month: "long" });
  const year = due.getFullYear();
  const period = `${formatDate(saws.start)} – ${formatDate(saws.end)} (${saws.days} days)`;

  const aoa: unknown[][] = [
    [`Valencia at Medical — ${month} ${year} Utility Billing`],
    [`Service period: ${period}`],
    ["#", "Resident", "Unit", "Plan", "BR", "Cap $", "Move In", "Occs", "Mult", "Days", "Prorate %", "Water & Sewer"],
  ];
  billed.forEach((row, index) => {
    aoa.push([
      index + 1,
      row.resident,
      row.unit,
      row.plan,
      row.br,
      row.cap,
      row.moveIn,
      row.occs,
      row.mult,
      row.days,
      round2(row.pror),
      row.total,
    ]);
  });

  const fileBase = `Valencia_${month}_${year}_Billing`;
  const importRows = billed.map((row) => [
    propertyName,
    row.unit,
    row.resident,
    "WTR",
    "Water & Sewer",
    row.total,
    formatDate(due),
  ]);

  return {
    files: [
      await xlsxFromAoA(`${fileBase}.xlsx`, [{ name: `${month} Billing`, rows: aoa }]),
      csvFromAoA(`${fileBase}.csv`, aoa),
      csvFromAoA(`${fileBase}_ResMan_Import.csv`, [
        ["Property", "Unit", "Resident", "Charge Code", "Description", "Amount", "Charge Date"],
        ...importRows,
      ]),
    ],
    zipName: `${fileBase}.zip`,
    summary: {
      property: propertyName,
      sawsTotal: saws.total,
      collected,
      units: billed.length,
      perMultRate: round2(perMultRate),
      bases,
    },
  };
}
