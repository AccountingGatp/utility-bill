import type { PreviousCharge, RosterUnit } from "../types.js";
import { occupancyMultiplier, round2, unitKey, calendarDay } from "../parse/helpers.js";
import { occupantAverages } from "../parse/roster.js";

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function modeAmounts(values: number[]) {
  const freq = new Map<number, number>();
  for (const value of values) {
    const rounded = round2(value);
    if (rounded <= 0) continue;
    freq.set(rounded, (freq.get(rounded) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([value]) => value);
}

export function wsTotal(row: PreviousCharge) {
  return row.water + row.sewer || row.total;
}

export function rowBases(row: PreviousCharge) {
  if (row.waterBase > 0 || row.sewerBase > 0) return row.waterBase + row.sewerBase;
  const ws = row.water + row.sewer;
  if (ws > 0 && row.total > ws) return row.total - ws;
  return 0;
}

function deriveCombinedTierBases(previous: PreviousCharge[]) {
  const combined = previous
    .filter((row) => row.combinedIncludesBases)
    .map((row) => row.total)
    .filter((value) => value > 0);
  if (combined.length < 2) return 0;

  const modes = modeAmounts(combined);
  if (modes.length >= 2) {
    const low = modes[0];
    const high = modes.find((value) => value > low) ?? modes[1];
    const bases = round2(2 * low - high);
    if (bases > 0 && high - low >= 30) return bases;
  }
  return 0;
}

export function deriveBasesFromCapExcess(
  previous: PreviousCharge[],
  roster: RosterUnit[],
  capsByTier: Map<number, number>,
) {
  const rosterByUnit = new Map(roster.map((unit) => [unitKey(unit.displayUnit), unit]));
  const excess: number[] = [];
  for (const row of previous) {
    const unit = rosterByUnit.get(unitKey(row.unit));
    if (!unit) continue;
    const tier = bedroomTier(unit);
    const cap = capsByTier.get(tier) ?? row.cap;
    const ws = wsTotal(row);
    if (cap > 0 && ws > cap + 0.01) excess.push(ws - cap);
  }
  return round2(median(excess));
}

export function deriveBases(previous: PreviousCharge[], roster: RosterUnit[] = []) {
  const fromColumns = previous
    .map((row) => row.waterBase + row.sewerBase)
    .filter((value) => value > 0);
  if (fromColumns.length > 0) return round2(median(fromColumns));

  const inferred = previous.map((row) => rowBases(row)).filter((value) => value > 0);
  if (inferred.length > 0) return round2(median(inferred));

  const combinedBases = deriveCombinedTierBases(previous);
  if (combinedBases > 0) return combinedBases;

  if (roster.length > 0) {
    const capsByTier = deriveCapsByTier(previous, roster);
    const capBases = deriveBasesFromCapExcess(previous, roster, capsByTier);
    if (capBases > 0) return capBases;
  }

  return 0;
}

export function deriveWaterShare(previous: PreviousCharge[]) {
  let water = 0;
  let sewer = 0;
  for (const row of previous) {
    water += row.water;
    sewer += row.sewer;
  }
  const total = water + sewer;
  return total > 0 ? water / total : null;
}

export function deriveWsCapByOccupants(previous: PreviousCharge[]) {
  const caps = new Map<number, number>();
  for (const row of previous) {
    if (row.occupants <= 0) continue;
    const ws = wsTotal(row);
    if (ws <= 0) continue;
    caps.set(row.occupants, Math.max(caps.get(row.occupants) ?? 0, ws));
  }
  for (const row of previous) {
    if (row.cap <= 0 || row.occupants <= 0) continue;
    caps.set(row.occupants, Math.max(caps.get(row.occupants) ?? 0, row.cap));
  }
  return caps;
}

export function deriveUtilityCapByOccupants(
  previous: PreviousCharge[],
  field: "electric" | "gas",
) {
  const caps = new Map<number, number>();
  for (const row of previous) {
    if (row.occupants <= 0) continue;
    const amount = row[field];
    if (amount <= 0) continue;
    caps.set(row.occupants, Math.max(caps.get(row.occupants) ?? 0, amount));
  }
  return caps;
}

export function wsCapForOccupants(caps: Map<number, number>, occupants: number) {
  if (occupants <= 0) return 0;
  if (caps.has(occupants)) return caps.get(occupants)!;
  let best = 0;
  for (const [occ, cap] of caps) {
    if (occ <= occupants) best = Math.max(best, cap);
  }
  return best;
}

/** Mila bills electric/gas at the 1- or 2-person tier maximums from the prior file. */
export function milaUtilityOccTier(occupants: number) {
  if (occupants <= 1) return 1;
  return 2;
}

/** Full-month bill for move-ins shortly before the charge date (after the SAWS cycle ends). */
export function postCycleFullMonth(
  moveIn: Date | null,
  cycleEnd: Date,
  due: Date,
) {
  if (!moveIn) return null;
  const moveDay = calendarDay(moveIn);
  const endDay = calendarDay(cycleEnd);
  const dueDay = calendarDay(due);
  if (moveDay <= endDay || moveDay > dueDay) return null;
  const daysBeforeDue = Math.round((dueDay - moveDay) / 86_400_000);
  if (daysBeforeDue <= 7) return 1;
  return null;
}

export function scaledPrevAmount(prev: PreviousCharge, currentOcc: number) {
  const ws = prev.water + prev.sewer;
  const total = prev.total || ws;
  const bases = rowBases(prev);
  if (prev.occupants > 0 && prev.occupants !== currentOcc && ws > 0) {
    const prevMult = occupancyMultiplier(prev.occupants);
    const curMult = occupancyMultiplier(currentOcc);
    return (ws / prevMult) * curMult + bases;
  }
  return total;
}

export function scaleWeight(
  prev: PreviousCharge,
  occupants: number,
  billable: boolean,
  ratio: number,
) {
  const amount = scaledPrevAmount(prev, occupants);
  if (amount <= 0) return 0;
  if (billable) return amount;
  return amount * (1 - ratio);
}

export function isSmallFloorplan(unit: RosterUnit) {
  const code = unit.type.trim().toUpperCase();
  if (code.startsWith("A") || code.startsWith("E") || code.includes("STUDIO")) return true;
  return !code && unit.sqft > 0 && unit.sqft <= 775;
}

export function deriveSizeCaps(previous: PreviousCharge[], roster: RosterUnit[]) {
  const rosterByUnit = new Map(roster.map((unit) => [unitKey(unit.displayUnit), unit]));
  const bases = deriveBases(previous, roster);
  let small = 0;
  let large = 0;
  for (const row of previous) {
    const unit = rosterByUnit.get(unitKey(row.unit));
    if (!unit) continue;
    const usage = Math.max(0, wsTotal(row) - (row.combinedIncludesBases ? bases : rowBases(row)));
    if (usage <= 0) continue;
    if (isSmallFloorplan(unit)) small = Math.max(small, usage);
    else large = Math.max(large, usage);
  }
  return { small, large, bases };
}

export function deriveStdUsage(previous: PreviousCharge[], bases: number, occupants: number) {
  const averages = occupantAverages(previous);
  const avg = averages.get(occupants)?.total ?? 0;
  if (avg > bases) return avg - bases;
  let maxUsage = 0;
  for (const row of previous) {
    if (row.occupants !== occupants) continue;
    const usage = Math.max(0, wsTotal(row) - (row.combinedIncludesBases ? bases : rowBases(row)));
    maxUsage = Math.max(maxUsage, usage);
  }
  return maxUsage;
}

export function bedroomTier(unit: RosterUnit) {
  const type = unit.type.toUpperCase();
  if (/13|3BR|DLR|C1|D1/.test(type) || unit.sqft >= 1150) return 3;
  if (/B5|2BR|^B/.test(type) || unit.sqft >= 800) return 2;
  return 1;
}

export function deriveCapsByTier(previous: PreviousCharge[], roster: RosterUnit[]) {
  const rosterByUnit = new Map(roster.map((unit) => [unitKey(unit.displayUnit), unit]));
  const caps = new Map<number, number>();
  for (const row of previous) {
    const unit = rosterByUnit.get(unitKey(row.unit));
    if (!unit) continue;
    const tier = bedroomTier(unit);
    const cap = row.cap > 0 ? row.cap : 0;
    const usage = cap > 0 ? cap : Math.max(0, wsTotal(row) - rowBases(row));
    if (usage > 0) caps.set(tier, Math.max(caps.get(tier) ?? 0, usage));
  }
  return caps;
}

export function splitWaterSewer(
  amount: number,
  prevWater: number,
  prevSewer: number,
  propertyShare: number | null,
) {
  if (prevWater + prevSewer > 0) {
    const share = prevWater / (prevWater + prevSewer);
    return { water: round2(amount * share), sewer: round2(amount * (1 - share)) };
  }
  const share = propertyShare ?? 0.5;
  return { water: round2(amount * share), sewer: round2(amount * (1 - share)) };
}
