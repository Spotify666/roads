// Runs the RoadFix optimiser on the pilot corridor and checks the result in the microsimulation.
//   1. Quick model + exact DP for each of the four goals, then a balanced layout.
//   2. Microsimulation of today vs the RoadFix package at every calibrated hour (2 seeds).
//   3. Attribution: which part of the package does what, at the evening peak.
import { readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_ASSUMPTIONS, Simulation, type Layout } from "../../src/sim/engine";
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
const steps = [0, 0.5, 1];
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

// ---- microsimulation check ----
type Row = { vehHours: number; vehKm: number; fuel: number; slowHours: number; wrongside: number; uturns: number; trips: number; thrW: number; thrE: number; queued: number };
function micro(layout: Layout, h: number, seeds = [101, 202]): Row {
  const acc: Row = { vehHours: 0, vehKm: 0, fuel: 0, slowHours: 0, wrongside: 0, uturns: 0, trips: 0, thrW: 0, thrE: 0, queued: 0 };
  for (const seed of seeds) {
    const sim = new Simulation(PILOT_MODEL, layout, demandFor(qAt(h, "qW"), qAt(h, "qE"), REVERSE), A, seed, 300);
    sim.run(3600 + 300);
    const st = sim.stats();
    acc.vehHours += st.vehHours / seeds.length;
    acc.vehKm += st.vehKm / seeds.length;
    acc.fuel += st.fuel / seeds.length;
    acc.slowHours += st.slowHours / seeds.length;
    acc.wrongside += st.wrongside / seeds.length;
    acc.uturns += st.uturns / seeds.length;
    acc.trips += st.trips / seeds.length;
    acc.thrW += st.avgThroughTime[0] / seeds.length;
    acc.thrE += st.avgThroughTime[1] / seeds.length;
    acc.queued += sim.queued / seeds.length;
  }
  return acc;
}

const fix = fixLayout(balanced!.openings);
const hours: Record<number, { today: Row; fix: Row }> = {};
for (const h of calHours) {
  const t0 = Date.now();
  hours[h] = { today: micro(TODAY, h), fix: micro(fix, h) };
  const t = hours[h].today, f = hours[h].fix;
  console.log(`${String(h).padStart(2)}:00 today vehH ${t.vehHours.toFixed(0)} slow ${t.slowHours.toFixed(0)} thr ${t.thrW.toFixed(0)}/${t.thrE.toFixed(0)}s | fix vehH ${f.vehHours.toFixed(0)} slow ${f.slowHours.toFixed(0)} thr ${f.thrW.toFixed(0)}/${f.thrE.toFixed(0)}s  trips ${t.trips.toFixed(0)}/${f.trips.toFixed(0)} wrong ${t.wrongside.toFixed(0)}/${f.wrongside.toFixed(0)}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  writeFileSync("data/pilot_results.partial.json", JSON.stringify(hours));
}

// attribution at the evening peak
const PEAK = 18;
const parts = {
  openings: fixLayout(balanced!.openings, { bays: false, autos: false, kerb: false }),
  bays: { ...TODAY, busBays: fix.busBays },
  autos: { ...TODAY, autoBays: true },
  kerb: { ...TODAY, clearKerb: true },
};
const attribution: Record<string, Row> = {};
for (const [k, layout] of Object.entries(parts)) {
  attribution[k] = micro(layout, PEAK);
  console.log("attribution", k, attribution[k].vehHours.toFixed(0), attribution[k].slowHours.toFixed(0));
}

// costs
const added = balanced!.openings.filter((s) => !TODAY_OPENINGS.some((t) => Math.abs(t - s) < 30));
const kept = balanced!.openings.filter((s) => TODAY_OPENINGS.some((t) => Math.abs(t - s) < 30));
const closed = TODAY_OPENINGS.filter((t) => !balanced!.openings.some((s) => Math.abs(t - s) < 30));
const cost = {
  newOpenings: added.length * COSTS.newOpeningWithPocket,
  pockets: kept.length * COSTS.pocketOnExisting,
  closures: closed.length * COSTS.closeOpening,
  busBays: fix.busBays.length * COSTS.busBay,
  autoBays: COSTS.autoBays,
  kerb: COSTS.kerbClearance,
};

writeFileSync(
  "data/pilot_results.json",
  JSON.stringify(
    {
      quick: {
        params: P,
        origins,
        today: { openings: TODAY_OPENINGS, breakdown: today },
        goals: Object.fromEntries(GOALS.map((g) => [g.id, goalBest[g.id]])),
        balanced,
      },
      layout: { openings: balanced!.openings, added, kept, closed, busBays: fix.busBays, autoBays: true, clearKerb: true },
      cost,
      hours,
      attribution: { hour: PEAK, today: hours[PEAK].today, parts: attribution },
      blocked: BLOCKED,
      reverseShare: REVERSE,
      sideShare: SIDE,
    },
    null,
    1,
  ),
);
console.log("cost", cost);
