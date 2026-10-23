// Precompute the Simulation Lab's reference runs: today and the RoadFix plan at every
// calibrated hour, with the same run settings the browser uses for a visitor's design.
import { readFileSync, writeFileSync } from "node:fs";
import { CHECKPOINT, LAB_RUN, TODAY_DESIGN, planDesign, runDesign, type Metrics } from "../../src/sim/scenario";

const cal = JSON.parse(readFileSync("data/pilot_calibration.json", "utf8")).hours;
const res = JSON.parse(readFileSync("data/pilot_results.json", "utf8"));
const plan = planDesign(res.layout.openings);
const hours = Object.keys(cal).map(Number).filter((h) => h >= 6).sort((a, b) => a - b);
const out: Record<string, { today: Metrics[]; plan: Metrics[] }> = {};
const r = (m: Metrics) => JSON.parse(JSON.stringify(m, (_, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));
for (const h of hours) {
  const t0 = Date.now();
  out[h] = { today: runDesign(TODAY_DESIGN, h, cal, undefined, res.reverseShare).map(r), plan: runDesign(plan, h, cal, undefined, res.reverseShare).map(r) };
  console.log(h, `${Date.now() - t0}ms`, "today", out[h].today.at(-1)!.thr.map((x) => Math.round(x ?? 0)).join("/"), "plan", out[h].plan.at(-1)!.thr.map((x) => Math.round(x ?? 0)).join("/"));
}
writeFileSync("src/data/lab_baseline.json", JSON.stringify({ run: LAB_RUN, checkpoint: CHECKPOINT, reverseShare: res.reverseShare, planOpenings: res.layout.openings, hours: out }));
