// Runs the RoadFix optimiser on the pilot corridor and checks the result in the microsimulation.
//   1. Quick model + exact DP for each of the four goals, then a balanced layout.
//   2. Microsimulation of today vs the RoadFix package at every calibrated hour (2 seeds).
//   3. Attribution: which part of the package does what, at the evening peak.
import { readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_ASSUMPTIONS } from "../../src/sim/engine";
import { BLOCKED, COSTS, PILOT_MODEL, TODAY, TODAY_OPENINGS, buildable, demandFor, fixLayout } from "../../src/sim/pilot";
import { GOALS, evaluate, optimise, type Origin, type QuickParams, type Weights } from "../../src/sim/optimize";

const cal = JSON.parse(readFileSync("data/pilot_calibration.json", "utf8"));
const calHours = Object.keys(cal.hours).map(Number).sort((a, b) => a - b);
const qAt = (h: number, d: "qW" | "qE") => {
  const exact = cal.hours[h];
  if (exact) return exact[d];
  const lo = [...calHours].reverse().find((x) => x < h) ?? calHours[calHours.length - 1];
  const hi = calHours.find((x) => x > h) ?? calHours[0];
  const span = ((hi - lo + 24) % 24) || 24;
  const t = ((h - lo + 24) % 24) / span;
  return cal.hours[lo][d] + (cal.hours[hi][d] - cal.hours[lo][d]) * t;
};
const daily = { W: 0, E: 0 };
for (let h = 0; h < 24; h++) {
  daily.W += qAt(h, "qW");
  daily.E += qAt(h, "qE");
}
const REVERSE = 0.18;
const SIDE = 0.32;
const roads = PILOT_MODEL.sideRoads;
const wsum = [0, 0];
for (const r of roads) wsum[r.cw] += r.weight;
const origins: Origin[] = roads.map((r) => ({
  s: r.s,
  cw: r.cw,
  perDay: ((r.cw === 0 ? daily.W : daily.E) * SIDE * REVERSE * r.weight) / wsum[r.cw],
}));

const A = DEFAULT_ASSUMPTIONS;
const mixFuel = Object.entries(A.mix).reduce((s, [k, m]) => s + m * A.fuelPerKm[k as keyof typeof A.fuelPerKm], 0);
const mixIdle = Object.entries(A.mix).reduce((s, [k, m]) => s + m * A.idleLitresPerHour[k as keyof typeof A.idleLitresPerHour], 0);
const P: QuickParams = {
  length: PILOT_MODEL.length,
  throughPerDay: daily.W + daily.E,
  wrongSideThreshold: A.wrongSideThreshold,
  wrongSideMax: A.wrongSideMax,
  twoWheelerShare: A.mix["2w"] + A.mix.auto,
  detourSpeed: 20 / 3.6,
  waitPerUturn: 18,
  waitPenaltyNoPocket: 25,
  throughDelayPerOpening: 0.6,
  fuelPerKm: mixFuel,
  idleLitresPerHour: mixIdle,
  minSpacing: 250,
};

const candidates: number[] = [];
for (let s = 150; s < P.length - 100; s += 50) if (buildable(s)) candidates.push(s);
for (const s of TODAY_OPENINGS) if (!candidates.includes(s)) candidates.push(s);

const today = evaluate(TODAY.openings, origins, P);
const norm: Weights = { congestion: today.stuckHours, time: today.vehHours, distance: today.vehKm, fuel: today.litres };
const val = (b: typeof today) => ({ congestion: b.stuckHours, time: b.vehHours, distance: b.vehKm, fuel: b.litres });
const SAFETY = 0.6; // weight on wrong-side trips, so no layout buys distance with wrong-side riding

const withSafety = (w: Weights) => ({ ...w });
function solve(w: Weights) {
  // fold wrong-side riding into every goal as a safety term
  const layout = optimise(candidates, origins.map((o) => o), P, withSafety(w), norm);
  return layout;
}
const goalBest: Record<string, { openings: number[]; breakdown: typeof today }> = {};
for (const g of GOALS) {
  const w = { congestion: 0, time: 0, distance: 0, fuel: 0, [g.id]: 1 } as Weights;
  let openings = solve(w);
  let b = evaluate(openings.map((s) => ({ s, pocket: true })), origins, P);
  // fixed rule: no increase in wrong-side riding
  let k = 0;
  while (b.wrongSide > today.wrongSide && k++ < 12) {
    const w2 = { ...w };
    for (const key of Object.keys(w2) as (keyof Weights)[]) w2[key] += SAFETY * k * 0.25;
    openings = solve(w2);
    b = evaluate(openings.map((s) => ({ s, pocket: true })), origins, P);
  }
  goalBest[g.id] = { openings, breakdown: b };
  console.log(g.id, openings, JSON.stringify(val(b)), "wrong", b.wrongSide.toFixed(0));
}
const bestVal = Object.fromEntries(GOALS.map((g) => [g.id, val(goalBest[g.id].breakdown)[g.id]])) as Weights;

// balanced: search weight combinations, keep the layout whose worst goal is closest to its best
let balanced: { openings: number[]; regret: number; breakdown: typeof today } | null = null;
const steps = [0, 0.25, 0.5, 0.75, 1, 1.5, 2];
for (const a of steps) for (const b of steps) for (const c of steps) for (const d of steps) {
  if (!a && !b && !c && !d) continue;
  const w: Weights = { congestion: a, time: b, distance: c, fuel: d };
  const openings = solve(w);
  const br = evaluate(openings.map((s) => ({ s, pocket: true })), origins, P);
  if (br.wrongSide > today.wrongSide) continue;
  const v = val(br);
  const regret = Math.max(...GOALS.map((g) => v[g.id] / bestVal[g.id] - 1));
  if (!balanced || regret < balanced.regret - 1e-9) balanced = { openings, regret, breakdown: br };
}
console.log("balanced", balanced!.openings, "within", (balanced!.regret * 100).toFixed(1) + "%");


console.log("today", JSON.stringify(val(today)), "wrong", today.wrongSide.toFixed(0));
for (const g of GOALS) console.log(g.id, goalBest[g.id].openings.join(","), JSON.stringify(val(goalBest[g.id].breakdown)));
console.log("BAL", balanced!.openings.join(","), (balanced!.regret*100).toFixed(1)+"%", JSON.stringify(val(balanced!.breakdown)), "wrong", balanced!.breakdown.wrongSide.toFixed(0));
// also brute-force: evaluate every subset-size optimum for size k by penalising count
