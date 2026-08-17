import fs from "node:fs";
import path from "node:path";

import { parseSawsBill } from "../src/parse/inputs.js";
import { round2 } from "../src/parse/helpers.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "VALENCIA");
const pdfs = ["VALENCIA 022 SAWSeBill.pdf", "VALENCIA 161 SAWSeBill.pdf"];

function fee(text: string, label: string) {
  const re = new RegExp(`${label}\\s+([\\d,]+\\.\\d{2})`, "i");
  return Number((text.match(re)?.[1] ?? "0").replace(/,/g, ""));
}

async function main() {
  let storm = 0;
  let tceq = 0;
  let uplift = 0;
  let domestic = 0;
  let total = 0;
  for (const pdf of pdfs) {
    const bill = await parseSawsBill({
      field: "s",
      originalName: pdf,
      mimeType: "application/pdf",
      buffer: fs.readFileSync(path.join(ROOT, pdf)),
    });
    storm += fee(bill.rawText, "STORMWATER FEE");
    tceq += fee(bill.rawText, "STATE-IMPOSED TCEQ FEE");
    uplift += fee(bill.rawText, "UPLIFT ASSISTANCE PROGRAM FEE");
    domestic += fee(bill.rawText, "DOMESTIC WATER SERVICE CHARGE");
    total += bill.total;
  }
  const units = 281;
  const recapture = 0.65;
  console.log({ storm, tceq, uplift, domestic, total });
  console.log("per unit storm", round2((storm * recapture) / units));
  console.log("per unit storm+tceq+uplift", round2(((storm + tceq + uplift) * recapture) / units));
  console.log("per unit all fixed", round2(((storm + tceq + uplift + domestic) * recapture) / units));
}

main();
