// A road design the visitor builds in the Simulation Lab, how it maps onto the engine,
// what it costs, and the measurements taken from one run. Shared by the browser worker
// and the script that precomputes the "today" baselines, so both measure the same way.
import { DEFAULT_ASSUMPTIONS, Simulation, type Layout } from "./engine";
import { BAY_STOPS, COSTS, PILOT_MODEL, TODAY, TODAY_OPENINGS, demandFor } from "./pilot";

export const SIGNALS = {
  nanal: "Nanal Nagar",
  rethibowli: "Rethibowli (Inner Ring Road)",
} as const;

export interface Design {
  openings: { s: number; pocket: boolean }[];
  oneWay: null | 0 | 1; // 0: every lane towards Tolichowki, 1: every lane towards Mehdipatnam
  busLane: boolean;
  fullLanes: boolean;
  busBays: boolean;
  autoBays: boolean;
  clearKerb: boolean;
  enforcement: boolean;
  greenNanal: number; // main-road green share, 0.3–0.7
  greenRethibowli: number;
  traffic: number; // demand multiplier, 1 = today
}

export const TODAY_DESIGN: Design = {
  openings: TODAY.openings.map((o) => ({ ...o })),
  oneWay: null,
  busLane: false,
  fullLanes: false,
  busBays: false,
  autoBays: false,
  clearKerb: false,
  enforcement: false,
  greenNanal: TODAY.signalGreen,
  greenRethibowli: TODAY.signalGreen,
  traffic: 1,
};

export function planDesign(openings: number[]): Design {
  return {
    ...TODAY_DESIGN,
    openings: openings.map((s) => ({ s, pocket: true })),
    busBays: true,
    autoBays: true,
    clearKerb: true,
  };
}

export function toLayout(d: Design): Layout {
  return {
    openings: [...d.openings].sort((a, b) => a.s - b.s),
    busBays: d.busBays ? BAY_STOPS : [],
    autoBays: d.autoBays,
    clearKerb: d.clearKerb,
    signalGreen: TODAY.signalGreen,
    signalGreens: { [SIGNALS.nanal]: d.greenNanal, [SIGNALS.rethibowli]: d.greenRethibowli },
    busLane: d.busLane,
    oneWay: d.oneWay,
    fullLanes: d.fullLanes,
    enforcement: d.enforcement,
  };
}

export function sameDesign(a: Design, b: Design) {
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}
const normal = (d: Design) => ({ ...d, openings: [...d.openings].sort((x, y) => x.s - y.s) });

/** Planning-estimate cost in ₹ lakh. Widening is flagged, not priced: it needs land. */
export function designCost(d: Design) {
  const items: { label: string; lakh: number }[] = [];
  const near = (s: number, list: number[]) => list.some((x) => Math.abs(x - s) < 15);
  const now = d.openings.map((o) => o.s);
  const added = d.openings.filter((o) => !near(o.s, TODAY_OPENINGS));
  const pocketsOnOld = d.openings.filter((o) => o.pocket && near(o.s, TODAY_OPENINGS));
  const closed = TODAY_OPENINGS.filter((s) => !near(s, now));
  if (added.length) items.push({ label: `${added.length} new U-turn${added.length > 1 ? "s" : ""}`, lakh: added.length * COSTS.newOpeningWithPocket });
  if (pocketsOnOld.length) items.push({ label: `${pocketsOnOld.length} waiting pocket${pocketsOnOld.length > 1 ? "s" : ""}`, lakh: pocketsOnOld.length * COSTS.pocketOnExisting });
  if (closed.length) items.push({ label: `${closed.length} U-turn${closed.length > 1 ? "s" : ""} closed`, lakh: closed.length * COSTS.closeOpening });
  if (d.busBays) items.push({ label: `${BAY_STOPS.length} bus bays`, lakh: BAY_STOPS.length * COSTS.busBay });
  if (d.autoBays) items.push({ label: "Auto bays", lakh: COSTS.autoBays });
  if (d.clearKerb) items.push({ label: "Kerb cleared", lakh: COSTS.kerbClearance });
  if (d.busLane) items.push({ label: "Bus lane", lakh: COSTS.busLane });
  if (d.oneWay !== null) items.push({ label: "One-way signs", lakh: COSTS.oneWay });
  if (d.enforcement) items.push({ label: "Enforcement", lakh: COSTS.enforcement });
  const retimed = [d.greenNanal, d.greenRethibowli].filter((g) => Math.abs(g - TODAY.signalGreen) > 0.005).length;
  if (retimed) items.push({ label: `${retimed} signal${retimed > 1 ? "s" : ""} retimed`, lakh: retimed * COSTS.signalRetime });
  return { items, lakh: items.reduce((a, b) => a + b.lakh, 0), widening: d.fullLanes };
}

/** Same warm-up, length, step and seed as the calibration, so "today" here matches TomTom's hour. */
export const LAB_RUN = { warmup: 300, measure: 2400, dt: 0.25, seed: 101 };

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

export type Calibration = Record<string, { qW: number; qE: number }>;

export function makeSim(d: Design, hour: number, cal: Calibration, reverseShare = 0.18) {
  const c = cal[String(hour)];
  return new Simulation(PILOT_MODEL, toLayout(d), demandFor(c.qW * d.traffic, c.qE * d.traffic, reverseShare), DEFAULT_ASSUMPTIONS, LAB_RUN.seed, LAB_RUN.warmup);
}

/** Measurements are taken every 5 simulated minutes after the warm-up, so results can refine as a run goes. */
export const CHECKPOINT = 300;
export const CHECKPOINTS = LAB_RUN.measure / CHECKPOINT;

/** Run a design for 40 minutes of the hour, reporting each checkpoint's measurements as it is reached. */
export function runDesign(d: Design, hour: number, cal: Calibration, onCheckpoint?: (i: number, m: Metrics) => void, reverseShare = 0.18) {
  const sim = makeSim(d, hour, cal, reverseShare);
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
