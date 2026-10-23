// The Mehdipatnam–Tolichowki pilot: corridor geometry from OpenStreetMap,
// today's layout, the RoadFix layout and the hourly demand calibrated
// against TomTom's typical travel times.
import corridor from "../../data/corridor.json";
import type { CorridorModel, Demand, Layout } from "./engine";

type Feature = { kind: string; chainage: number; side?: string; highway?: string; name?: string | null; carriageway?: string };

const WEIGHT: Record<string, number> = {
  primary: 5,
  secondary: 4,
  tertiary: 3,
  trunk_link: 2,
  primary_link: 2,
  residential: 1,
  unclassified: 1,
  living_street: 0.5,
  service: 0.5,
};

const features = corridor.features as Feature[];
const L = corridor.length_m;

// Where the dual carriageway narrows from three lanes to two (Old Bombay Highway at Nanal Nagar).
const LANE_DROP = 1371;

export const PILOT_MODEL: CorridorModel = {
  length: L,
  lanes: [
    { from: 0, to: LANE_DROP, w: 3, e: 3 },
    { from: LANE_DROP, to: L + 1, w: 2, e: 2 },
  ],
  busStops: features
    .filter((f) => f.kind === "bus_stop")
    .map((f) => ({
      s: f.chainage,
      cw: (f.carriageway === "east" ? 1 : 0) as 0 | 1,
      name: f.name ?? "Bus stop",
      major: /mehdi|medi|tolichowki/i.test(f.name ?? ""),
    })),
  sideRoads: features
    .filter((f) => f.kind === "side_road" && f.chainage > 30 && f.chainage < L - 30)
    .flatMap((f) => {
      const w = WEIGHT[f.highway ?? ""] ?? 1;
      const cws: (0 | 1)[] = f.side === "south" ? [0] : f.side === "north" ? [1] : [0, 1];
      return cws.map((cw) => ({ s: f.chainage, cw, weight: w }));
    }),
  signals: [
    ...features
      .filter((f) => f.kind === "signal")
      .map((f, i) => ({ s: f.chainage, cycle: i === 0 ? 150 : 120, offset: i * 40, name: i === 0 ? "Rethibowli (Inner Ring Road)" : "Nanal Nagar" })),
    // Mehdipatnam junction, just beyond the eastbound end of the modelled corridor
    { s: 12, cycle: 150, offset: 70, cw: 1 as const, green: 0.42, name: "Mehdipatnam junction" },
  ],
  kerbFriction: [
    // Shared autos and buses crowding the Mehdipatnam stop (Hans India, 2022)
    { from: 60, to: 300, cw: 0, speed: 12, cause: "autos" },
    { from: 470, to: 600, cw: 1, speed: 15, cause: "autos" },
    // Parking outside marriage halls and hotels, and pushcarts, at Tolichowki (Hans India, 2022)
    { from: 2400, to: L, cw: 0, speed: 18, cause: "parking" },
    { from: 2400, to: L, cw: 1, speed: 18, cause: "parking" },
  ],
};

export const TODAY_OPENINGS = features.filter((f) => f.kind === "median_opening").map((f) => f.chainage);

export const TODAY: Layout = {
  openings: TODAY_OPENINGS.map((s) => ({ s, pocket: false })),
  busBays: [],
  autoBays: false,
  clearKerb: false,
  signalGreen: 0.45,
};

/** Positions where a median opening cannot be built: junction mouths, the lane drop, flyover ramps, bus stops. */
export const BLOCKED: [number, number][] = [
  [0, 120],
  [840, 1010], // Rethibowli / Inner Ring Road junction
  [1330, 1420], // Nanal Nagar signal and lane drop
  [2240, 2400], // Tolichowki flyover ramps
  [L - 60, L + 1],
  ...features.filter((f) => f.kind === "bus_stop").map((f) => [f.chainage - 30, f.chainage + 30] as [number, number]),
];

/** The same zones with the reason, for the Lab's corridor editor. */
export const BLOCKED_ZONES: { from: number; to: number; why: string }[] = [
  { from: 0, to: 120, why: "Mehdipatnam junction" },
  { from: 840, to: 1010, why: "Rethibowli junction" },
  { from: 1330, to: 1420, why: "Nanal Nagar signal and lane drop" },
  { from: 2240, to: 2400, why: "Tolichowki flyover ramps" },
  { from: L - 60, to: L + 1, why: "Tolichowki junction" },
  ...features.filter((f) => f.kind === "bus_stop").map((f) => ({ from: f.chainage - 30, to: f.chainage + 30, why: "Bus stop" })),
];

export function blockedReason(s: number) {
  return BLOCKED_ZONES.find((z) => s >= z.from && s <= z.to)?.why ?? null;
}

export function buildable(s: number) {
  return !BLOCKED.some(([a, b]) => s >= a && s <= b);
}

export const CORRIDOR_LENGTH = L;
export const CORRIDOR_GEOMETRY = corridor.west as [number, number, number][];
export const CORRIDOR_FEATURES = features;

/** Demand for an hour: through flow per direction and side-road joiners proportional to it. */
export function demandFor(throughW: number, throughE: number, reverseShare = 0.18): Demand {
  return {
    through: [throughW, throughE],
    side: [throughW * 0.32, throughE * 0.32],
    reverseShare,
  };
}

/** Bus stops rebuilt with bays in the RoadFix package: the Mehdipatnam stops and Tolichowki. */
export const BAY_STOPS = PILOT_MODEL.busStops.filter((b) => b.major).map((b) => b.s);

/** The RoadFix package around a set of U-turn openings. Signals are left as they are,
 *  because the side streets they also serve are not simulated. */
export function fixLayout(openings: number[], parts = { bays: true, autos: true, kerb: true }): Layout {
  return {
    openings: openings.map((s) => ({ s, pocket: true })),
    busBays: parts.bays ? BAY_STOPS : [],
    autoBays: parts.autos,
    clearKerb: parts.kerb,
    signalGreen: TODAY.signalGreen,
  };
}

/** Planning-estimate costs in ₹ lakh. */
export const COSTS = {
  newOpeningWithPocket: 5.5,
  pocketOnExisting: 3,
  closeOpening: 1,
  busBay: 12,
  autoBays: 4,
  kerbClearance: 3,
  busLane: 10, // markings, signs and bollards on both kerb lanes
  oneWay: 5, // signs and barricades at both ends
  enforcement: 8, // median railings at gaps and two cameras
  signalRetime: 0.5, // turning count and retiming, per signal
};
