// Find, for each hour, the through demand per direction at which the simulated
// "today" corridor reproduces TomTom's typical slowdown (historic / free-flow time).
import { writeFileSync, readFileSync } from "node:fs";
import { Simulation } from "../../src/sim/engine";
import { PILOT_MODEL, TODAY, demandFor } from "../../src/sim/pilot";

const prof = JSON.parse(readFileSync("data/pilot_profile.json", "utf8"));
const ratio = (rows: any[], hour: number) => {
  const r = rows.find((x: any) => x.hour === hour);
  const ff = r.legs.reduce((a: number, l: number[]) => a + l[1], 0);
  const hi = r.legs.reduce((a: number, l: number[]) => a + l[2], 0);
  return hi / ff;
};

function simulate(qW: number, qE: number, seed: number, secs = 2400) {
  const sim = new Simulation(PILOT_MODEL, TODAY, demandFor(qW, qE), undefined, seed, 300);
  sim.run(secs + 300);
  return sim.stats().avgThroughTime;
}

const base = [0, 0];
for (const seed of [1, 2, 3]) {
  const t = simulate(120, 120, seed);
  base[0] += t[0] / 3;
  base[1] += t[1] / 3;
}
console.log("free-flow through time", base.map((x) => x.toFixed(0)));

const out: Record<string, any> = { base, hours: {} };
for (const row of prof.west.weekday) {
  const h = row.hour;
  const target = [ratio(prof.west.weekday, h), ratio(prof.east.weekday, h)];
  const lo = [80, 80], hi = [4600, 4600];
  let q = [600, 600], got = [1, 1];
  for (let it = 0; it < 11; it++) {
    q = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    const t = simulate(q[0], q[1], 10 + it);
    got = [t[0] / base[0], t[1] / base[1]];
    for (const d of [0, 1]) {
      if (got[d] < target[d]) lo[d] = q[d];
      else hi[d] = q[d];
    }
    if (Math.abs(got[0] - target[0]) < 0.03 && Math.abs(got[1] - target[1]) < 0.03) break;
  }
  out.hours[h] = { qW: Math.round(q[0]), qE: Math.round(q[1]), target, got };
  console.log(h, JSON.stringify(out.hours[h]));
  writeFileSync("data/pilot_calibration.json", JSON.stringify(out, null, 1));
}
