import fs from "node:fs";
import path from "node:path";

import { processValencia } from "../src/billing/valencia.js";
import type { UploadedFile } from "../src/types.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "VALENCIA");
const files: UploadedFile[] = [
  { field: "occupantCount", originalName: "oc.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")) },
  { field: "rentRoll", originalName: "rr.xls", mimeType: "application/vnd.ms-excel", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")) },
  { field: "previousBilling", originalName: "pb.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: fs.readFileSync(path.join(ROOT, "Valencia_July_2026_Billing.xlsx")) },
  { field: "sawsBill", originalName: "a.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(ROOT, "VALENCIA 022 SAWSeBill.pdf")) },
  { field: "sawsBill", originalName: "b.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(ROOT, "VALENCIA 161 SAWSeBill.pdf")) },
];

const result = await processValencia("Valencia at Medical", files, { recaptureRate: 0.65 });
console.log(result.summary);
const importCsv = result.files.find((f) => f.filename.includes("ResMan"))!.buffer.toString("utf8");
console.log("rows", importCsv.split("\n").length - 2);
