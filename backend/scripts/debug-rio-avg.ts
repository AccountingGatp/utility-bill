import fs from "node:fs";
import path from "node:path";

import { parsePreviousBilling } from "../src/parse/inputs.js";
import { occupantAverages } from "../src/parse/roster.js";

const prev = parsePreviousBilling({
  field: "pb",
  originalName: "x",
  mimeType: "x",
  buffer: fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "RIO", "RIO July.xlsx")),
});
const avg = occupantAverages(prev);
console.log("Rio occ averages:", Object.fromEntries(avg));
for (const u of ["0110", "0120", "0123"]) {
  const p = prev.find((r) => r.unit === u);
  console.log(u, p?.occupants, "total", p?.total, "scaled", p ? p.total * (13612.873 / 13363) : null);
}
