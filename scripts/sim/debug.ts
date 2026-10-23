import { Simulation } from "../../src/sim/engine";
import { PILOT_MODEL, TODAY, demandFor } from "../../src/sim/pilot";
const q = Number(process.argv[2] ?? 800);
const sim = new Simulation(PILOT_MODEL, TODAY, demandFor(q, q), undefined, 7, 300);
sim.run(Number(process.argv[3] ?? 1800));
for (const cw of [0, 1] as const) {
  const bins: Record<string, number> = {};
  const states: Record<string, number> = {};
  for (const v of sim.vehicles.filter((v) => v.cw === cw)) {
    const s = Math.round(sim.sOf(cw, v.x) / 100) * 100;
    bins[s] = (bins[s] ?? 0) + 1;
    states[v.state + (v.v < 0.3 ? ":stopped" : "")] = (states[v.state + (v.v < 0.3 ? ":stopped" : "")] ?? 0) + 1;
  }
  console.log("cw", cw, JSON.stringify(states));
  console.log("  by chainage", JSON.stringify(bins));
}
// the most downstream stopped vehicle in each lane = head of queue
for (const cw of [0, 1] as const) for (let lane = 0; lane < 3; lane++) {
  const vs = sim.vehicles.filter((v) => v.cw === cw && v.lane === lane && v.state !== "pocket" && v.state !== "wrongside").sort((a, b) => b.x - a.x);
  const stopped = vs.filter((v) => v.v < 0.3);
  if (!stopped.length) continue;
  const h = stopped[0];
  const lead = vs[vs.indexOf(h) - 1];
  console.log(`cw${cw} lane${lane}: ${vs.length} veh, ${stopped.length} stopped; queue head s=${sim.sOf(cw, h.x).toFixed(0)} x=${h.x.toFixed(0)} ${h.type} state=${h.state} plan=${JSON.stringify(h.plan)} stopAt=${h.stopAt} lanesHere=${sim.lanesAt(cw, h.x)} leader=${lead ? `${lead.type}@x${lead.x.toFixed(0)} v${lead.v.toFixed(1)} ${lead.state}` : "none"}`);
}
