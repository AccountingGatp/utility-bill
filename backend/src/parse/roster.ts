import type { OccupantRow, PreviousCharge, RentRollRow, RosterUnit } from "../types.js";
import { isVacantName, unitKey } from "./helpers.js";

export function buildRoster(occupants: OccupantRow[], rentRoll: RentRollRow[]): RosterUnit[] {
  const rollByUnit = new Map<string, RentRollRow>();
  for (const row of rentRoll) {
    rollByUnit.set(unitKey(row.unit), row);
  }

  return occupants.map((occupant) => {
    const roll = rollByUnit.get(unitKey(occupant.unit));
    const occName = isVacantName(occupant.resident) ? "" : occupant.resident;
    const rollName = isVacantName(roll?.resident ?? "") ? "" : roll?.resident ?? "";
    const resident = occName || rollName;
    return {
      unit: unitKey(occupant.unit),
      displayUnit: occupant.unit || roll?.unit || "",
      resident,
      type: roll?.type ?? "",
      sqft: occupant.sqft || roll?.sqft || 0,
      occupants: occupant.occupants,
      status: roll?.status ?? "",
      account: roll?.account ?? "",
      moveIn: roll?.moveIn ?? occupant.leaseStart,
      leaseStart: occupant.leaseStart ?? roll?.leaseStart ?? null,
      leaseEnd: occupant.leaseEnd ?? roll?.leaseEnd ?? null,
      moveOut: roll?.moveOut ?? null,
    };
  });
}

export function indexPrevious(rows: PreviousCharge[]) {
  const map = new Map<string, PreviousCharge>();
  for (const row of rows) {
    map.set(unitKey(row.unit), row);
  }
  return map;
}

export function padUnit(unit: string) {
  const trimmed = String(unit).trim();
  if (/^\d+$/.test(trimmed)) return trimmed.padStart(4, "0");
  return trimmed;
}

export function lookupPrevious(
  unit: string,
  displayUnit: string,
  resident: string,
  byUnit: Map<string, PreviousCharge>,
  byName: Map<string, PreviousCharge>,
) {
  return (
    byUnit.get(unit) ||
    byUnit.get(unitKey(displayUnit)) ||
    byUnit.get(padUnit(displayUnit)) ||
    (resident ? byName.get(resident.trim().toLowerCase()) : undefined)
  );
}

export function indexPreviousByName(rows: PreviousCharge[]) {
  const map = new Map<string, PreviousCharge>();
  for (const row of rows) {
    if (row.resident) map.set(row.resident.trim().toLowerCase(), row);
  }
  return map;
}

export function occupantAverages(previous: PreviousCharge[]) {
  const buckets = new Map<number, { water: number; sewer: number; total: number; n: number }>();
  for (const row of previous) {
    if (row.occupants <= 0) continue;
    const usage = row.water + row.sewer || row.total;
    if (usage <= 0) continue;
    const bucket = buckets.get(row.occupants) ?? { water: 0, sewer: 0, total: 0, n: 0 };
    bucket.water += row.water;
    bucket.sewer += row.sewer;
    bucket.total += usage;
    bucket.n += 1;
    buckets.set(row.occupants, bucket);
  }
  const averages = new Map<number, { water: number; sewer: number; total: number }>();
  for (const [occ, bucket] of buckets) {
    averages.set(occ, {
      water: bucket.water / bucket.n,
      sewer: bucket.sewer / bucket.n,
      total: bucket.total / bucket.n,
    });
  }
  return averages;
}
