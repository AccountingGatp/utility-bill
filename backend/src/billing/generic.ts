import { csvFromAoA, xlsxFromAoA } from "../output.js";

import {

  filesByField,

  parseOccupantCount,

  parsePreviousBilling,

  parseRentRoll,

  parseSawsBills,

  requireFile,

} from "../parse/inputs.js";

import {

  buildRoster,

  indexPrevious,

  indexPreviousByName,

  lookupPrevious,

  padUnit,

} from "../parse/roster.js";

import {

  deriveWaterShare,

  scaleWeight,

  scaledPrevAmount,

  splitWaterSewer,

  wsTotal,

} from "./derived.js";

import {

  firstOfNextMonth,

  formatDate,

  formatProrPct,

  isBillableUnit,

  occupancyMultiplier,

  proration,

  round2,

} from "../parse/helpers.js";

import type { ProcessResult, RunOptions, UploadedFile } from "../types.js";



export async function processGeneric(

  propertyId: string,

  propertyName: string,

  files: UploadedFile[],

  options: RunOptions,

): Promise<ProcessResult> {

  const recapture = options.recaptureRate ?? 0.95;

  const occupants = parseOccupantCount(requireFile(files, "occupantCount", "Occupant Count"));

  const rentRoll = parseRentRoll(requireFile(files, "rentRoll", "Rent Roll"));

  const sawsFiles = filesByField(files, "sawsBill");

  if (sawsFiles.length === 0) throw new Error("Missing required file: SAWS bill.");

  const { combined: saws } = await parseSawsBills(sawsFiles);

  if (!saws.start || !saws.end) {

    throw new Error("Could not read service dates from the SAWS bill.");

  }

  const previousFile = filesByField(files, "previousBilling")[0];

  const previous = previousFile ? parsePreviousBilling(previousFile) : [];

  const prevMap = indexPrevious(previous);

  const prevByName = indexPreviousByName(previous);

  const waterShare = deriveWaterShare(previous);



  const roster = buildRoster(occupants, rentRoll);

  const target = round2(saws.total * recapture);

  const due = firstOfNextMonth(saws.end);

  const serviceMonth = saws.end.toLocaleString("en-US", { month: "long" });

  const serviceYear = saws.end.getFullYear();

  const fileMonth = due.toLocaleString("en-US", { month: "long" });

  const fileYear = due.getFullYear();

  const period = `${formatDate(saws.start)} – ${formatDate(saws.end)} (${saws.days} days)`;



  const prepared = roster.map((unit) => {

    const { days, ratio } = proration(unit.moveIn, unit.moveOut, saws.start!, saws.end!);

    const prev = lookupPrevious(unit.unit, unit.displayUnit, unit.resident, prevMap, prevByName);

    const prevTotal = prev ? wsTotal(prev) : 0;

    const prevWater = prev?.water ?? 0;

    const prevSewer = prev?.sewer ?? 0;

    const billable = isBillableUnit(unit.occupants, unit.resident, unit.displayUnit);

    const scaleBase = prev ? scaledPrevAmount(prev, unit.occupants) : 0;

    return {

      unit,

      days,

      ratio,

      prev,

      prevTotal,

      prevWater,

      prevSewer,

      scaleBase,

      billable,

    };

  });



  const weightSum = prepared.reduce((sum, row) => {

    if (!row.prev) return sum;

    return sum + scaleWeight(row.prev, row.unit.occupants, row.billable, row.ratio);

  }, 0);

  const scale = weightSum > 0 ? target / weightSum : 1;

  const billable = prepared.filter((row) => row.billable && row.ratio > 0);



  const billed = billable

    .map((row) => {

      let amount =

        row.scaleBase > 0

          ? row.scaleBase * scale * row.ratio

          : occupancyMultiplier(row.unit.occupants) * row.ratio;

      if (row.scaleBase <= 0 && weightSum > 0) {

        const occShare =

          occupancyMultiplier(row.unit.occupants) /

          Math.max(

            1,

            billable.reduce((sum, item) => sum + occupancyMultiplier(item.unit.occupants), 0),

          );

        amount = target * occShare * row.ratio;

      }

      const split = splitWaterSewer(amount, row.prevWater, row.prevSewer, waterShare);

      return {

        unit: propertyId === "rio-springs" ? padUnit(row.unit.displayUnit) : row.unit.displayUnit,

        type: row.unit.type,

        resident: row.unit.resident,

        account: row.unit.account || row.prev?.account || "",

        leaseStart: formatDate(row.unit.leaseStart ?? row.unit.moveIn),

        moveOut: formatDate(row.unit.moveOut),

        sqft: row.unit.sqft,

        occs: row.unit.occupants,

        mult: occupancyMultiplier(row.unit.occupants),

        days: row.days,

        pror: row.ratio,

        water: split.water,

        sewer: split.sewer,

        total: round2(split.water + split.sewer),

        moveIn: formatDate(row.unit.moveIn),

      };

    })

    .filter((row) => row.total > 0);



  const collected = round2(billed.reduce((sum, row) => sum + row.total, 0));



  let aoa: unknown[][];

  let sheetName = "Billing";

  let fileBase = `${propertyName.replace(/\s+/g, "_")}_${fileMonth}_${fileYear}_Billing`;



  if (propertyId === "rio-springs") {

    fileBase = `RIO_${fileMonth}_${fileYear}_WaterSewer_Combined`;

    sheetName = "Water+Sewer Combined";

    aoa = [

      [`Rio Springs Apartments — Water & Sewer Combined Billing | ${serviceMonth} ${serviceYear}`],

      [],

      ["Unit", "Resident", "Account #", "Occ", "Water + Sewer Total", "Notes"],

    ];

    billed.forEach((row) => {

      aoa.push([

        row.unit,

        row.resident,

        row.account,

        row.occs,

        row.total,

        row.pror < 1 && row.pror > 0 ? `Prorated (${row.days} days)` : "",

      ]);

    });

    aoa.push(["TOTAL", `${billed.length} units billed`, "", "", collected]);

  } else {

    fileBase = `UC_${fileMonth}_${fileYear}_Billing_95pct`;

    aoa = [

      [`${propertyName} — ${serviceMonth} ${serviceYear} Utility Billing`],

      [

        `SAWS Bill: $${saws.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}  |  Service: ${period}  |  Recapture: ${(recapture * 100).toFixed(0)}%  |  Ratio: ${scale.toFixed(4)}`,

      ],

      [],

      [

        "#",

        "Unit",

        "Type",

        "Resident",

        "Account #",

        "Lease Start",

        "Move Out",

        "Sqft",

        "Occs",

        "Mult",

        "Days",

        "Pror %",

        "Water",

        "Sewer",

        "Total",

      ],

    ];

    billed.forEach((row, index) => {

      aoa.push([

        index + 1,

        row.unit,

        row.type,

        row.resident,

        row.account,

        row.leaseStart,

        row.moveOut,

        row.sqft,

        row.occs,

        row.mult,

        row.days,

        formatProrPct(row.pror),

        row.water,

        row.sewer,

        row.total,

      ]);

    });

    aoa.push([

      "",

      "TOTALS",

      "",

      "",

      "",

      "",

      "",

      "",

      "",

      "",

      "",

      "",

      round2(billed.reduce((sum, row) => sum + row.water, 0)),

      round2(billed.reduce((sum, row) => sum + row.sewer, 0)),

      collected,

    ]);

  }



  const importRows = billed.map((row) => [

    row.unit,

    row.resident,

    row.account,

    row.occs,

    row.total,

    row.pror < 1 && row.pror > 0 ? `Prorated (${row.days} days)` : "",

  ]);



  return {

    files: [

      await xlsxFromAoA(`${fileBase}.xlsx`, [{ name: sheetName, rows: aoa }]),

      csvFromAoA(`${fileBase}.csv`, aoa),

      csvFromAoA(`${fileBase}_ResMan_Import.csv`, [

        ["Unit", "Resident", "Account #", "Occ", "Water + Sewer Total", "Notes"],

        ...importRows,

      ]),

    ],

    zipName: `${fileBase}.zip`,

    summary: {

      property: propertyName,

      sawsTotal: saws.total,

      collected,

      units: billed.length,

      ratio: round2(scale),

    },

  };

}


