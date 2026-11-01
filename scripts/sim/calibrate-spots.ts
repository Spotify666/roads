// Calibrate every spot's corridor (data/corridors/<id>.json) to TomTom and precompute the Lab's
// reference runs, writing public/data/corridors/<id>.json for the browser.
//
// As for the pilot: for each hour, the through demand per direction is bisected until the simulated
// "today" end-to-end time over its free-flow time matches TomTom's typical ratio for that direction.
// One-direction corridors use the same demand both ways. Then "today" and the spot's suggested fix
// run with the Lab's own settings and seed, so a visitor's design is compared like with like.
//
//   npx tsx scripts/sim/calibrate-spots.ts [--shard i/n] [--force] [ids...]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { LAB_RUN, makeSim, measure, runDesign, suggestedDesign, todayDesign, type Corridor, type Metrics } from "../../src/sim/scenario";

const args = process.argv.slice(2);
const shardArg = args.indexOf("--shard");
const [shard, shards] = shardArg >= 0 ? args[shardArg + 1].split("/").map(Number) : [0, 1];
const force = args.includes("--force");
const only = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--shard");

const SRC = "data/corridors";
const OUT = "public/data/corridors";
mkdirSync(OUT, { recursive: true });
const HOURS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 17, 18, 19, 20, 21, 22];
const REVERSE = 0.18;

type Raw = Omit<Corridor, "cal" | "baseline" | "plan" | "planLabel" | "bayStops" | "places" | "reverseShare" | "fix"> & {
  targets: Record<string, [number, number | null]>;
  fix: { type: string; title: string };
};

const files = readdirSync(SRC)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .filter((_, i) => i % shards === shard)
  .filter((f) => !only.length || only.includes(f.replace(".json", "")));

for (const f of files) {
  const id = f.replace(".json", "");
  if (!force && existsSync(`${OUT}/${id}.json`)) continue;
  const t0 = Date.now();
  const raw = JSON.parse(readFileSync(`${SRC}/${f}`, "utf8")) as Raw;
  const bayStops = [...new Set(raw.model.busStops.filter((b) => b.major).map((b) => b.s))];
  const places = [
    { s: 0, name: raw.toward[1] },
    ...raw.model.signals.map((s) => ({ s: s.s, name: s.name ?? "Signal" })),
    ...(raw.spotS != null && !raw.model.signals.some((s) => Math.abs(s.s - raw.spotS!) < 120) ? [{ s: raw.spotS, name: raw.name }] : []),
    { s: raw.length, name: raw.toward[0] },
  ];
  const corridor: Omit<Corridor, "cal" | "baseline" | "plan" | "planLabel"> = {
    id,
    name: raw.name,
    length: raw.length,
    spotS: raw.spotS,
    toward: raw.toward,
    heading: raw.heading,
    model: raw.model,
    openings: raw.openings,
    fixedOpenings: raw.fixedOpenings,
    medians: raw.medians,
    blocked: raw.blocked,
    bayStops,
    places,
    fix: raw.fix,
    reverseShare: REVERSE,
  };
  const today = todayDesign(corridor);
  const run = (qW: number, qE: number, seed = LAB_RUN.seed) => {
    const sim = makeSim(today, 0, { ...corridor, cal: { "0": { qW, qE } } }, seed);
    sim.run(LAB_RUN.warmup + LAB_RUN.measure, LAB_RUN.dt);
    return measure(sim).thr;
  };

  // free-flow end-to-end time each way, averaged over three light-traffic runs
  const freeSpeed = 42 / 3.6;
  const base: [number, number] = [0, 0];
  for (const seed of [1, 2, 3]) {
    const t = run(120, 120, seed);
    base[0] += (t[0] ?? corridor.length / freeSpeed) / 3;
    base[1] += (t[1] ?? corridor.length / freeSpeed) / 3;
  }

  const entryLanes = [corridor.model.lanes[0].w, corridor.model.lanes[corridor.model.lanes.length - 1].e];
  const sugg = suggestedDesign(corridor);
  const cal: Corridor["cal"] = {};
  const baseline: Corridor["baseline"] = {};
  for (const h of HOURS) {
    const target = raw.targets[String(h)];
    if (!target) continue;
    const [tA, tB] = target;
    // Near capacity the slowdown is steep and noisy, so every trial counts: each direction keeps the demand
    // whose run came closest to TomTom, and the Lab's "today" is a run at exactly those demands.
    const hi = entryLanes.map((n) => 1200 * n + 1200);
    const best = [
      { q: 600, err: Infinity },
      { q: 600, err: Infinity },
    ];
    const goal = [tA, tB ?? tA];
    // the pair of demands whose own run came closest in both directions at once
    let joint = { q: [600, 600], err: Infinity };
    const trial = (qa: number, qb: number) => {
      const qB = tB == null ? qa : qb;
      const t = run(qa, qB);
      // a direction that completes no trips is gridlocked: far over any target
      const got = [t[0] == null ? 9 : t[0] / base[0], t[1] == null ? 9 : t[1] / base[1]];
      ;[qa, qb].forEach((qd, d) => {
        const err = Math.abs(got[d] - goal[d]);
        if (err < best[d].err) best[d] = { q: qd, err };
      });
      const both = Math.max(Math.abs(got[0] - goal[0]), tB == null ? 0 : Math.abs(got[1] - goal[1]));
      if (both < joint.err) joint = { q: [qa, qB], err: both };
      return got;
    };
    const lo = [80, 80];
    const up = [...hi];
    for (let it = 0; it < 10; it++) {
      const q = [(lo[0] + up[0]) / 2, (lo[1] + up[1]) / 2];
      const got = trial(q[0], q[1]);
      for (const d of [0, 1]) {
        if (got[d] < goal[d]) lo[d] = q[d];
        else up[d] = q[d];
      }
      if (Math.max(best[0].err, tB == null ? 0 : best[1].err) < 0.03) break;
    }
    for (const d of tB == null ? [0] : [0, 1]) {
      if (best[d].err <= 0.04) continue;
      // scan the whole range, then the neighbourhood of the closest point
      for (let k = 1; k <= 12; k++) {
        const v = 80 + ((hi[d] - 80) * k) / 13;
        if (d === 0) trial(v, best[1].q);
        else trial(best[0].q, v);
      }
      const c0 = best[d].q;
      for (let dv = -180; dv <= 180; dv += 30) {
        if (!dv || c0 + dv < 80) continue;
        if (d === 0) trial(c0 + dv, best[1].q);
        else trial(best[0].q, c0 + dv);
        if (best[d].err < 0.03) break;
      }
    }
    // the two directions share side roads and signals, so try the per-direction picks together and nearby
    if (joint.err > 0.03) {
      for (const f of [1, 0.98, 1.02, 0.96, 1.04]) {
        trial(best[0].q * f, best[1].q * f);
        if (joint.err < 0.03) break;
      }
    }
    const q = joint.q;
    const demand = { qW: Math.round(q[0]), qE: Math.round(q[1]) };
    const sc = { ...corridor, cal: { [String(h)]: demand } };
    const todayRuns = runDesign(today, h, sc);
    const last = todayRuns[todayRuns.length - 1];
    const r = (m: Metrics, d: 0 | 1) => (m.thr[d] == null ? null : Math.round((m.thr[d]! / base[d]) * 1000) / 1000);
    cal[String(h)] = { ...demand, target: [tA, tB], got: [r(last, 0) ?? 0, tB == null ? null : r(last, 1)] };
    const round = (m: Metrics): Metrics => JSON.parse(JSON.stringify(m, (_, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v)));
    baseline[String(h)] = { today: todayRuns.map(round), plan: sugg ? runDesign(sugg.design, h, sc).map(round) : null };
  }

  const out: Corridor & { base: [number, number]; source?: string } = {
    ...corridor,
    cal,
    baseline,
    plan: sugg?.design ?? null,
    planLabel: sugg?.label ?? null,
    base: [Math.round(base[0]), Math.round(base[1])],
  };
  writeFileSync(`${OUT}/${id}.json`, JSON.stringify(out));
  const err = Object.values(cal).flatMap((c) => [Math.abs(c.got[0] - c.target[0]), c.target[1] == null || c.got[1] == null ? 0 : Math.abs(c.got[1] - c.target[1])]);
  console.log(`${id.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(0)}s  max error ${Math.max(...err).toFixed(2)}×  plan: ${sugg?.label ?? "none"}`);
}
