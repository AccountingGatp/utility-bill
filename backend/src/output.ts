import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import JSZip from "jszip";

import type { OutputFile } from "./types.js";

export function csvBuffer(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const csv = stringify(rows, { header: true, columns: cols });
  return {
    filename,
    contentType: "text/csv; charset=utf-8",
    buffer: Buffer.from(csv, "utf8"),
  } satisfies OutputFile;
}

export function csvFromAoA(filename: string, rows: unknown[][]) {
  const csv = stringify(rows);
  return {
    filename,
    contentType: "text/csv; charset=utf-8",
    buffer: Buffer.from(csv, "utf8"),
  } satisfies OutputFile;
}

export async function xlsxFromAoA(
  filename: string,
  sheets: { name: string; rows: unknown[][] }[],
) {
  const workbook = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31));
    for (const row of spec.rows) {
      sheet.addRow(row as ExcelJS.CellValue[]);
    }
    const first = spec.rows[0];
    if (Array.isArray(first) && first.length === 1) {
      sheet.mergeCells(1, 1, 1, 12);
      sheet.getCell(1, 1).font = { bold: true, size: 12 };
    }
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(arrayBuffer),
  } satisfies OutputFile;
}

export async function xlsxBuffer(
  filename: string,
  sheetName: string,
  headerLines: string[],
  rows: Record<string, unknown>[],
) {
  const aoa: unknown[][] = headerLines.map((line) => [line]);
  if (rows.length) {
    const columns = Object.keys(rows[0]);
    aoa.push(columns);
    for (const row of rows) {
      aoa.push(columns.map((column) => row[column]));
    }
  }
  return xlsxFromAoA(filename, [{ name: sheetName, rows: aoa }]);
}

export async function zipOutputs(zipName: string, files: OutputFile[]) {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, file.buffer);
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { zipName, buffer };
}
