// A road design the visitor builds in the Simulation Lab, how it maps onto the engine,
// what it costs, and the measurements taken from one run. Shared by the browser worker
// and the scripts that calibrate corridors and precompute their baselines, so all measure the same way.
import { DEFAULT_ASSUMPTIONS, Simulation, type CorridorModel, type Layout } from "./engine";
import { COSTS, demandFor } from "./pilot";

/** Main-road share of each signal cycle unless a design changes it. */
export const DEFAULT_GREEN = 0.45;

export interface Metrics {
  thr: [number | null, number | null]; // mean end-to-end time, s (null: direction closed or no trips)
  slow: number; // seconds crawling under 10 km/h, per trip
  fuel: number; // litres per trip
  dist: number; // metres per trip, U-turn detours included
  wrong: number; // wrong-side trips an hour
  served: number; // trips completed an hour
  stuck: number; // vehicles still on the road or waiting to enter at the end
  diverted: number; // trips an hour sent to other roads (one-way)
  bus: number | null; // mean end-to-end bus time, s
  trips: number;
}

/** One road the Lab can simulate: its layout, today's U-turns, and its calibrated traffic by hour. */
export interface Corridor {
  id: string;
  name: string;
  length: number;
  /** chainage of the spot the corridor was built around */
  spotS: number | null;
  /** where each carriageway heads: carriageway 0 runs up the chainage, carriageway 1 back */
  toward: [string, string];
  heading: [string | null, string | null];
  model: CorridorModel;
  /** today's median openings, which a design can move, remove or add to */
  openings: number[];
  /** places to turn back on stretches without a median; not editable */
  fixedOpenings: number[];
  medians: { from: number; to: number }[];
  blocked: { from: number; to: number; why: string }[];
  /** stops that get a bay when a design adds bus bays */
  bayStops: number[];
  /** named points along the road, for labels and jump-to buttons */
  places: { s: number; name: string }[];
  fix?: { type: string; title: string } | null;
  reverseShare: number;
  cal: Record<string, { qW: number; qE: number; target: [number, number | null]; got: [number, number | null] }>;
  baseline: Record<string, { today: Metrics[]; plan: Metrics[] | null }>;
  /** the RoadFix plan for this road, when it has one the model can test */
  plan: Design | null;
  planLabel: string | null;
  pilot?: boolean;
}

export interface Design {
  openings: { s: number; pocket: boolean }[];
  oneWay: null | 0 | 1; // 0: every lane runs up the chainage, 1: every lane runs back
  busLane: boolean;
  fullLanes: boolean;
  busBays: boolean;
  autoBays: boolean;
  clearKerb: boolean;
  enforcement: boolean;
  /** main-road green share by signal name, 0.3–0.7; missing means DEFAULT_GREEN */
  greens: Record<string, number>;
  traffic: number; // demand multiplier, 1 = today
}

/** Signals a design can retime: those on the corridor itself, not fixed junctions beyond its ends. */
export function editableSignals(c: Pick<Corridor, "model">) {
  return c.model.signals.filter((s) => s.green === undefined && s.name);
}

export function todayDesign(c: Pick<Corridor, "openings">): Design {
  return {
    openings: c.openings.map((s) => ({ s, pocket: false })),
    oneWay: null,
    busLane: false,
    fullLanes: false,
    busBays: false,
    autoBays: false,
    clearKerb: false,
    enforcement: false,
    greens: {},
    traffic: 1,
  };
}

export const greenOf = (d: Design, name: string) => d.greens[name] ?? DEFAULT_GREEN;

export function toLayout(d: Design, c: Pick<Corridor, "fixedOpenings" | "bayStops" | "model">): Layout {
  return {
    openings: [...d.openings, ...c.fixedOpenings.map((s) => ({ s, pocket: false }))].sort((a, b) => a.s - b.s),
    busBays: d.busBays ? c.bayStops : [],
    autoBays: d.autoBays,
    clearKerb: d.clearKerb,
    signalGreen: DEFAULT_GREEN,
    signalGreens: Object.fromEntries(editableSignals(c).map((s) => [s.name!, greenOf(d, s.name!)])),
    busLane: d.busLane,
    oneWay: d.oneWay,
    fullLanes: d.fullLanes,
    enforcement: d.enforcement,
  };
}

export function sameDesign(a: Design, b: Design) {
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}
const normal = (d: Design) => ({
  ...d,
  openings: [...d.openings].sort((x, y) => x.s - y.s),
  greens: Object.fromEntries(Object.entries(d.greens).filter(([, g]) => Math.abs(g - DEFAULT_GREEN) > 0.005).sort()),
});

/** Planning-estimate cost in ₹ lakh. Widening is flagged, not priced: it needs land. */
export function designCost(d: Design, c: Pick<Corridor, "openings" | "bayStops">) {
  const items: { label: string; lakh: number }[] = [];
  const near = (s: number, list: number[]) => list.some((x) => Math.abs(x - s) < 15);
  const now = d.openings.map((o) => o.s);
  const added = d.openings.filter((o) => !near(o.s, c.openings));
  const pocketsOnOld = d.openings.filter((o) => o.pocket && near(o.s, c.openings));
  const closed = c.openings.filter((s) => !near(s, now));
  if (added.length) items.push({ label: `${added.length} new U-turn${added.length > 1 ? "s" : ""}`, lakh: added.length * COSTS.newOpeningWithPocket });
  if (pocketsOnOld.length) items.push({ label: `${pocketsOnOld.length} waiting pocket${pocketsOnOld.length > 1 ? "s" : ""}`, lakh: pocketsOnOld.length * COSTS.pocketOnExisting });
  if (closed.length) items.push({ label: `${closed.length} U-turn${closed.length > 1 ? "s" : ""} closed`, lakh: closed.length * COSTS.closeOpening });
  if (d.busBays && c.bayStops.length) items.push({ label: `${c.bayStops.length} bus bay${c.bayStops.length > 1 ? "s" : ""}`, lakh: c.bayStops.length * COSTS.busBay });
  if (d.autoBays) items.push({ label: "Auto bays", lakh: COSTS.autoBays });
  if (d.clearKerb) items.push({ label: "Kerb cleared", lakh: COSTS.kerbClearance });
  if (d.busLane) items.push({ label: "Bus lane", lakh: COSTS.busLane });
  if (d.oneWay !== null) items.push({ label: "One-way signs", lakh: COSTS.oneWay });
  if (d.enforcement) items.push({ label: "Enforcement", lakh: COSTS.enforcement });
  const retimed = Object.values(d.greens).filter((g) => Math.abs(g - DEFAULT_GREEN) > 0.005).length;
  if (retimed) items.push({ label: `${retimed} signal${retimed > 1 ? "s" : ""} retimed`, lakh: retimed * COSTS.signalRetime });
  return { items, lakh: items.reduce((a, b) => a + b.lakh, 0), widening: d.fullLanes };
}

/** Where a new U-turn helps most: the middle of the longest gap that can take one. */
export function bestNewOpening(c: Pick<Corridor, "length" | "blocked">, openings: number[]) {
  const L = c.length;
  const blocked = (s: number) => c.blocked.some((z) => s >= z.from && s <= z.to);
  const pts = [0, ...[...openings].sort((a, b) => a - b), L];
  const gaps = pts
    .slice(1)
    .map((p, i) => ({ a: pts[i], b: p }))
    .sort((x, y) => y.b - y.a - (x.b - x.a));
  for (const g of gaps) {
    const mid = Math.round((g.a + g.b) / 20) * 10;
    for (let d = 0; d < (g.b - g.a) / 2 - 60; d += 10) {
      for (const s of [mid - d, mid + d]) if (!blocked(s) && s - g.a >= 60 && g.b - s >= 60) return s;
    }
  }
  return null;
}

/**
 * The fix the spot's card recommends, in terms the simulation can test, or null when it cannot
 * (a pedestrian crossing, say). The pilot's plan is set by its own optimisation instead.
 */
export function suggestedDesign(c: Omit<Corridor, "plan" | "planLabel" | "cal" | "baseline">): { design: Design; label: string } | null {
  const today = todayDesign(c);
  const pockets = today.openings.map((o) => ({ ...o, pocket: true }));
  const sig = editableSignals(c).sort((a, b) => Math.abs(a.s - (c.spotS ?? 0)) - Math.abs(b.s - (c.spotS ?? 0)))[0];
  const lanes = c.model.lanes;
  const lanesVary = new Set(lanes.map((l) => `${l.w}/${l.e}`)).size > 1;
  const autos = c.model.kerbFriction.some((f) => f.cause === "autos");
  switch (c.fix?.type) {
    case "median-uturn": {
      const extra = bestNewOpening(c, c.openings);
      const longest = Math.max(...[0, ...c.openings, c.length].sort((a, b) => a - b).map((p, i, a) => (i ? p - a[i - 1] : 0)));
      const openings = extra !== null && longest > 600 ? [...pockets, { s: extra, pocket: true }] : pockets;
      return { design: { ...today, openings, enforcement: true }, label: "U-turn pockets + stop wrong-side" };
    }
    case "bus-stops":
      if (!c.bayStops.length && !autos) return null;
      return { design: { ...today, busBays: c.bayStops.length > 0, autoBays: true }, label: c.bayStops.length ? "Bus bays + auto bays" : "Auto bays" };
    case "parking":
      return { design: { ...today, clearKerb: true, autoBays: autos }, label: autos ? "Clear kerb + auto bays" : "Clear kerb" };
    case "junctions":
      if (sig) return { design: { ...today, greens: { [sig.name!]: 0.55 } }, label: `Retime ${sig.name}` };
      return pockets.length ? { design: { ...today, openings: pockets }, label: "U-turn pockets" } : null;
    case "lanes-markings":
      if (lanesVary) return { design: { ...today, fullLanes: true }, label: "Even lanes, no drop" };
      return { design: { ...today, openings: pockets, enforcement: true }, label: "U-turn pockets + stop wrong-side" };
    case "traffic-flow":
      return { design: { ...today, openings: pockets, enforcement: true }, label: "U-turn pockets + stop wrong-side" };
    default:
      return null;
  }
}

/** Same warm-up, length, step and seed as the calibration, so "today" here matches TomTom's hour. */
export const LAB_RUN = { warmup: 300, measure: 2400, dt: 0.25, seed: 101 };

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function measure(sim: Simulation): Metrics {
  const st = sim.stats();
  const secs = Math.max(1, sim.t - sim.warmup);
  const perHour = 3600 / secs;
  const n = Math.max(1, st.trips);
  return {
    thr: [mean(st.throughTimes[0]), mean(st.throughTimes[1])],
    slow: (st.slowHours * 3600) / n,
    fuel: st.fuel / n,
    dist: (st.vehKm * 1000) / n,
    wrong: st.wrongside * perHour,
    served: st.trips * perHour,
    stuck: sim.vehicles.length + sim.queued,
    diverted: st.diverted * perHour,
    bus: mean(st.busTimes),
    trips: st.trips,
  };
}

/** What a run needs from a corridor; calibration passes its trial demand in place of cal. */
export type SimCorridor = Pick<Corridor, "model" | "fixedOpenings" | "bayStops" | "reverseShare"> & { cal: Record<string, { qW: number; qE: number }> };

export function makeSim(d: Design, hour: number, c: SimCorridor, seed = LAB_RUN.seed) {
  const q = c.cal[String(hour)];
  return new Simulation(c.model, toLayout(d, c), demandFor(q.qW * d.traffic, q.qE * d.traffic, c.reverseShare), DEFAULT_ASSUMPTIONS, seed, LAB_RUN.warmup);
}

/** Measurements are taken every 5 simulated minutes after the warm-up, so results can refine as a run goes. */
export const CHECKPOINT = 300;
export const CHECKPOINTS = LAB_RUN.measure / CHECKPOINT;

/** Run a design for 40 minutes of the hour, reporting each checkpoint's measurements as it is reached. */
export function runDesign(d: Design, hour: number, c: SimCorridor, onCheckpoint?: (i: number, m: Metrics) => void) {
  const sim = makeSim(d, hour, c);
  sim.run(LAB_RUN.warmup, LAB_RUN.dt);
  const out: Metrics[] = [];
  for (let i = 0; i < CHECKPOINTS; i++) {
    sim.run(CHECKPOINT, LAB_RUN.dt);
    const m = measure(sim);
    out.push(m);
    onCheckpoint?.(i, m);
  }
  return out;
}
