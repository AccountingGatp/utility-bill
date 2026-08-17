import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

import { processProperty } from "../src/billing/run.js";
import type { UploadedFile } from "../src/types.js";

const ROOT = path.resolve("..", "utilitybillingjuly (3)");
const IMPORT = path.join(ROOT, "Import");
const OUT = path.join(ROOT, "_generated");

type CaseSpec = {
  propertyId: string;
  label: string;
  expectedFile: string;
  matchFile: (names: string[]) => string | undefined;
  compareMode: "full" | "import";
  options?: { increasePercent?: number; recaptureRate?: number };
  files: Record<string, string[]>;
};

function loadBuffer(filePath: string): UploadedFile["buffer"] {
  return fs.readFileSync(filePath);
}

function mimeFor(name: string) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".xls") return "application/vnd.ms-excel";
  return "text/csv";
}

function toUploaded(files: Record<string, string[]>): UploadedFile[] {
  const uploaded: UploadedFile[] = [];
  for (const [field, paths] of Object.entries(files)) {
    for (const p of paths) {
      uploaded.push({
        field,
        originalName: path.basename(p),
        mimeType: mimeFor(p),
        buffer: loadBuffer(p),
      });
    }
  }
  return uploaded;
}

function parseCsv(text: string): string[][] {
  return parse(text, { relax_column_count: true, skip_empty_lines: false, trim: false }) as string[][];
}

function norm(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function parseMoney(value: string): number | null {
  const cleaned = value.replace(/[$,%]/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function cellsEqual(a: string, b: string, numeric = true): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  if (!numeric) return false;
  const ma = parseMoney(na);
  const mb = parseMoney(nb);
  if (ma != null && mb != null) return Math.abs(ma - mb) < 0.02;
  return false;
}

function importKey(row: string[], headers: string[]): string {
  const map = Object.fromEntries(headers.map((h, i) => [norm(h).toLowerCase(), i]));
  const unit = norm(row[map["unit"] ?? 0]);
  const resident = norm(row[map["resident"] ?? 1]).toLowerCase();
  const code = map["charge code"] != null ? norm(row[map["charge code"]]).toLowerCase() : "ws";
  return `${unit}|${resident}|${code}`;
}

function importAmountCol(headers: string[]): number {
  const map = Object.fromEntries(headers.map((h, i) => [norm(h).toLowerCase(), i]));
  if (map["amount"] != null) return map["amount"];
  if (map["water + sewer total"] != null) return map["water + sewer total"];
  return headers.length - 2;
}

function compareImport(expected: string[][], actual: string[][]) {
  const eHeader = expected[0] ?? [];
  const aHeader = actual[0] ?? [];
  const amountCol = importAmountCol(eHeader);
  const eRows = new Map<string, string[]>();
  for (const row of expected.slice(1)) {
    if (!norm(row[0]) || norm(row[0]).toUpperCase() === "TOTAL") continue;
    eRows.set(importKey(row, eHeader), row);
  }
  const aRows = new Map<string, string[]>();
  for (const row of actual.slice(1)) {
    if (!norm(row[0]) || norm(row[0]).toUpperCase() === "TOTAL") continue;
    aRows.set(importKey(row, aHeader), row);
  }

  let matched = 0;
  let amountDiff = 0;
  const missing: string[] = [];
  const extra: string[] = [];
  const diffs: string[] = [];

  for (const [key, erow] of eRows) {
    const arow = aRows.get(key);
    if (!arow) {
      missing.push(key);
      continue;
    }
    matched += 1;
    const ev = norm(erow[amountCol]);
    const av = norm(arow[amountCol]);
    if (!cellsEqual(ev, av)) {
      amountDiff += 1;
      if (diffs.length < 5) diffs.push(`${key}: expected ${ev}, got ${av}`);
    }
  }
  for (const key of aRows.keys()) {
    if (!eRows.has(key)) extra.push(key);
  }
  return { matched, amountDiff, missing, extra, diffs, expectedRows: eRows.size, actualRows: aRows.size };
}

function compareFull(expected: string[][], actual: string[][]) {
  let diffs = 0;
  const preview: string[] = [];
  const maxRows = Math.max(expected.length, actual.length);
  for (let r = 0; r < maxRows; r++) {
    const er = expected[r] ?? [];
    const ar = actual[r] ?? [];
    const maxCols = Math.max(er.length, ar.length);
    for (let c = 0; c < maxCols; c++) {
      if (!cellsEqual(er[c] ?? "", ar[c] ?? "")) {
        diffs += 1;
        if (preview.length < 6) {
          preview.push(`r${r + 1}c${c + 1}: expected "${er[c] ?? ""}" got "${ar[c] ?? ""}"`);
        }
      }
    }
  }
  return { diffs, preview };
}

const CASES: CaseSpec[] = [
  {
    propertyId: "green-oaks",
    label: "Green Oaks",
    expectedFile: "GO August_2026_Billing_FINAL (1).csv",
    matchFile: (names) => names.find((n) => n.includes("Billing_FINAL") && n.endsWith(".csv")),
    compareMode: "full",
    options: { increasePercent: 10 },
    files: {
      occupantCount: [path.join(ROOT, "Green oaks", "Occupant Count.xlsx")],
      rentRoll: [path.join(ROOT, "Green oaks", "Rent Roll.xls")],
      sawsBill: [path.join(ROOT, "Green oaks", "07.07.2026 SAWSeBill (1).pdf")],
      previousBilling: [path.join(ROOT, "Green oaks", "GO July_2026_Billing_FINAL (1).xlsx")],
    },
  },
  {
    propertyId: "university-cove",
    label: "University Cove",
    expectedFile: "UC_August_2026_Billing_95pct (1).csv",
    matchFile: (names) =>
      names.find((n) => n.includes("Billing_95pct") && n.endsWith(".csv") && !n.includes("ResMan")),
    compareMode: "full",
    options: { recaptureRate: 0.95 },
    files: {
      occupantCount: [path.join(ROOT, "UC", "Occupant Count.xlsx")],
      rentRoll: [path.join(ROOT, "UC", "Rent Roll.xls")],
      sawsBill: [path.join(ROOT, "UC", "UC 125 SAWSeBill.pdf")],
      previousBilling: [path.join(ROOT, "UC", "UC_July_2026_Billing_95pct.xlsx")],
    },
  },
  {
    propertyId: "valencia",
    label: "Valencia",
    expectedFile: "Valencia_August_2026_ResMan_Import (1).csv",
    matchFile: (names) => names.find((n) => n.includes("ResMan_Import") && n.endsWith(".csv")),
    compareMode: "import",
    options: { recaptureRate: 0.65 },
    files: {
      occupantCount: [path.join(ROOT, "VALENCIA", "Occupant Count.xlsx")],
      rentRoll: [path.join(ROOT, "VALENCIA", "Rent Roll.xls")],
      sawsBill: [
        path.join(ROOT, "VALENCIA", "VALENCIA 022 SAWSeBill.pdf"),
        path.join(ROOT, "VALENCIA", "VALENCIA 161 SAWSeBill.pdf"),
      ],
      previousBilling: [path.join(ROOT, "VALENCIA", "Valencia_July_2026_Billing.xlsx")],
    },
  },
  {
    propertyId: "rio-springs",
    label: "Rio Springs",
    expectedFile: "0728-RI354-WaterSewer_Combined (1).csv",
    matchFile: (names) => names.find((n) => n.includes("ResMan_Import") && n.endsWith(".csv")),
    compareMode: "import",
    options: { recaptureRate: 0.95 },
    files: {
      occupantCount: [path.join(ROOT, "RIO", "Occupant Count.xlsx")],
      rentRoll: [path.join(ROOT, "RIO", "Rent Roll.xls")],
      sawsBill: [path.join(ROOT, "RIO", "RIO 557 SAWSeBill.pdf")],
      previousBilling: [path.join(ROOT, "RIO", "RIO July.xlsx")],
    },
  },
  {
    propertyId: "mila",
    label: "Mila",
    expectedFile: "Mila_July_2026_ResMan_Import (2).csv",
    matchFile: (names) => names.find((n) => n.includes("ResMan_Import") && n.endsWith(".csv")),
    compareMode: "import",
    options: { recaptureRate: 0.95 },
    files: {
      occupantCount: [path.join(ROOT, "Mila", "Occupant Count (1).xlsx")],
      rentRoll: [path.join(ROOT, "Mila", "Rent Roll (1).xlsx")],
      sawsBill: [
        path.join(ROOT, "Mila", "Mila 479.pdf"),
        path.join(ROOT, "Mila", "Mila 725.pdf"),
        path.join(ROOT, "Mila", "Mila 728.pdf"),
        path.join(ROOT, "Mila", "Mila 729.pdf"),
      ],
      gasBill: [path.join(ROOT, "Mila", "Gas only.pdf")],
      electricBill: [path.join(ROOT, "Mila", "Electric only.pdf")],
      previousBilling: [path.join(ROOT, "Mila", "Mila_July_2026_Utility_Billing.xlsx")],
    },
  },
  {
    propertyId: "istana",
    label: "Istana",
    expectedFile: "",
    matchFile: (names) => names.find((n) => n.includes("Water_Bill") && n.endsWith(".csv") && !n.includes("ResMan")),
    compareMode: "full",
    options: { recaptureRate: 0.95 },
    files: {
      occupantCount: [path.join(ROOT, "ISTANA", "Occupant Count.xlsx")],
      rentRoll: [path.join(ROOT, "ISTANA", "Rent Roll.xls")],
      sawsDomestic: [path.join(ROOT, "ISTANA", "07.02.2026 SAWSeBill.pdf")],
      sawsIrrigation: [path.join(ROOT, "ISTANA", "07.02.2026 615.49 SAWSeBill.pdf")],
      previousBilling: [path.join(ROOT, "ISTANA", "Istana_July_2026_Water_Bill (1) (2).xlsx")],
    },
  },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const results: string[] = [];

  for (const spec of CASES) {
    const expectedPath = spec.expectedFile
      ? path.isAbsolute(spec.expectedFile)
        ? spec.expectedFile
        : path.join(IMPORT, spec.expectedFile)
      : "";

    try {
      const uploaded = toUploaded(spec.files);
      const result = await processProperty(spec.propertyId, uploaded, spec.options ?? {});
      const matched = spec.matchFile(result.files.map((f) => f.filename));
      if (!matched) {
        results.push(`❌ ${spec.label}: no matching output among ${result.files.map((f) => f.filename).join(", ")}`);
        continue;
      }

      const generated = result.files.find((f) => f.filename === matched)!;
      fs.writeFileSync(path.join(OUT, generated.filename), generated.buffer);

      if (!expectedPath || !fs.existsSync(expectedPath)) {
        results.push(
          `ℹ️  ${spec.label}: generated ${matched} (no CSV in Import folder to compare) | ${JSON.stringify(result.summary)}`,
        );
        continue;
      }

      const expectedText = fs.readFileSync(expectedPath, "utf8");
      const actualText = generated.buffer.toString("utf8");
      const summary = Object.entries(result.summary)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");

      if (spec.compareMode === "import") {
        const cmp = compareImport(parseCsv(expectedText), parseCsv(actualText));
        if (cmp.missing.length === 0 && cmp.extra.length === 0 && cmp.amountDiff === 0) {
          results.push(`✅ ${spec.label}: ${cmp.expectedRows} import rows match (${matched}) | ${summary}`);
        } else {
          results.push(
            `⚠️  ${spec.label}: rows ${cmp.matched}/${cmp.expectedRows}, amount diffs ${cmp.amountDiff}, missing ${cmp.missing.length}, extra ${cmp.extra.length} | ${summary}\n  ${cmp.diffs.join("\n  ")}${cmp.missing[0] ? `\n  missing example: ${cmp.missing[0]}` : ""}${cmp.extra[0] ? `\n  extra example: ${cmp.extra[0]}` : ""}`,
          );
        }
      } else {
        const cmp = compareFull(parseCsv(expectedText), parseCsv(actualText));
        if (cmp.diffs === 0) {
          results.push(`✅ ${spec.label}: exact match (${matched}) | ${summary}`);
        } else {
          results.push(
            `⚠️  ${spec.label}: ${cmp.diffs} cell diff(s) in ${matched} | ${summary}\n  ${cmp.preview.join("\n  ")}`,
          );
        }
      }
    } catch (error) {
      results.push(`❌ ${spec.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\n=== Billing validation vs reference outputs ===\n");
  console.log(results.join("\n\n"));
  console.log(`\nGenerated files: ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
