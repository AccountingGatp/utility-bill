import fs from "node:fs";
import path from "node:path";

import { parseSawsBill } from "../src/parse/inputs.js";

const bill = await parseSawsBill({
  field: "s",
  originalName: "r.pdf",
  mimeType: "application/pdf",
  buffer: fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "RIO", "RIO 557 SAWSeBill.pdf")),
});
console.log("Rio SAWS total", bill.total);
const m = bill.rawText.match(/TOTAL CURRENT CHARGES\s+([\d,]+\.\d{2})/i);
console.log("match", m?.[1]);
