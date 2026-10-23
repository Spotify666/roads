// For hours where TomTom shows free flow, use the highest demand that still runs freely,
// rather than the lowest demand the first pass settled on.
import { readFileSync, writeFileSync } from "node:fs";
import { Simulation } from "../../src/sim/engine";
import { PILOT_MODEL, TODAY, demandFor } from "../../src/sim/pilot";

const cal = JSON.parse(readFileSync("data/pilot_calibration.json", "utf8"));
const base = cal.base as number[];
for (const [hs, row] of Object.entries<any>(cal.hours)) {
  if (Math.max(...row.target) > 1.03) continue;
  const lo = [80, 80], hi = [3000, 3000];
  let got = [1, 1];
  for (let it = 0; it < 9; it++) {
    const q = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    const sim = new Simulation(PILOT_MODEL, TODAY, demandFor(q[0], q[1]), undefined, 40 + it, 300);
    sim.run(2700);
    const t = sim.stats().avgThroughTime;
    const g = [t[0] / base[0], t[1] / base[1]];
    for (const d of [0, 1]) {
      if (g[d] <= row.target[d] + 0.03) { lo[d] = q[d]; got[d] = g[d]; } else hi[d] = q[d];
    }
  }
  row.qW = Math.round(lo[0]);
  row.qE = Math.round(lo[1]);
  row.got = got;
  row.rule = "highest free-flowing demand";
  console.log(hs, row.qW, row.qE, got);
}
writeFileSync("data/pilot_calibration.json", JSON.stringify(cal, null, 1));
