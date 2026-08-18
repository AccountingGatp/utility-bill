import "./pdf-dom-polyfill.js";
import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

import type {
  OccupantRow,
  PreviousCharge,
  RentRollRow,
  SawsBill,
  UploadedFile,
} from "../types.js";
import {
  findHeaderRow,
  headerIndex,
  normalizeHeader,
  parseDate,
  parseNumber,
  readAllSheets,
  readTable,
  unitColumnIndex,
  unitKey,
} from "./helpers.js";

async function pdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer, CanvasFactory });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseSawsDates(text: string): { start: Date | null; end: Date | null } {
  const match = text.match(
    /SERVICE DATES FOR THIS STATEMENT:\s*([A-Z]{3})\s+(\d{1,2})\s*-\s*([A-Z]{3})\s+(\d{1,2})\s+(\d{4})/i,
  );
  if (!match) return { start: null, end: null };
  const startMonth = MONTHS[match[1].toLowerCase()];
  const endMonth = MONTHS[match[3].toLowerCase()];
  const year = Number(match[5]);
  if (startMonth == null || endMonth == null) return { start: null, end: null };
  const startYear = startMonth > endMonth ? year - 1 : year;
  return {
    start: new Date(startYear, startMonth, Number(match[2])),
    end: new Date(year, endMonth, Number(match[4])),
  };
}

export async function parseSawsBill(file: UploadedFile): Promise<SawsBill> {
  const text = await pdfText(file.buffer);
  const totalMatch = text.match(/TOTAL CURRENT CHARGES\s+([\d,]+\.\d{2})/i);
  if (!totalMatch) {
    throw new Error(`Could not find TOTAL CURRENT CHARGES in ${file.originalName}.`);
  }
  const daysMatch = text.match(/TOTAL DAYS OF SERVICE\s+(\d+)/i);
  const gallonsMatch = text.match(/METER WATER USE \(GALLONS\)\s+([\d,]+)/i);
  const accountMatch = text.match(/ACCOUNT\s*#\s*([0-9-]+)/i);
  const { start, end } = parseSawsDates(text);
  const days = daysMatch
    ? Number(daysMatch[1])
    : start && end
      ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
      : 30;

  return {
    total: parseNumber(totalMatch[1]),
    days,
    start,
    end,
    gallons: gallonsMatch ? parseNumber(gallonsMatch[1]) : null,
    account: accountMatch?.[1] ?? "",
    rawText: text,
  };
}

export async function parseSawsBills(files: UploadedFile[]) {
  const bills = await Promise.all(files.map(parseSawsBill));
  const total = bills.reduce((sum, bill) => sum + bill.total, 0);
  const start = bills.map((bill) => bill.start).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
  const end = bills.map((bill) => bill.end).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
  const days = bills[0]?.days ?? (start && end ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 : 30);
  return {
    combined: { ...bills[0], total, start, end, days } as SawsBill,
    bills,
  };
}

export async function parseUtilityTotal(file: UploadedFile) {
  const text = await pdfText(file.buffer);
  const patterns = [
    /TOTAL CURRENT CHARGES\s+([\d,]+\.\d{2})/i,
    /AMOUNT DUE NOW[.\s]+([\d,]+\.\d{2})/i,
    /AMOUNT DUE\s+\$?\s*([\d,]+\.\d{2})/i,
    /TOTAL DUE\s+\$?\s*([\d,]+\.\d{2})/i,
    /NEW CHARGES\s+\$?\s*([\d,]+\.\d{2})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseNumber(match[1]);
  }
  const amounts = [...text.matchAll(/\$\s*([\d,]+\.\d{2})/g)].map((m) => parseNumber(m[1]));
  if (amounts.length === 0) {
    throw new Error(`Could not find a dollar total in ${file.originalName}.`);
  }
  return Math.max(...amounts);
}

export function parseOccupantCount(file: UploadedFile): OccupantRow[] {
  const rows = readTable(file.buffer, file.originalName);
  const headerAt = findHeaderRow(rows, ["unit"]);
  if (headerAt < 0) {
    throw new Error(`Could not find a Unit column in occupant count (${file.originalName}).`);
  }
  const headers = (rows[headerAt] ?? []).map(normalizeHeader);
  const unitIdx = unitColumnIndex(headers);
  const residentIdx = headerIndex(headers, ["residents", "resident", "name"]);
  const sqftIdx = headerIndex(headers, ["square feet", "sq ft", "sqft"]);
  const occIdx = headerIndex(headers, ["occupant count", "occupants", "occs"]);
  const startIdx = headerIndex(headers, ["lease start"]);
  const endIdx = headerIndex(headers, ["lease end"]);
  if (unitIdx < 0) {
    throw new Error("Occupant count is missing a Unit column.");
  }

  const result: OccupantRow[] = [];
  for (const row of rows.slice(headerAt + 1)) {
    const unit = String(row[unitIdx] ?? "").trim();
    if (!unit || /^unit/i.test(unit) || /^total/i.test(unit) || /^©/.test(unit) || /resman/i.test(unit)) continue;
    const occupants = occIdx >= 0 ? Math.round(parseNumber(row[occIdx])) : 0;
    if (occupants > 50) continue;
    result.push({
      unit,
      resident: residentIdx >= 0 ? String(row[residentIdx] ?? "").trim() : "",
      sqft: sqftIdx >= 0 ? parseNumber(row[sqftIdx]) : 0,
      occupants,
      leaseStart: startIdx >= 0 ? parseDate(row[startIdx]) : null,
      leaseEnd: endIdx >= 0 ? parseDate(row[endIdx]) : null,
    });
  }
  if (result.length === 0) {
    throw new Error("Occupant count did not contain any unit rows.");
  }
  return result;
}

export function parseRentRoll(file: UploadedFile): RentRollRow[] {
  const rows = readTable(file.buffer, file.originalName);
  const headerAt = findHeaderRow(rows, ["unit"]);
  if (headerAt < 0) {
    throw new Error(`Could not find a Unit header in rent roll (${file.originalName}).`);
  }
  const headers = (rows[headerAt] ?? []).map(normalizeHeader);
  const unitIdx = unitColumnIndex(headers);
  const typeIdx = headerIndex(headers, ["type"]);
  const sqftIdx = headerIndex(headers, ["sq feet", "square feet", "sqft", "sq ft"]);
  const residentIdx = headerIndex(headers, ["residents", "resident"]);
  const statusIdx = headerIndex(headers, ["status"]);
  const accountIdx = headerIndex(headers, ["account"]);
  const moveInIdx = headerIndex(headers, ["move in"]);
  const leaseStartIdx = headerIndex(headers, ["lease start"]);
  const leaseEndIdx = headerIndex(headers, ["lease end"]);
  const moveOutIdx = headerIndex(headers, ["move out"]);

  const result: RentRollRow[] = [];
  for (const row of rows.slice(headerAt + 1)) {
    const labeled = unitIdx >= 0 ? String(row[unitIdx] ?? "").trim() : "";
    const first = String(row[0] ?? "").trim();
    const unit = labeled || first;
    if (!unit || /^(unit|current|total|vacant)$/i.test(unit)) continue;
    const resident = residentIdx >= 0 ? String(row[residentIdx] ?? "").trim() : "";
    const type = typeIdx >= 0 ? String(row[typeIdx] ?? "").trim() : "";
    const sqft = sqftIdx >= 0 ? parseNumber(row[sqftIdx]) : 0;
    const status = statusIdx >= 0 ? String(row[statusIdx] ?? "").trim() : "";
    if (!resident && !type && !sqft && !status) continue;
    if (!resident && !type && !sqft) continue;
    result.push({
      unit,
      type,
      sqft,
      resident,
      status,
      account: accountIdx >= 0 ? String(row[accountIdx] ?? "").trim() : "",
      moveIn: moveInIdx >= 0 ? parseDate(row[moveInIdx]) : null,
      leaseStart: leaseStartIdx >= 0 ? parseDate(row[leaseStartIdx]) : null,
      leaseEnd: leaseEndIdx >= 0 ? parseDate(row[leaseEndIdx]) : null,
      moveOut: moveOutIdx >= 0 ? parseDate(row[moveOutIdx]) : null,
    });
  }
  if (result.length === 0) {
    throw new Error("Rent roll did not contain any unit rows.");
  }
  return result;
}

export function parsePreviousBilling(file: UploadedFile): PreviousCharge[] {
  const sheets = readAllSheets(file.buffer, file.originalName);
  let best: { headerAt: number; rows: unknown[][]; score: number } | null = null;

  for (const sheet of sheets) {
    const headerAt = findHeaderRow(sheet.rows, ["unit"]);
    if (headerAt < 0) continue;
    const headers = (sheet.rows[headerAt] ?? []).map(normalizeHeader);
    const unitIdx = unitColumnIndex(headers);
    const residentIdx = headerIndex(headers, ["resident", "name", "residents"]);
    const totalIdx = headerIndex(headers, ["total", "new total", "amount", "water sewer", "water+sewer"]);
    if (unitIdx < 0 || residentIdx < 0 || totalIdx < 0) continue;
    const dataRows = sheet.rows.slice(headerAt + 1).filter((row) => {
      const unit = String(row[unitIdx] ?? "").trim();
      const resident = residentIdx >= 0 ? String(row[residentIdx] ?? "").trim() : "";
      const amount = totalIdx >= 0 ? parseNumber(row[totalIdx]) : 0;
      return (
        unit &&
        !/^(unit|#)$/i.test(unit) &&
        !/^total/i.test(unit) &&
        (resident || amount > 0)
      );
    });
    const withAmount = dataRows.filter((row) => {
      const amount = totalIdx >= 0 ? parseNumber(row[totalIdx]) : 0;
      return amount > 0;
    }).length;
    const score = withAmount * 1000 + dataRows.length;
    if (!best || score > best.score) {
      best = { headerAt, rows: sheet.rows, score };
    }
  }

  if (!best) {
    throw new Error(`Could not find a Unit column in previous billing (${file.originalName}).`);
  }

  const rows = best.rows;
  const headerAt = best.headerAt;
  const headers = (rows[headerAt] ?? []).map(normalizeHeader);
  const unitIdx = unitColumnIndex(headers);
  const residentIdx = headerIndex(headers, ["resident", "name"]);
  const occIdx = headerIndex(headers, ["occs", "occ", "occupants"]);
  const newWaterIdx = headerIndex(headers, ["new water"]);
  const newSewerIdx = headerIndex(headers, ["new sewer"]);
  const prevWaterIdx = headerIndex(headers, ["prev water", "water"]);
  const prevSewerIdx = headerIndex(headers, ["prev sewer", "sewer"]);
  const combinedIdx = headerIndex(headers, ["water sewer", "water/sewer", "water+sewer"]);
  const electricIdx = headerIndex(headers, ["electric"]);
  const gasIdx = headerIndex(headers, ["gas"]);
  const totalIdx = headerIndex(headers, ["total", "new total", "amount"]);
  const accountIdx = headerIndex(headers, ["account"]);
  const waterBaseIdx = headerIndex(headers, ["water base"]);
  const sewerBaseIdx = headerIndex(headers, ["sewer base"]);
  const capIdx = headerIndex(headers, ["cap"]);
  const moveInIdx = headerIndex(headers, ["move in"]);
  const waterIdx = newWaterIdx >= 0 ? newWaterIdx : prevWaterIdx;
  const sewerIdx = newSewerIdx >= 0 ? newSewerIdx : prevSewerIdx;

  const result: PreviousCharge[] = [];
  for (const row of rows.slice(headerAt + 1)) {
    const unit = String(row[unitIdx] ?? "").trim();
    if (!unit || /^(unit|#)$/i.test(unit) || /^total/i.test(unit)) continue;
    const water = waterIdx >= 0 ? parseNumber(row[waterIdx]) : 0;
    const sewer = sewerIdx >= 0 ? parseNumber(row[sewerIdx]) : 0;
    const combined = combinedIdx >= 0 ? parseNumber(row[combinedIdx]) : 0;
    const electric = electricIdx >= 0 ? parseNumber(row[electricIdx]) : 0;
    const gas = gasIdx >= 0 ? parseNumber(row[gasIdx]) : 0;
    let total = totalIdx >= 0 ? parseNumber(row[totalIdx]) : 0;
    const usageWater = water;
    const usageSewer = sewer;
    if (!total) total = combined || water + sewer + electric + gas;
    if (!unitKey(unit)) continue;
    result.push({
      unit,
      resident: residentIdx >= 0 ? String(row[residentIdx] ?? "").trim() : "",
      account: accountIdx >= 0 ? String(row[accountIdx] ?? "").trim() : "",
      water: usageWater,
      sewer: usageSewer,
      waterBase: waterBaseIdx >= 0 ? parseNumber(row[waterBaseIdx]) : 0,
      sewerBase: sewerBaseIdx >= 0 ? parseNumber(row[sewerBaseIdx]) : 0,
      cap: capIdx >= 0 ? parseNumber(row[capIdx]) : 0,
      electric,
      gas,
      total: combined || total,
      occupants: occIdx >= 0 ? Math.round(parseNumber(row[occIdx])) : 0,
      combinedIncludesBases: combinedIdx >= 0 && waterIdx < 0,
      moveIn: moveInIdx >= 0 ? parseDate(row[moveInIdx]) : null,
    });
  }
  return result.filter((row) => unitKey(row.unit));
}

export function filesByField(files: UploadedFile[], key: string) {
  return files.filter((file) => file.field === key);
}

export function requireFile(files: UploadedFile[], key: string, label: string) {
  const match = filesByField(files, key)[0];
  if (!match) throw new Error(`Missing required file: ${label}.`);
  return match;
}
