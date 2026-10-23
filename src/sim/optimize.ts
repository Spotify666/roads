// Where to put median U-turn openings: the quick model and exact dynamic programme.
//
// Every rider who needs to reverse drives to the next opening ahead and back, so
// their extra distance is twice the gap to that opening. Riders facing a long
// detour may go wrong-side instead. Because each rider only uses the next opening
// ahead, the total cost splits cleanly into the gaps between consecutive openings,
// and a dynamic programme over candidate sites finds the best set exactly,
// respecting a minimum spacing. Each opening also costs something: a conflict
// point that slows through traffic, more so without a waiting pocket.

export interface Origin {
  s: number; // chainage where riders join
  cw: 0 | 1; // 0 travels towards larger s, 1 towards smaller s
  perDay: number; // riders a day who need to reverse
}

export interface Goal {
  id: "congestion" | "time" | "distance" | "fuel";
  label: string;
}

export const GOALS: Goal[] = [
  { id: "congestion", label: "Least traffic" },
  { id: "time", label: "Least travel time" },
  { id: "distance", label: "Least travel distance" },
  { id: "fuel", label: "Least fuel" },
];

export interface QuickParams {
  length: number;
  throughPerDay: number; // both directions
  wrongSideThreshold: number;
  wrongSideMax: number;
  twoWheelerShare: number; // share of reversers able to go wrong-side (2W + autos)
  detourSpeed: number; // m/s while driving the detour
  waitPerUturn: number; // seconds waiting for a gap at an opening, with a pocket
  waitPenaltyNoPocket: number; // extra seconds through traffic loses per U-turn without a pocket
  throughDelayPerOpening: number; // seconds per through vehicle per opening (conflict point)
  fuelPerKm: number;
  idleLitresPerHour: number;
  minSpacing: number;
}

export interface Breakdown {
  vehKm: number; // detour vehicle-km a day
  vehHours: number; // detour + waiting + delay to through traffic, vehicle-hours a day
  stuckHours: number; // vehicle-hours a day spent queued or crawling (waiting, blocked fast lane)
  litres: number;
  wrongSide: number; // wrong-side trips a day
}

export function wrongShare(detour: number, p: QuickParams) {
  return p.twoWheelerShare * p.wrongSideMax * Math.min(1, Math.max(0, (detour - p.wrongSideThreshold) / 800));
}

/** Cost of all reversers who join between openings a and b (a < b). */
export function gapBreakdown(a: number, b: number, origins: Origin[], p: QuickParams, pocket: { a: boolean; b: boolean }): Breakdown {
  const out: Breakdown = { vehKm: 0, vehHours: 0, stuckHours: 0, litres: 0, wrongSide: 0 };
  for (const o of origins) {
    if (o.s <= a || o.s >= b) continue;
    const target = o.cw === 0 ? b : a;
    const usesPocket = o.cw === 0 ? pocket.b : pocket.a;
    const detour = 2 * Math.abs(target - o.s);
    const w = wrongShare(detour, p);
    const legal = o.perDay * (1 - w);
    out.wrongSide += o.perDay * w;
    out.vehKm += (legal * detour) / 1000;
    const wait = p.waitPerUturn + (usesPocket ? 0 : p.waitPenaltyNoPocket);
    const hours = legal * (detour / p.detourSpeed + p.waitPerUturn) / 3600;
    out.vehHours += hours + (usesPocket ? 0 : (legal * p.waitPenaltyNoPocket) / 3600);
    out.stuckHours += (legal * wait) / 3600;
    out.litres += (legal * detour * p.fuelPerKm) / 1000 + (legal * p.waitPerUturn * p.idleLitresPerHour) / 3600;
  }
  return out;
}

export function openingBreakdown(p: QuickParams, pocket: boolean): Breakdown {
  const delay = p.throughDelayPerOpening * (pocket ? 1 : 2.5);
  const hours = (p.throughPerDay * delay) / 3600;
  return { vehKm: 0, vehHours: hours, stuckHours: hours * 0.5, litres: (hours * p.idleLitresPerHour) / 2, wrongSide: 0 };
}

export type Weights = Record<Goal["id"], number>;

const VALUE: Record<Goal["id"], (b: Breakdown) => number> = {
  congestion: (b) => b.stuckHours,
  time: (b) => b.vehHours,
  distance: (b) => b.vehKm,
  fuel: (b) => b.litres,
};

function score(b: Breakdown, w: Weights, norm: Weights) {
  let s = 0;
  for (const g of GOALS) s += (w[g.id] * VALUE[g.id](b)) / norm[g.id];
  return s;
}

export function add(a: Breakdown, b: Breakdown): Breakdown {
  return {
    vehKm: a.vehKm + b.vehKm,
    vehHours: a.vehHours + b.vehHours,
    stuckHours: a.stuckHours + b.stuckHours,
    litres: a.litres + b.litres,
    wrongSide: a.wrongSide + b.wrongSide,
  };
}

/** Total breakdown of a layout (openings sorted; the corridor ends act as junction U-turns). */
export function evaluate(openings: { s: number; pocket: boolean }[], origins: Origin[], p: QuickParams): Breakdown {
  const pts = [{ s: 0, pocket: true }, ...[...openings].sort((x, y) => x.s - y.s), { s: p.length, pocket: true }];
  let total: Breakdown = { vehKm: 0, vehHours: 0, stuckHours: 0, litres: 0, wrongSide: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    total = add(total, gapBreakdown(pts[i].s, pts[i + 1].s, origins, p, { a: pts[i].pocket, b: pts[i + 1].pocket }));
  }
  for (const o of openings) total = add(total, openingBreakdown(p, o.pocket));
  return total;
}

/**
 * Exact optimum over candidate sites for a weighted goal. New openings always get a
 * waiting pocket (a fixed safety rule); `maxWrongSide` caps wrong-side trips a day.
 */
export function optimise(candidates: number[], origins: Origin[], p: QuickParams, w: Weights, norm: Weights) {
  const c = [0, ...[...candidates].sort((a, b) => a - b), p.length];
  const n = c.length;
  const best = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  best[0] = 0;
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < j; i++) {
      if (!isFinite(best[i])) continue;
      if (c[j] - c[i] < p.minSpacing && i !== 0 && j !== n - 1) continue;
      const gap = gapBreakdown(c[i], c[j], origins, p, { a: true, b: true });
      const open = j === n - 1 ? { vehKm: 0, vehHours: 0, stuckHours: 0, litres: 0, wrongSide: 0 } : openingBreakdown(p, true);
      const v = best[i] + score(add(gap, open), w, norm);
      if (v < best[j]) {
        best[j] = v;
        prev[j] = i;
      }
    }
  }
  const chosen: number[] = [];
  for (let j = prev[n - 1]; j > 0; j = prev[j]) chosen.push(c[j]);
  return chosen.sort((a, b) => a - b);
}
