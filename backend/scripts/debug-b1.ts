import fs from "node:fs";
import path from "node:path";

import { parseRentRoll } from "../src/parse/inputs.js";
import { bedroomTier, utilityOccTier } from "../src/billing/derived.js";
import { buildRoster } from "../src/parse/roster.js";
import { parseOccupantCount } from "../src/parse/inputs.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)", "Mila");
const rr = parseRentRoll({ field: "r", originalName: "r", mimeType: "x", buffer: fs.readFileSync(path.join(ROOT, "Rent Roll (1).xlsx")) });
const oc = parseOccupantCount({ field: "o", originalName: "o", mimeType: "x", buffer: fs.readFileSync(path.join(ROOT, "Occupant Count (1).xlsx")) });
const u = buildRoster(oc, rr).find((r) => r.displayUnit === "B1")!;
console.log(u, { tier: bedroomTier(u), utilityOcc: utilityOccTier(u, u.occupants) });
