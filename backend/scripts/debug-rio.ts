import fs from "node:fs";
import path from "node:path";

import { parsePreviousBilling } from "../src/parse/inputs.js";

const prev = parsePreviousBilling({
  field: "previousBilling",
  originalName: "RIO July.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  buffer: fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "RIO", "RIO July.xlsx")),
});
const sum = prev.reduce((s, r) => s + (r.water + r.sewer || r.total), 0);
console.log("rio prev rows", prev.length, "sum", sum.toFixed(2));
for (const u of ["0110", "0123", "0113"]) {
  const r = prev.find((x) => x.unit === u);
  console.log(u, r);
}
