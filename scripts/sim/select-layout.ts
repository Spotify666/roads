// Score every candidate U-turn layout in the full microsimulation (with the rest of the
// RoadFix package) at the morning, midday and evening peaks, then pick the balanced one:
// closest to the best on all four goals, never worse than today on wrong-side riding.
import { readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_ASSUMPTIONS, Simulation, type Layout } from "../../src/sim/engine";
import { PILOT_MODEL, TODAY, TODAY_OPENINGS, demandFor, fixLayout } from "../../src/sim/pilot";

const res = JSON.parse(readFileSync("data/pilot_results.json", "utf8"));
const cal = JSON.parse(readFileSync("data/pilot_calibration.json", "utf8"));
const HOURS = [9, 12, 18, 20];
const SEEDS = [101, 202];

const cands: Record<string, number[]> = {
  "Today's openings, with pockets": TODAY_OPENINGS,
  "Quick-model balanced": res.quick.balanced.openings,
};
for (const [g, v] of Object.entries<any>(res.quick.goals)) cands[`Best for ${g} (quick model)`] = v.openings;
// de-duplicate identical layouts
const seen = new Set<string>();
for (const k of Object.keys(cands)) {
  const key = cands[k].join(",");
  if (seen.has(key)) delete cands[k];
  else seen.add(key);
}

type M = { slow: number; vehH: number; vehKm: number; fuel: number; wrong: number };
function score(layout: Layout): M {
  const m: M = { slow: 0, vehH: 0, vehKm: 0, fuel: 0, wrong: 0 };
  for (const h of HOURS) {
    const c = cal.hours[h];
    for (const seed of SEEDS) {
      const sim = new Simulation(PILOT_MODEL, layout, demandFor(c.qW, c.qE, res.reverseShare), DEFAULT_ASSUMPTIONS, seed, 300);
      sim.run(3900);
      const st = sim.stats();
      const per = 1 / Math.max(1, st.trips); // per trip, so extra throughput is not penalised
      m.slow += st.slowHours * per;
      m.vehH += st.vehHours * per;
      m.vehKm += st.vehKm * per;
      m.fuel += st.fuel * per;
      m.wrong += st.wrongside;
    }
  }
  return m;
}

const today = score(TODAY);
console.log("today", JSON.stringify(today));
const scores: Record<string, M> = {};
for (const [k, o] of Object.entries(cands)) {
  scores[k] = score(fixLayout(o));
  console.log(k, o.join(","), JSON.stringify(scores[k]));
}
const keys = ["slow", "vehH", "vehKm", "fuel"] as const;
const best = Object.fromEntries(keys.map((k) => [k, Math.min(...Object.values(scores).map((s) => s[k]))])) as Record<(typeof keys)[number], number>;
let pick = "";
let regret = Infinity;
for (const [k, s] of Object.entries(scores)) {
  if (s.wrong > today.wrong) continue;
  const r = Math.max(...keys.map((g) => s[g] / best[g] - 1));
  if (r < regret) {
    regret = r;
    pick = k;
  }
}
const out = { hours: HOURS, today, candidates: Object.fromEntries(Object.entries(cands).map(([k, o]) => [k, { openings: o, score: scores[k] }])), best, pick, openings: cands[pick], regret };
writeFileSync("data/pilot_selection.json", JSON.stringify(out, null, 1));
console.log("PICK", pick, cands[pick].join(","), "within", (regret * 100).toFixed(1) + "%");
writeFileSync("data/raw/chosen.txt", cands[pick].join(","));
