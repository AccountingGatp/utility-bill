import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

import { parseOccupantCount, parsePreviousBilling, parseRentRoll, requireFile } from "../src/parse/inputs.js";
import type { UploadedFile } from "../src/types.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "Mila");
const files: UploadedFile[] = [
  { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count (1).xlsx")) },
  { field: "rentRoll", originalName: "rr.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll (1).xlsx")) },
  { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Mila_July_2026_Utility_Billing.xlsx")) },
];

const oc = parseOccupantCount(requireFile(files, "occupantCount", "oc"));
const rr = parseRentRoll(requireFile(files, "rentRoll", "rr"));
const prev = parsePreviousBilling(requireFile(files, "previousBilling", "pb"));

console.log("OC units sample:", oc.slice(0, 8).map((r) => r.unit));
console.log("RR units sample:", rr.slice(0, 8).map((r) => r.unit));
console.log("Prev units sample:", prev.slice(0, 8).map((r) => r.unit));

const importPath = path.resolve("..", "utilitybillingjuly (3)", "Import", "Mila_July_2026_ResMan_Import (2).csv");
const rows = parse(importPath, { relax_column_count: true }) as string[][];
const importUnits = [...new Set(rows.slice(1).map((r) => r[0]?.trim()).filter(Boolean))];
console.log("Import units sample:", importUnits.slice(0, 10));
console.log("Import charge date sample:", rows[1]?.[4]);
