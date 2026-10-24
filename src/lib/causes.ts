// One icon per kind of cause, drawn from the same 24px stroke paths on the map (canvas) and in the page (SVG).

export type CauseKind = "bus" | "auto" | "uturn" | "wrong" | "signal" | "kerb" | "works" | "merge" | "rain" | "people" | "truck" | "detour";

export const CAUSE_KIND: Record<string, CauseKind> = {
  "bus-stop-in-lane": "bus",
  "private-buses": "bus",
  "shared-autos": "auto",
  "u-turn-detour": "uturn",
  "wrong-side": "wrong",
  signal: "signal",
  parking: "kerb",
  vendors: "kerb",
  encroachment: "kerb",
  works: "works",
  barricades: "works",
  "metro-pillars": "works",
  merge: "merge",
  "lane-drop": "merge",
  "narrow-road": "merge",
  "rain-waterlogging": "rain",
  pedestrians: "people",
  "school-zone": "people",
  "heavy-vehicles": "truck",
  "rat-running": "detour",
};

export const KIND_LABEL: Record<CauseKind, string> = {
  bus: "Buses",
  auto: "Autos",
  uturn: "U-turn",
  wrong: "Wrong-side",
  signal: "Signal",
  kerb: "Kerb blocked",
  works: "Works",
  merge: "Lanes merge",
  rain: "Waterlogging",
  people: "Pedestrians",
  truck: "Heavy vehicles",
  detour: "Cut-through",
};

export const KIND_PATH: Record<CauseKind, string> = {
  bus: "M7 4h10a3 3 0 0 1 3 3v10H4V7a3 3 0 0 1 3-3Z M4 11.5h16 M7.5 20v-3 M16.5 20v-3",
  auto: "M5 16.5V10a5 5 0 0 1 5-5h4l5 6v5.5Z M14 5v6h5 M9.5 18.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0Z M18.5 18.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0Z",
  uturn: "M7 20V9a5 5 0 0 1 10 0v6 M13.5 12l3.5 3.5 3.5-3.5",
  wrong: "M12 3.5 2.5 20h19Z M12 10v4.5 M12 17.3v.2",
  signal: "M9 2.5h6a1.5 1.5 0 0 1 1.5 1.5v12.5A1.5 1.5 0 0 1 15 18H9a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 9 2.5Z M12 18v3.5 M12 6.5v.2 M12 10v.2 M12 13.5v.2",
  kerb: "M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17Z M10 16.5V7.5h2.8a2.6 2.6 0 0 1 0 5.2H10",
  works: "M12 3l5.5 16h-11Z M8.4 13.5h7.2 M3.5 20h17",
  merge: "M6 3v5l6 6v7.5 M18 3v5l-6 6",
  rain: "M12 3c3.2 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.8-6.8 6-11Z",
  people: "M14 4.8a2 2 0 1 1-4 0a2 2 0 1 1 4 0Z M12 8.5v6l-3.5 6 M12 14.5l3.5 6 M7.5 12l4.5-3.5 4.5 3.5",
  truck: "M2.5 6.5h11v10h-11Z M13.5 10h4l3.5 3.5v3h-7.5 M7.5 18.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0Z M18.5 18.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0Z",
  detour: "M4 20v-7a5 5 0 0 1 5-5h8.5 M14 4.5 17.5 8 14 11.5",
};

export const KINDS = Object.keys(KIND_PATH) as CauseKind[];

/** The kinds behind a spot's causes, in report order, without repeats. */
export function kindsOf(causes: string[]) {
  const out: CauseKind[] = [];
  for (const c of causes) {
    const k = CAUSE_KIND[c];
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}
