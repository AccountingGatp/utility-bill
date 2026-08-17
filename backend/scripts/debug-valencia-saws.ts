import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parseRentRoll, parseSawsBill } from "../src/parse/inputs.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "VALENCIA");

async function main() {
  const saws = await parseSawsBill({
    field: "s",
    originalName: "x.pdf",
    mimeType: "application/pdf",
    buffer: fs.readFileSync(path.join(ROOT, "VALENCIA 022 SAWSeBill.pdf")),
  });
  console.log("SAWS total", saws.total, "text len", saws.rawText.length);
  console.log(saws.rawText.slice(0, 2000));

  const rr = parseRentRoll({
    field: "r",
    originalName: "r.xls",
    mimeType: "x",
    buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")),
  });
  console.log(
    "H-25 rent roll",
    rr.filter((r) => /H-?25/i.test(r.unit)),
  );

  const oc = parseOccupantCount({
    field: "o",
    originalName: "o.xlsx",
    mimeType: "x",
    buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")),
  });
  console.log("occupant rows", oc.length, "has H-25", oc.some((r) => /H-?25/i.test(r.unit)));
}

main();
