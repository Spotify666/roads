export interface AreaSummary {
  id: string;
  name: string;
  place: string;
  lat: number;
  lon: number;
  corporation: string;
  police: string;
  pilot: boolean;
  causes: string[];
  fix: { type: string; title: string; costLakh: [number, number]; weeks: number; agency: string };
  reportedCount: number;
  profile: null | {
    heading: string;
    peak: { hour: number; ratio: number; delay: number };
    am: { hour: number; ratio: number; delay: number };
    pm: { hour: number; ratio: number; delay: number };
    peakDelayPerKm: number;
    hours: [number, number][];
    dirs: number;
  };
}

export interface Source {
  title: string;
  publisher: string;
  date: string;
  url: string;
}

export interface AreaDirection {
  tag: string;
  heading: string;
  lengthM: number;
  freeFlowS: number;
  legs: { len: number; ff: number; geom: [number, number][] }[];
  hours: { hour: number; ratio: number; delay: number; legs: number[]; legDelay: number[] }[];
  peak: { hour: number; ratio: number; delay: number };
  am: { hour: number; ratio: number; delay: number };
  pm: { hour: number; ratio: number; delay: number };
  worstLeg: number;
  peakDelayPerKm: number;
}

export interface AreaDetail {
  id: string;
  name: string;
  place: string;
  lat: number;
  lon: number;
  corporation: string;
  police: string;
  pilot?: boolean;
  reported: { text: string; src: string }[];
  timeNotes: { text: string; src: string }[];
  causes: string[];
  fix: { type: string; title: string; detail: string; agency: string; costLakh: [number, number]; weeks: number };
  snapped: { lat: number; lon: number; road: string | null; highway: string };
  osm: Record<string, number | boolean | null>;
  osmSignals: string[];
  dirs: AreaDirection[];
  sources: Record<string, Source>;
  freeFlowSpeed?: number;
  frc?: string;
}

export interface LiveReading {
  hotspot_id: string;
  observed_at: string;
  current_speed: number;
  free_flow_speed: number;
  current_travel_time: number;
  free_flow_travel_time: number;
  confidence: number;
  road_closure: boolean;
}

export interface LiveIncident {
  g: { type: string; coordinates: number[][] | number[] };
  p: {
    iconCategory: number;
    magnitudeOfDelay: number;
    delay?: number;
    length?: number;
    from?: string;
    to?: string;
    events?: { description: string }[];
  };
}
