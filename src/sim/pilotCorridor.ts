// The Mehdipatnam–Tolichowki pilot in the Lab's corridor shape: its hand-checked layout from
// OpenStreetMap, its calibration and the precomputed today and RoadFix-plan runs.
import pilotData from "@/data/pilot.json";
import labBaseline from "@/data/lab_baseline.json";
import { BAY_STOPS, BLOCKED_ZONES, PILOT_MODEL, TODAY_OPENINGS } from "./pilot";
import { todayDesign, type Corridor, type Metrics } from "./scenario";

const cal = (pilotData as unknown as { calibration: { hours: Corridor["cal"] } }).calibration.hours;
const base = labBaseline as unknown as { hours: Record<string, { today: Metrics[]; plan: Metrics[] }>; planOpenings: number[]; reverseShare: number };
const L = PILOT_MODEL.length;

export const PILOT_ID = "mehdipatnam";

export const PILOT_CORRIDOR: Corridor = {
  id: PILOT_ID,
  name: "Mehdipatnam ↔ Tolichowki",
  length: L,
  spotS: 60,
  toward: ["Tolichowki", "Mehdipatnam"],
  heading: ["westbound", "eastbound"],
  model: PILOT_MODEL,
  openings: TODAY_OPENINGS,
  fixedOpenings: [],
  medians: [{ from: 0, to: L }],
  blocked: BLOCKED_ZONES,
  bayStops: BAY_STOPS,
  places: [
    { s: 0, name: "Mehdipatnam" },
    { s: 986, name: "Rethibowli" },
    { s: 1371, name: "Nanal Nagar" },
    { s: L, name: "Tolichowki" },
  ],
  fix: { type: "median-uturn", title: "Re-spaced U-turns, bus bays, auto bays, clear kerb" },
  reverseShare: base.reverseShare,
  cal,
  baseline: Object.fromEntries(Object.entries(base.hours).map(([h, v]) => [h, { today: v.today, plan: v.plan }])),
  plan: {
    ...todayDesign({ openings: TODAY_OPENINGS }),
    openings: base.planOpenings.map((s) => ({ s, pocket: true })),
    busBays: true,
    autoBays: true,
    clearKerb: true,
  },
  planLabel: "RoadFix plan",
  pilot: true,
};
