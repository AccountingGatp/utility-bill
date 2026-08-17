import fs from "node:fs";
import path from "node:path";
import { readTable } from "../src/parse/helpers.js";

const rows = readTable(fs.readFileSync(path.resolve("..", "utilitybillingjuly (3)", "UC", "Rent Roll.xls")), "Rent Roll.xls");
for (let i = 0; i < 12; i++) console.log(i, rows[i]?.slice(0, 8));
