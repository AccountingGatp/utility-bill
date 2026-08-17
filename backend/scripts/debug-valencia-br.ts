import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const p = path.resolve("..", "utilitybillingjuly (3)", "VALENCIA", "Valencia_July_2026_Billing.xlsx");
const wb = XLSX.read(fs.readFileSync(p));
const rows = XLSX.utils.sheet_to_json(wb.Sheets["July Billing"], { header: 1, defval: "" }) as unknown[][];
const header = rows[2] as string[];
const idx = (name: string) => header.findIndex((h) => String(h).toLowerCase().includes(name.toLowerCase()));
const u = idx("Unit");
const br = idx("BR");
const cap = header.findIndex((h) => String(h).includes("Cap"));
const plan = idx("Plan");
const ws = idx("Water");
for (const unit of ["A-13", "A-14", "A-15", "A-17", "B-23", "H-25"]) {
  const row = rows.find((r) => String(r[u]) === unit);
  if (!row) {
    console.log(unit, "NOT IN JULY BILLING");
    continue;
  }
  console.log(unit, { plan: row[plan], br: row[br], cap: row[cap], ws: row[ws] });
}
