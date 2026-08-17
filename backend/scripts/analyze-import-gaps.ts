import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const IMPORT = path.resolve("..", "utilitybillingjuly (3)", "Import");

function load(name: string) {
  return parse(fs.readFileSync(path.join(IMPORT, name), "utf8"), { relax_column_count: true }) as string[][];
}

const val = load("Valencia_August_2026_ResMan_Import (1).csv");
const gen = parse(fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "_generated", "Valencia_August_2026_Billing_ResMan_Import.csv"), "utf8"), { relax_column_count: true }) as string[][];

function toMap(rows: string[][]) {
  const m = new Map<string, number>();
  for (const r of rows.slice(1)) {
    if (!r[1]) continue;
    m.set(r[1], Number(r[5]));
  }
  return m;
}
const exp = toMap(val);
const act = toMap(gen);
let exact = 0;
const byAmount: Record<string, number> = {};
for (const [unit, amt] of exp) {
  if (act.get(unit) === amt) exact++;
  else {
    const diff = `${act.get(unit)} vs ${amt}`;
    byAmount[diff] = (byAmount[diff] ?? 0) + 1;
  }
}
console.log("Valencia exact", exact, "/", exp.size);
console.log("missing in gen", [...exp.keys()].filter((u) => !act.has(u)).slice(0, 10));
console.log("extra in gen", [...act.keys()].filter((u) => !exp.has(u)).slice(0, 10));
console.log("top diff patterns", Object.entries(byAmount).sort((a,b)=>b[1]-a[1]).slice(0, 8));

const rioExp = toMap(load("0728-RI354-WaterSewer_Combined (1).csv").map((r,i)=> i===0?["p","Unit","Resident","a","Occ","Amount","Notes"]:["p",r[0],r[1],"a",r[3],r[4],r[5]]));
console.log("\nRio expected units", rioExp.size);
