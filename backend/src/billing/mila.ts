import { csvFromAoA, xlsxFromAoA } from "../output.js";
import {
  filesByField,
  parseOccupantCount,
  parsePreviousBilling,
  parseRentRoll,
  parseSawsBills,
  parseUtilityTotal,
  requireFile,
} from "../parse/inputs.js";
import {
  buildRoster,
  indexPrevious,
  indexPreviousByName,
  lookupPrevious,
} from "../parse/roster.js";
import {
  deriveUtilityCapByOccupants,
  deriveWsCapByOccupants,
  milaUtilityOccTier,
  wsCapForOccupants,
} from "./derived.js";
import { applyCap, chargeDateDay28, formatDate, proration, round2 } from "../parse/helpers.js";
import type { ProcessResult, RunOptions, UploadedFile } from "../types.js";

export async function processMila(
  files: UploadedFile[],
  options: RunOptions,
): Promise<ProcessResult> {
  const recapture = options.recaptureRate ?? 0.95;
  const occupants = parseOccupantCount(requireFile(files, "occupantCount", "Occupant Count"));
  const rentRoll = parseRentRoll(requireFile(files, "rentRoll", "Rent Roll"));
  const sawsFiles = filesByField(files, "sawsBill");
  if (sawsFiles.length === 0) throw new Error("Missing required file: SAWS bill(s).");
  const { combined: saws } = await parseSawsBills(sawsFiles);
  if (!saws.start || !saws.end) {
    throw new Error("Could not read service dates from the SAWS bill.");
  }

  const previousFile = filesByField(files, "previousBilling")[0];
  const previous = previousFile ? parsePreviousBilling(previousFile) : [];
  const wsCaps = deriveWsCapByOccupants(previous);
  const electricCaps = deriveUtilityCapByOccupants(previous, "electric");
  const gasCaps = deriveUtilityCapByOccupants(previous, "gas");
  const maxWsCap = wsCaps.size > 0 ? Math.max(...wsCaps.values()) : 0;
  const prevMap = indexPrevious(previous);
  const prevByName = indexPreviousByName(previous);
  const gasFile = filesByField(files, "gasBill")[0];
  const electricFile = filesByField(files, "electricBill")[0];
  const gasTotal = gasFile ? await parseUtilityTotal(gasFile) : null;
  const electricTotal = electricFile ? await parseUtilityTotal(electricFile) : null;

  const roster = buildRoster(occupants, rentRoll);
  const due = chargeDateDay28(saws.end);
  const prepared = roster.map((unit) => {
    const { days, ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);
    const prev = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);
    return { unit, days, ratio, prev };
  });

  const occupied = prepared.filter((row) => row.unit.resident && row.unit.occupants > 0 && row.ratio > 0);
  const prorSum = occupied.reduce((sum, row) => sum + row.ratio, 0) || 1;

  const billed = prepared.map((row) => {
    const vacant = !row.unit.resident || row.unit.occupants <= 0 || row.ratio <= 0;
    let ws = 0;
    let electric = 0;
    let gas = 0;
    let note = "";

    if (vacant) {
      note = row.ratio <= 0 && row.unit.resident ? "Moved in after billing period" : "Vacant";
    } else {
      const wsTier = wsCapForOccupants(wsCaps, row.unit.occupants);
      const utilityOcc = milaUtilityOccTier(row.unit.occupants);
      const electricTier = wsCapForOccupants(electricCaps, utilityOcc);
      const gasTier = wsCapForOccupants(gasCaps, utilityOcc);
      const prevWs = row.prev ? row.prev.water + row.prev.sewer || row.prev.total : 0;
      const partialPrev = prevWs > 0 && wsTier > 0 && prevWs < wsTier - 0.01;

      if (partialPrev || prevWs <= 0) {
        ws = wsTier;
        electric = electricTier;
        gas = gasTier;
      } else {
        ws = prevWs;
        electric = row.prev?.electric ?? 0;
        gas = row.prev?.gas ?? 0;
      }

      if (maxWsCap > 0) ws = applyCap(ws, maxWsCap);
      ws *= row.ratio < 1 ? row.ratio : 1;
      electric *= row.ratio < 1 ? row.ratio : 1;
      gas *= row.ratio < 1 ? row.ratio : 1;

      if (electric <= 0 && electricTotal != null) {
        electric = (row.ratio / prorSum) * electricTotal * recapture;
      }
      if (gas <= 0 && gasTotal != null) {
        gas = (row.ratio / prorSum) * gasTotal * recapture;
      }

      if (row.ratio < 1) note = "Prorated new move-in";
      if (maxWsCap > 0 && ws >= maxWsCap - 0.01) {
        note = note || `Water/Sewer capped at $${maxWsCap.toFixed(2)}`;
      }
    }

    return {
      unit: row.unit.displayUnit,
      resident: row.unit.resident || "VACANT",
      moveIn: formatDate(row.unit.moveIn),
      sqft: row.unit.sqft,
      occ: row.unit.occupants,
      days: row.days,
      pror: row.ratio,
      ws: round2(ws),
      electric: round2(electric),
      gas: round2(gas),
      total: round2(ws + electric + gas),
      note,
    };
  });

  const month = due.toLocaleString("en-US", { month: "long" });
  const year = due.getFullYear();
  const period = `${formatDate(saws.start)} – ${formatDate(saws.end)} (${saws.days} days)`;
  const utilitySource =
    electricFile || gasFile ? "current bills when prior month missing" : "prior month reused";
  const aoa: unknown[][] = [
    [`MILA APARTMENTS — ${month} ${year} UTILITY BILLING`],
    [`Service Period: ${period}  |  W/S: Last Month +0%  |  Electric/Gas: ${utilitySource}`],
    [],
    ["#", "Unit", "Resident", "Move In", "Sq Ft", "Occ", "Days", "Pro %", "Water+Sewer", "Electric", "Gas", "TOTAL", "Notes"],
  ];
  billed.forEach((row, index) => {
    aoa.push([
      index + 1,
      row.unit,
      row.resident,
      row.moveIn,
      row.sqft,
      row.occ,
      row.days,
      row.pror,
      row.ws,
      row.electric,
      row.gas,
      row.total,
      row.note,
    ]);
  });
  aoa.push([]);
  aoa.push(["LEGEND"]);
  aoa.push(["", "Prorated new move-in"]);
  if (maxWsCap > 0) aoa.push(["", `Water/Sewer capped at $${maxWsCap.toFixed(2)}`]);
  aoa.push(["", "Vacant or moved in after billing period"]);

  const memo = `${formatDate(saws.start)} - ${formatDate(saws.end)} utility bill-back`;
  const importRows = billed.flatMap((row) =>
    [
      ["Water/Sewer", row.ws],
      ["Electric", row.electric],
      ["Gas", row.gas],
    ]
      .filter((line) => Number(line[1]) > 0)
      .map(([code, amount]) => [row.unit, row.resident, code, amount, formatDate(due), memo]),
  );

  const prefix = `Mila_${month.slice(0, 3)}_${year}_Utility_Billing`;
  return {
    files: [
      await xlsxFromAoA(`${prefix}.xlsx`, [{ name: `${month.slice(0, 3)}${year}_FinalBill`, rows: aoa }]),
      csvFromAoA(`${prefix}.csv`, aoa),
      csvFromAoA(`${prefix}_ResMan_Import.csv`, [
        ["Unit", "Resident", "Charge Code", "Amount", "Charge Date", "Memo"],
        ...importRows,
      ]),
    ],
    zipName: `${prefix}.zip`,
    summary: {
      property: "Mila Apartments",
      sawsTotal: saws.total,
      collected: round2(billed.reduce((sum, row) => sum + row.total, 0)),
      units: billed.filter((row) => row.total > 0).length,
    },
  };
}
