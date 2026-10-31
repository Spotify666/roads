// Road features drawn on the city map, with the colours and glyphs shared by the map badges and the key.
import { KIND_PATH } from "./causes";

export type CueKind = "signal" | "uturn" | "oneway" | "bus";

export const CUES: { kind: CueKind; label: string; bg: string; ink: string; path: string; minzoom: number; round: boolean }[] = [
  { kind: "signal", label: "Traffic signal", bg: "#eceee9", ink: "#101316", path: KIND_PATH.signal, minzoom: 12.5, round: true },
  { kind: "uturn", label: "U-turn opening", bg: "#2d6cdf", ink: "#ffffff", path: KIND_PATH.uturn, minzoom: 13, round: true },
  { kind: "oneway", label: "One-way", bg: "#101316", ink: "#ffffff", path: "M5 12h12 M12.5 6.5 18 12l-5.5 5.5", minzoom: 14, round: true },
  { kind: "bus", label: "Bus stop", bg: "#4a5560", ink: "#ffffff", path: KIND_PATH.bus, minzoom: 14.5, round: false },
];

/** Zoom at which the road features start to appear. */
export const CUE_ZOOM = Math.min(...CUES.map((c) => c.minzoom));
