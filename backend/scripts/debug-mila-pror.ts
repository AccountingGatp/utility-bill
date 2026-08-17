import fs from "node:fs";
import path from "node:path";

import { parseOccupantCount, parseRentRoll, parseSawsBills } from "../src/parse/inputs.js";
import { buildRoster } from "../src/parse/roster.js";
import { formatDate, proration } from "../src/parse/helpers.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "Mila");
const oc = parseOccupantCount({
  field: "o",
  originalName: "o.xlsx",
  mimeType: "x",
  buffer: fs.readFileSync(path.join(ROOT, "Occupant Count (1).xlsx")),
});
const rr = parseRentRoll({
  field: "r",
  originalName: "r.xlsx",
  mimeType: "x",
  buffer: fs.readFileSync(path.join(ROOT, "Rent Roll (1).xlsx")),
});
const roster = buildRoster(oc, rr);
const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".pdf") && f.startsWith("Mila"));
const sawsFiles = files.filter((f) => !/Gas|Electric/i.test(f)).map((name) => ({
  field: "sawsBill",
  originalName: name,
  mimeType: "application/pdf",
  buffer: fs.readFileSync(path.join(ROOT, name)),
}));
const { combined } = await parseSawsBills(sawsFiles);
console.log("service", formatDate(combined.start), formatDate(combined.end));
for (const id of ["A3", "B1"]) {
  const u = roster.find((r) => r.displayUnit === id)!;
  console.log(id, {
    moveIn: formatDate(u.moveIn),
    occs: u.occupants,
    pror: proration(u.moveIn, u.moveOut, combined.start!, combined.end!),
  });
}
