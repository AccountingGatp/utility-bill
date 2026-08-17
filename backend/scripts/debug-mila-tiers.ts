import fs from "node:fs";
import path from "node:path";

import { parsePreviousBilling } from "../src/parse/inputs.js";
import { wsTotal } from "../src/billing/derived.js";

const prev = parsePreviousBilling({
  field: "pb",
  originalName: "pb.xlsx",
  mimeType: "x",
  buffer: fs.readFileSync(
    path.resolve("..", "utilitybillingjuly (3)", "Mila", "Mila_July_2026_Utility_Billing.xlsx"),
  ),
});

const byOcc = new Map<number, { ws: number; elec: number; gas: number }>();
for (const row of prev) {
  if (row.occupants <= 0) continue;
  const cur = byOcc.get(row.occupants) ?? { ws: 0, elec: 0, gas: 0 };
  cur.ws = Math.max(cur.ws, wsTotal(row));
  cur.elec = Math.max(cur.elec, row.electric);
  cur.gas = Math.max(cur.gas, row.gas);
  byOcc.set(row.occupants, cur);
}
console.log(Object.fromEntries(byOcc));
