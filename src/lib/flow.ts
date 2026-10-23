// Congestion scale shared by the map, charts and simulation.
// `ratio` is travel time over free-flow travel time (1 = free flow).

export const FLOW_COLORS = ["#29a36a", "#f0d860", "#f39228", "#cf2f3d", "#7b1636"] as const;
export const FLOW_LABELS = ["Flowing", "Slow", "Heavy", "Jammed", "Standstill"] as const;
const THRESHOLDS = [1.15, 1.5, 2.0, 3.0];

export function flowLevel(ratio: number | null | undefined) {
  if (ratio == null || !isFinite(ratio)) return -1;
  let i = 0;
  while (i < THRESHOLDS.length && ratio >= THRESHOLDS[i]) i++;
  return i;
}

export function flowColor(ratio: number | null | undefined, fallback = "#6b7378") {
  const l = flowLevel(ratio);
  return l < 0 ? fallback : FLOW_COLORS[l];
}

export function flowLabel(ratio: number | null | undefined) {
  const l = flowLevel(ratio);
  return l < 0 ? "No data" : FLOW_LABELS[l];
}

/** MapLibre step expression over a numeric property holding the ratio. */
export function flowStepExpression(prop: string) {
  return [
    "step",
    ["coalesce", ["get", prop], 0],
    "#6b7378",
    0.01,
    FLOW_COLORS[0],
    THRESHOLDS[0],
    FLOW_COLORS[1],
    THRESHOLDS[1],
    FLOW_COLORS[2],
    THRESHOLDS[2],
    FLOW_COLORS[3],
    THRESHOLDS[3],
    FLOW_COLORS[4],
  ] as unknown as string;
}

export function hourLabel(h: number) {
  const suffix = h < 12 ? "am" : "pm";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${suffix}`;
}

export function minutes(seconds: number) {
  const m = seconds / 60;
  return m < 10 ? m.toFixed(1) : Math.round(m).toString();
}

/** Interpolate a profile sampled at some hours to any hour 0-23. */
export function atHour(hours: number[][], hour: number) {
  // hours: [[h, value], ...] sorted
  if (!hours.length) return null;
  const exact = hours.find((x) => x[0] === hour);
  if (exact) return exact[1];
  let a = hours[hours.length - 1];
  let b = hours[0];
  for (let i = 0; i < hours.length; i++) {
    if (hours[i][0] > hour) {
      b = hours[i];
      a = hours[i - 1] ?? hours[hours.length - 1];
      break;
    }
  }
  const span = (b[0] - a[0] + 24) % 24 || 24;
  const t = ((hour - a[0] + 24) % 24) / span;
  return a[1] + (b[1] - a[1]) * t;
}

export const CAUSE_LABELS: Record<string, string> = {
  "bus-stop-in-lane": "Buses stop in the running lane",
  "shared-autos": "Shared autos crowd the kerb",
  "u-turn-detour": "Long U-turn detour",
  "wrong-side": "Wrong-side riding",
  works: "Civic works narrow the road",
  "rat-running": "Traffic cuts through colonies",
  signal: "Signal timing",
  parking: "Parking on the carriageway",
  vendors: "Pushcarts on the road",
  encroachment: "Footpath and road encroachment",
  merge: "Merging and weaving",
  "rain-waterlogging": "Waterlogging in rain",
  pedestrians: "Pedestrians on the road",
  barricades: "Barricades take a lane",
  "lane-drop": "Lanes drop suddenly",
  "narrow-road": "Narrow stretch",
  "heavy-vehicles": "Heavy vehicles",
  "private-buses": "Private buses halt mid-road",
  "metro-pillars": "Metro pillars narrow the road",
  "school-zone": "School drop-offs",
};

export const FIX_TYPE_LABELS: Record<string, string> = {
  "median-uturn": "Median and U-turns",
  junctions: "Junction",
  "bus-stops": "Bus stops",
  parking: "Parking",
  "lanes-markings": "Lanes and markings",
  pedestrians: "Pedestrians",
  "traffic-flow": "Traffic flow",
};
