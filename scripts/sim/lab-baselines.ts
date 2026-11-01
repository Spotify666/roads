// Precompute the Simulation Lab's reference runs for the pilot: today and the RoadFix plan at every
// calibrated hour, with the same run settings the browser uses for a visitor's design.
import { readFileSync, writeFileSync } from "node:fs";
import { BAY_STOPS, PILOT_MODEL, TODAY_OPENINGS } from "../../src/sim/pilot";
import { CHECKPOINT, LAB_RUN, runDesign, todayDesign, type Metrics } from "../../src/sim/scenario";

const cal = JSON.parse(readFileSync("data/pilot_calibration.json", "utf8")).hours;
const res = JSON.parse(readFileSync("data/pilot_results.json", "utf8"));
const corridor = { model: PILOT_MODEL, fixedOpenings: [], bayStops: BAY_STOPS, reverseShare: res.reverseShare, cal };
const today = todayDesign({ openings: TODAY_OPENINGS });
const plan = { ...today, openings: res.layout.openings.map((s: number) => ({ s, pocket: true })), busBays: true, autoBays: true, clearKerb: true };
const hours = Object.keys(cal).map(Number).filter((h) => h >= 6).sort((a, b) => a - b);
const out: Record<string, { today: Metrics[]; plan: Metrics[] }> = {};
const r = (m: Metrics) => JSON.parse(JSON.stringify(m, (_, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));
for (const h of hours) {
  const t0 = Date.now();
  out[h] = { today: runDesign(today, h, corridor).map(r), plan: runDesign(plan, h, corridor).map(r) };
  console.log(h, `${Date.now() - t0}ms`, "today", out[h].today.at(-1)!.thr.map((x) => Math.round(x ?? 0)).join("/"), "plan", out[h].plan.at(-1)!.thr.map((x) => Math.round(x ?? 0)).join("/"));
}
writeFileSync("src/data/lab_baseline.json", JSON.stringify({ run: LAB_RUN, checkpoint: CHECKPOINT, reverseShare: res.reverseShare, planOpenings: res.layout.openings, hours: out }));
