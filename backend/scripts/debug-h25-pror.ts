import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parseRentRoll, parseSawsBills } from "../src/parse/inputs.js";
import { buildRoster } from "../src/parse/roster.js";
import { formatDate, proration } from "../src/parse/helpers.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "VALENCIA");
const oc = parseOccupantCount({
  field: "o",
  originalName: "o.xlsx",
  mimeType: "x",
  buffer: fs.readFileSync(path.join(ROOT, "Occupant Count.xlsx")),
});
const rr = parseRentRoll({
  field: "r",
  originalName: "r.xls",
  mimeType: "x",
  buffer: fs.readFileSync(path.join(ROOT, "Rent Roll.xls")),
});
const roster = buildRoster(oc, rr);
const h25 = roster.find((u) => u.displayUnit === "H-25")!;
const files = ["VALENCIA 022 SAWSeBill.pdf", "VALENCIA 161 SAWSeBill.pdf"].map((name) => ({
  field: "sawsBill",
  originalName: name,
  mimeType: "application/pdf",
  buffer: fs.readFileSync(path.join(ROOT, name)),
}));
const { combined } = await parseSawsBills(files);
console.log("service", formatDate(combined.start), formatDate(combined.end));
console.log("H-25 moveIn", formatDate(h25.moveIn), proration(h25.moveIn, h25.moveOut, combined.start!, combined.end!));
