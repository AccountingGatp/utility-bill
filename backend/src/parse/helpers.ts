import { parse as parseCsv } from "csv-parse/sync";
import * as XLSX from "xlsx";

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function occupancyMultiplier(occupants: number) {
  if (occupants <= 0) return 0.4;
  if (occupants === 1) return 1;
  return round2(1 + (occupants - 1) * 0.6);
}

export function isVacantName(name: string) {
  const n = String(name ?? "").trim().toLowerCase();
  return !n || n === "vacant" || n === "vacant unit" || n.startsWith("vacant ");
}

export function formatProrPct(ratio: number) {
  if (ratio >= 1) return "100.0%";
  return `${round2(ratio * 100)}%`;
}

export function isBillableUnit(occupants: number, resident: string, unit = "") {
  if (occupants <= 0 || isVacantName(resident)) return false;
  const text = `${unit} ${resident}`.toLowerCase();
  if (/maintenance|\*shop|\bshop\b|office|model unit|storage/.test(text)) return false;
  return true;
}

export function unitKey(unit: string) {
  const trimmed = String(unit ?? "").trim().toUpperCase();
  if (/^\d+$/.test(trimmed)) return String(Number(trimmed));
  return trimmed.replace(/\s+/g, "");
}

export function daysInclusive(start: Date, end: Date) {
  const ms = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

export function calendarDay(value: Date) {
  let year = value.getUTCFullYear();
  let month = value.getUTCMonth();
  let day = value.getUTCDate();
  if (value.getUTCHours() >= 12) {
    const bumped = new Date(Date.UTC(year, month, day + 1));
    year = bumped.getUTCFullYear();
    month = bumped.getUTCMonth();
    day = bumped.getUTCDate();
  }
  return Date.UTC(year, month, day);
}

export function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20_000 && value < 80_000) {
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + Math.round(value) * 86_400_000);
  }
  const text = String(value).trim();
  if (!text || text === "None" || text === "-") return null;
  const mdy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdy) {
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(mdy[1]) - 1, Number(mdy[2]));
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

export function formatDate(value: Date | null) {
  if (!value) return "";
  let year = value.getUTCFullYear();
  let month = value.getUTCMonth();
  let day = value.getUTCDate();
  if (value.getUTCHours() >= 12) {
    const bumped = new Date(Date.UTC(year, month, day + 1));
    year = bumped.getUTCFullYear();
    month = bumped.getUTCMonth();
    day = bumped.getUTCDate();
  }
  return `${String(month + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
}

export function firstOfNextMonth(from: Date) {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

/** Mila and similar properties post on the 28th of the service-end month. */
export function chargeDateDay28(from: Date) {
  return new Date(from.getFullYear(), from.getMonth(), 28);
}

export function billingProration(
  moveIn: Date | null,
  moveOut: Date | null,
  start: Date,
  end: Date,
  due: Date,
) {
  const base = proration(moveIn, moveOut, start, end);
  if (base.ratio > 0 || !moveIn) return base;

  const move = Date.UTC(moveIn.getFullYear(), moveIn.getMonth(), moveIn.getDate());
  const cycleEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  if (move > cycleEnd && move <= dueDay) {
    return { days: daysInclusive(start, end), ratio: 1 };
  }
  return base;
}

export function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return 0;
  const text = String(value).replace(/[$,%\s]/g, "").replace(/[()]/g, "");
  if (!text) return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function unitColumnIndex(headers: string[]) {
  for (const candidate of ["unit number", "unit"]) {
    const exact = headers.findIndex((header) => header === candidate);
    if (exact >= 0) return exact;
  }
  return -1;
}

export function headerIndex(headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const exact = headers.findIndex((header) => header === candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of candidates) {
    const partial = headers.findIndex((header) => {
      if (!header.includes(candidate)) return false;
      if (candidate === "water" && header.includes("sewer")) return false;
      if (candidate === "sewer" && header.includes("water") && header !== "sewer") return false;
      return true;
    });
    if (partial >= 0) return partial;
  }
  return -1;
}

export function readTable(buffer: Buffer, filename: string): unknown[][] {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "tsv") {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    return parseCsv(text, {
      relax_column_count: true,
      skip_empty_lines: false,
    }) as unknown[][];
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`No sheets found in ${filename}.`);
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  }) as unknown[][];
}

export function findHeaderRow(rows: unknown[][], required: string[]) {
  for (let i = 0; i < Math.min(rows.length, 60); i += 1) {
    const headers = (rows[i] ?? []).map(normalizeHeader);
    const unitIdx = unitColumnIndex(headers);
    if (required.includes("unit")) {
      if (unitIdx < 0) continue;
    } else if (!required.every((token) => headers.some((header) => header === token || header.includes(token)))) {
      continue;
    }

    const hasResident = headerIndex(headers, ["resident", "name", "residents"]) >= 0;
    const hasAmount =
      headerIndex(headers, [
        "total",
        "new total",
        "amount",
        "water",
        "water sewer",
        "water+sewer",
        "water/sewer",
      ]) >= 0;
    if (required.includes("unit") && !hasResident && !hasAmount) continue;

    const matched = required.every((token) => {
      if (token === "unit") return unitIdx >= 0;
      return headers.some((header) => header === token || header.includes(token));
    });
    if (matched) return i;
  }
  return -1;
}

export function readAllSheets(buffer: Buffer, filename: string): { name: string; rows: unknown[][] }[] {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "tsv") {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    return [
      {
        name: filename,
        rows: parseCsv(text, {
          relax_column_count: true,
          skip_empty_lines: false,
        }) as unknown[][],
      },
    ];
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: "",
      raw: true,
      blankrows: true,
    }) as unknown[][],
  }));
}

export function proration(
  moveIn: Date | null,
  moveOut: Date | null,
  start: Date,
  end: Date,
) {
  const cycleStart = calendarDay(start);
  const cycleEnd = calendarDay(end);
  const moveInDay = moveIn ? calendarDay(moveIn) : null;
  const moveOutDay = moveOut ? calendarDay(moveOut) : null;
  if (moveInDay != null && moveInDay > cycleEnd) return { days: 0, ratio: 0 };
  const from = moveInDay != null && moveInDay > cycleStart ? moveInDay : cycleStart;
  const to = moveOutDay != null && moveOutDay < cycleEnd ? moveOutDay : cycleEnd;
  if (to < from) return { days: 0, ratio: 0 };
  const days = Math.round((to - from) / 86_400_000) + 1;
  const total = Math.max(1, Math.round((cycleEnd - cycleStart) / 86_400_000) + 1);
  return { days: Math.min(days, total), ratio: Math.min(1, days / total) };
}

export function applyCap(amount: number, cap: number | null) {
  if (cap == null) return round2(amount);
  return round2(Math.min(amount, cap));
}
