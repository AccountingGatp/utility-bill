import fs from "node:fs";
import path from "node:path";

import {
  parseOccupantCount,
  parsePreviousBilling,
  parseRentRoll,
} from "../src/parse/inputs.js";
import { buildRoster } from "../src/parse/roster.js";
import {
  deriveBases,
  deriveCapsByTier,
  deriveSizeCaps,
  deriveStdUsage,
  rowBases,
} from "../src/billing/derived.js";
import type { UploadedFile } from "../src/types.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)");

function load(rel: string): UploadedFile["buffer"] {
  return fs.readFileSync(path.join(ROOT, rel));
}

function pb(rel: string) {
  return parsePreviousBilling({
    field: "previousBilling",
    originalName: path.basename(rel),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: load(rel),
  });
}

function roster(occRel: string, rrRel: string) {
  return buildRoster(
    parseOccupantCount({
      field: "occupantCount",
      originalName: "oc",
      mimeType: "x",
      buffer: load(occRel),
    }),
    parseRentRoll({
      field: "rentRoll",
      originalName: "rr",
      mimeType: "x",
      buffer: load(rrRel),
    }),
  );
}

for (const spec of [
  {
    label: "Valencia",
    pb: "VALENCIA/Valencia_July_2026_Billing.xlsx",
    occ: "VALENCIA/Occupant Count.xlsx",
    rr: "VALENCIA/Rent Roll.xls",
  },
  {
    label: "RIO",
    pb: "RIO/RIO July.xlsx",
    occ: "RIO/Occupant Count.xlsx",
    rr: "RIO/Rent Roll.xls",
  },
  {
    label: "GO",
    pb: "Green oaks/GO July_2026_Billing_FINAL (1).xlsx",
    occ: "Green oaks/Occupant Count.xlsx",
    rr: "Green oaks/Rent Roll.xls",
  },
]) {
  const prev = pb(spec.pb);
  const r = roster(spec.occ, spec.rr);
  const basesCol = prev.filter((row) => row.waterBase + row.sewerBase > 0);
  const inferred = prev.map(rowBases).filter((v) => v > 0);
  console.log(`\n=== ${spec.label} (${prev.length} rows) ===`);
  console.log("deriveBases:", deriveBases(prev));
  console.log("waterBase+sewerBase rows:", basesCol.length, "sample:", basesCol.slice(0, 2));
  console.log("inferred bases median sample:", inferred.slice(0, 5));
  if (spec.label === "Valencia") {
    console.log("capsByTier:", Object.fromEntries(deriveCapsByTier(prev, r)));
  }
  if (spec.label === "GO") {
    const sc = deriveSizeCaps(prev, r);
    console.log("sizeCaps:", sc, "stdUsage1:", deriveStdUsage(prev, sc.bases, 1));
  }
  if (spec.label === "RIO") {
    console.log(
      "RIO bases median:",
      deriveBases(prev),
      "storm? sample totals:",
      prev.slice(0, 3).map((row) => ({
        unit: row.unit,
        total: row.total,
        ws: row.water + row.sewer,
        wb: row.waterBase,
        sb: row.sewerBase,
      })),
    );
  }
}
