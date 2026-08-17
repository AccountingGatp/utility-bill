import ExcelJS from "exceljs";

import { csvFromAoA } from "../output.js";
import {
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
  padUnit,
} from "../parse/roster.js";
import {
  deriveSizeCaps,
  deriveStdUsage,
  isSmallFloorplan,
  wsTotal,
} from "./derived.js";
import {
  firstOfNextMonth,
  formatDate,
  occupancyMultiplier,
  proration,
  round2,
  unitKey,
} from "../parse/helpers.js";
import type {
  OccupantRow,
  OutputFile,
  ProcessResult,
  RentRollRow,
  RosterUnit,
  RunOptions,
  UploadedFile,
} from "../types.js";

const TEMPLATE_HEADERS = [
  "#",
  "Name",
  "Account #",
  "Unit",
  "Move In",
  "Occs",
  "Mult",
  "Renewal Date",
  "Water/Sewer",
  "",
  "",
  "",
  "",
  "",
  "",
  "Credit Builder",
  "Discount",
  "Employee Discount",
  "Employee Unit Rent Credit",
  "Month to Month Fee",
  "Parking",
  "Pest from Community",
  "Pet Fee",
  "Pet Rent",
  "Rent",
  "Trash from Community",
  "Vacant Electric",
  "Vacant Service Fee",
  "Service Fee",
  "Credits",
  "Curr Balance",
  "Prop Balance",
  "Total",
];

function cycleLabel(start: Date, end: Date) {
  const fmt = (d: Date) =>
    `${d.toLocaleString("en-US", { month: "short" }).toUpperCase()} ${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
  return `${fmt(start)} - ${fmt(end)}`;
}

function isVacantName(name: string) {
  const n = name.trim().toLowerCase();
  return !n || n === "vacant" || n === "vacant unit" || n.startsWith("vacant ");
}

function countNames(name: string) {
  return name
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !isVacantName(part)).length;
}

function isRealUnit(unit: string, occupants: number) {
  if (occupants > 20) return false;
  const key = unitKey(unit);
  return /^\d+[A-Z]?$/.test(key);
}

function inCycle(date: Date | null, start: Date, end: Date) {
  if (!date) return false;
  const value = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const from = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const to = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return value >= from && value <= to;
}

function sameHousehold(current: string, previous: string) {
  if (!current || !previous) return false;
  const normalize = (value: string) =>
    value
      .replace(/\*/g, "")
      .toLowerCase()
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .sort()
      .join("|");
  const a = normalize(current);
  const b = normalize(previous);
  if (a === b) return true;
  const first = current
    .replace(/\*/g, "")
    .split(",")[0]
    ?.trim()
    .toLowerCase()
    .slice(0, 8);
  return Boolean(first && previous.replace(/\*/g, "").toLowerCase().includes(first));
}

function floorplanCap(type: string, sqft: number, sizeCaps: { small: number; large: number }) {
  const unit = { type, sqft } as RosterUnit;
  if (isSmallFloorplan(unit)) return sizeCaps.small || sizeCaps.large;
  return sizeCaps.large || sizeCaps.small;
}

type BilledRow = {
  name: string;
  account: string;
  unit: string;
  moveIn: string;
  occs: number;
  mult: number;
  renewal: string;
  amount: number;
  days: number;
  ratio: number;
  cap: number;
  newMoveIn: boolean;
};

export async function processGreenOaks(
  files: UploadedFile[],
  options: RunOptions,
): Promise<ProcessResult> {
  const increase = (options.increasePercent ?? 10) / 100;
  const occupantCount = parseOccupantCount(requireFile(files, "occupantCount", "Occupant Count"));
  const rentRoll = parseRentRoll(requireFile(files, "rentRoll", "Rent Roll"));
  const saws = await parseSawsBill(requireFile(files, "sawsBill", "SAWS bill"));
  const previous = parsePreviousBilling(
    requireFile(files, "previousBilling", "Previous month billing file"),
  );
  if (!saws.start || !saws.end) {
    throw new Error("Could not read service dates from the SAWS bill.");
  }

  const rollByUnit = new Map<string, RentRollRow>();
  for (const row of rentRoll) rollByUnit.set(unitKey(row.unit), row);
  const occByUnit = new Map<string, OccupantRow>();
  for (const row of occupantCount) occByUnit.set(unitKey(row.unit), row);
  const prevMap = indexPrevious(previous);
  const prevByName = indexPreviousByName(previous);
  const roster = buildRoster(occupantCount, rentRoll);
  const sizeCaps = deriveSizeCaps(previous, roster);
  const bases = sizeCaps.bases;
  const stdUsage = deriveStdUsage(previous, bases, 1);
  const due = firstOfNextMonth(saws.end);
  const billed: BilledRow[] = [];

  const keys = new Set([...occByUnit.keys(), ...rollByUnit.keys()]);
  const ordered = [...keys].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

  for (const key of ordered) {
    const occ = occByUnit.get(key);
    const roll = rollByUnit.get(key);
    const displayUnit = occ?.unit || roll?.unit || key;
    if (!isRealUnit(displayUnit, occ?.occupants ?? 0)) continue;

    const type = roll?.type ?? "";
    const sqft = occ?.sqft || roll?.sqft || 0;
    const cap = floorplanCap(type, sqft, sizeCaps);
    const occName = occ?.resident?.trim() ?? "";
    const rollName = roll?.resident?.trim() ?? "";
    const hasCurrent = !isVacantName(occName) && (occ?.occupants ?? 0) > 0;
    const rollResident = !isVacantName(rollName) ? rollName : "";
    const prev = lookupPrevious(key, displayUnit, rollResident || occName, prevMap, prevByName);

    let name = "";
    let displayOccs = occ?.occupants ?? 0;
    let rateOccs = displayOccs;
    let moveIn = roll?.moveIn ?? occ?.leaseStart ?? null;
    let moveOut = roll?.moveOut ?? null;

    if (hasCurrent) {
      name = occName;
      displayOccs = occ!.occupants;
      rateOccs = occ!.occupants;
    } else if (rollResident && (moveOut || /ntv/i.test(roll?.status ?? ""))) {
      const { ratio } = proration(roll?.moveIn ?? prev?.moveIn ?? null, moveOut, saws.start, saws.end);
      if (ratio <= 0) continue;
      name = rollResident;
      displayOccs = occ?.occupants ?? 0;
      rateOccs = prev?.occupants || countNames(rollResident);
      moveIn = roll?.moveIn ?? prev?.moveIn ?? null;
    } else {
      continue;
    }

    const { days, ratio } = proration(moveIn, moveOut, saws.start, saws.end);
    if (ratio <= 0) continue;

    const prevCombined = prev ? wsTotal(prev) : 0;
    const prevUsage = prev?.combinedIncludesBases ? Math.max(0, prevCombined - bases) : prevCombined;
    const prevWasPartial = Boolean(prev?.moveIn);
    const canAnchor =
      prevUsage > 0 &&
      !prevWasPartial &&
      sameHousehold(name, prev?.resident ?? "");

    let usage = cap;
    if (canAnchor) {
      usage = Math.min(cap, prevUsage * (1 + increase));
    } else if (rateOccs <= 1 && stdUsage > 0) {
      usage = Math.min(cap, stdUsage * (1 + increase));
    }

    const amount = round2((usage + bases) * ratio);
    if (amount <= 0) continue;

    billed.push({
      name,
      account: roll?.account ?? "",
      unit: padUnit(displayUnit),
      moveIn: inCycle(moveIn, saws.start, saws.end) ? formatDate(moveIn) : "",
      occs: displayOccs,
      mult: occupancyMultiplier(displayOccs),
      renewal: "",
      amount,
      days,
      ratio,
      cap,
      newMoveIn: inCycle(moveIn, saws.start, saws.end),
    });
  }

  const extraBlanks = Array.from({ length: TEMPLATE_HEADERS.length - 9 }, () => "");
  const month = due.toLocaleString("en-US", { month: "long" });
  const year = due.getFullYear();
  const collected = round2(billed.reduce((sum, row) => sum + row.amount, 0));
  const aoa: unknown[][] = [
    [`SUMMARY OF UTILITIES BILLED QC | ${month} ${year} | Achieve Properties | Green Oaks at Medical`],
    TEMPLATE_HEADERS,
    ["", "Service Cycle", "", "", "", "", "", "", cycleLabel(saws.start, saws.end)],
    ["", "", "", "", "", "", "", "", cycleLabel(saws.start, saws.end).replaceAll("/", "")],
    [`Green Oaks at Medical (sv048) - Due: ${formatDate(due)}`],
  ];

  billed.forEach((row, index) => {
    aoa.push([
      index + 1,
      row.name,
      row.account,
      row.unit,
      row.moveIn,
      row.occs,
      row.mult,
      row.renewal,
      row.amount,
      ...extraBlanks.slice(0, extraBlanks.length - 1),
      row.amount,
    ]);
  });
  aoa.push(["TOTALS", "", "", "", "", "", "", "", collected, ...extraBlanks.slice(0, extraBlanks.length - 1), collected]);

  const prefix = `GO ${month}_${year}_Billing_FINAL`;
  const importRows = billed.map((row) => [
    row.unit,
    row.name,
    "Water/Sewer",
    row.amount,
    formatDate(due),
    `${formatDate(saws.start)} - ${formatDate(saws.end)} utility bill-back`,
  ]);

  return {
    files: [
      await xlsxGreenOaks(`${prefix}.xlsx`, aoa, billed, sizeCaps.small),
      csvFromAoA(`${prefix}.csv`, aoa),
      csvFromAoA(`GO_${month}_${year}_ResMan_Import.csv`, [
        ["Unit", "Resident", "Charge Code", "Amount", "Charge Date", "Memo"],
        ...importRows,
      ]),
    ],
    zipName: `${prefix}.zip`,
    summary: {
      property: "Green Oaks at Medical",
      sawsTotal: saws.total,
      collected,
      units: billed.length,
      absorbed: round2(saws.total - collected),
      recoveryPct: round2((collected / saws.total) * 100),
    },
  };
}

async function xlsxGreenOaks(
  filename: string,
  rows: unknown[][],
  billed: BilledRow[],
  smallCap: number,
): Promise<OutputFile> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Summary of Utilities Billed");
  for (const row of rows) {
    sheet.addRow(row as ExcelJS.CellValue[]);
  }

  sheet.mergeCells(1, 1, 1, 12);
  sheet.getCell(1, 1).font = { bold: true, size: 12 };
  const header = sheet.getRow(2);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF305496" },
    };
  });

  const green: ExcelJS.FillPattern = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFC6EFCE" },
  };
  const orange: ExcelJS.FillPattern = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFCD5B4" },
  };
  const blue: ExcelJS.FillPattern = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFBDD7EE" },
  };

  billed.forEach((row, index) => {
    const excelRow = sheet.getRow(6 + index);
    const amountCell = excelRow.getCell(9);
    const totalCell = excelRow.getCell(33);
    amountCell.numFmt = "#,##0.00";
    totalCell.numFmt = "#,##0.00";
    const fill = row.ratio < 1 ? blue : row.cap === smallCap ? green : orange;
    amountCell.fill = fill;
    totalCell.value = row.amount;
  });

  const totalRowIndex = 6 + billed.length;
  const totalRow = sheet.getRow(totalRowIndex);
  totalRow.getCell(9).numFmt = "#,##0.00";
  totalRow.getCell(33).numFmt = "#,##0.00";
  totalRow.font = { bold: true };
  if (billed.length) {
    const last = totalRowIndex - 1;
    totalRow.getCell(9).value = { formula: `SUM(I6:I${last})`, result: billed.reduce((s, r) => s + r.amount, 0) };
    totalRow.getCell(33).value = { formula: `SUM(AG6:AG${last})`, result: billed.reduce((s, r) => s + r.amount, 0) };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(arrayBuffer),
  };
}
