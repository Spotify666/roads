"use client";

import { useEffect, useRef } from "react";
import { AttributionControl, Map as MLMap, Marker, NavigationControl, Popup, type GeoJSONSource, type MapMouseEvent, type PaddingOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FLOW_COLORS, atHour, flowColor, flowStepExpression } from "@/lib/flow";
import { KINDS, KIND_PATH, kindsOf } from "@/lib/causes";
import { CUES } from "@/lib/roadCues";
import type { AreaSummary, LiveIncident } from "@/lib/types";

type Stretch = { g: [number, number][]; r: number[] };
export type AreaWithStretches = AreaSummary & { stretches: Stretch[] };

export interface MapLayers {
  flow: boolean; // TomTom live traffic tiles
  incidents: boolean;
  stretches: boolean; // typical-weekday stretches
  signal: boolean;
  uturn: boolean;
  oneway: boolean;
  bus: boolean;
}

interface Props {
  areas: AreaWithStretches[];
  profileHours: number[];
  mode: "live" | "typical";
  hour: number;
  liveRatio: Record<string, number>;
  incidents: LiveIncident[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  padding: PaddingOptions;
  layers: MapLayers;
  user: [number, number] | null;
  /** bumped to re-centre on the user */
  locateTick: number;
  /** live spots running clearly worse ("up") or better ("down") than usual for this hour */
  trend: Record<string, "up" | "down">;
  onZoom?: (z: number) => void;
  /** bumped to zoom in to street level around the centre */
  zoomInTick?: number;
}

const STYLE = "https://tiles.openfreemap.org/styles/dark";
const CENTER: [number, number] = [78.44, 17.415];
const BOUNDS: [[number, number], [number, number]] = [
  [77.9, 17.05],
  [78.95, 17.8],
];
const TAP_PX = 18; // forgiving tap target around each spot, as on a phone map

function restyleBase(map: MLMap) {
  // pull the basemap towards the asphalt palette so traffic colours carry the page
  const set = (id: string, prop: string, value: unknown) => {
    if (map.getLayer(id)) map.setPaintProperty(id, prop as never, value as never);
  };
  set("background", "background-color", "#101316");
  set("water", "fill-color", "#0d1a22");
  for (const id of ["landuse_residential", "landcover_wood", "landuse_park"]) set(id, "fill-color", "#14181b");
  set("building", "fill-color", "#1a1f23");
  for (const id of ["highway_major_inner", "highway_motorway_inner", "highway_major_subtle", "highway_motorway_subtle"]) set(id, "line-color", "#2e353a");
  for (const id of ["highway_major_casing", "highway_motorway_casing"]) set(id, "line-color", "#1b2024");
  set("highway_minor", "line-color", "#23292d");
  for (const id of ["aeroway-runway", "aeroway-taxiway", "aeroway-runway-casing"]) set(id, "line-color", "#1e2428");
  set("aeroway-area", "fill-color", "#161a1d");
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "symbol" && /name|place/.test(layer.id)) {
      set(layer.id, "text-color", "#8b948f");
      set(layer.id, "text-halo-color", "#101316");
    }
  }
}

const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const PILL_COLORS: [string, string][] = [["pill-none", "#3a434a"], ...FLOW_COLORS.map((c, i) => [`pill-${i}`, c] as [string, string])];

/** Cause icons and trend arrows, in a dark and a light ink, to sit inline in the pill labels. */
function addGlyphs(map: MLMap) {
  const r = 2;
  const px = 13 * r;
  const draw = (name: string, paint: (g: CanvasRenderingContext2D) => void) => {
    if (map.hasImage(name)) return;
    const c = document.createElement("canvas");
    c.width = px;
    c.height = px;
    const g = c.getContext("2d")!;
    paint(g);
    map.addImage(name, g.getImageData(0, 0, px, px), { pixelRatio: r });
  };
  for (const [suffix, ink] of [
    ["d", "#101316"],
    ["l", "#ffffff"],
  ] as const) {
    for (const k of KINDS) {
      draw(`c-${k}-${suffix}`, (g) => {
        g.scale(px / 24, px / 24);
        g.strokeStyle = ink;
        g.lineWidth = 2.4;
        g.lineCap = "round";
        g.lineJoin = "round";
        g.stroke(new Path2D(KIND_PATH[k]));
      });
    }
    for (const dir of ["up", "down"] as const) {
      draw(`t-${dir}-${suffix}`, (g) => {
        g.scale(px / 24, px / 24);
        g.fillStyle = ink;
        g.beginPath();
        if (dir === "up") {
          g.moveTo(12, 5);
          g.lineTo(20, 17);
          g.lineTo(4, 17);
        } else {
          g.moveTo(12, 19);
          g.lineTo(20, 7);
          g.lineTo(4, 7);
        }
        g.closePath();
        g.fill();
      });
    }
  }
}

/** Badges for signals, U-turns and bus stops, and the chevron for one-way roads. */
function addCueIcons(map: MLMap) {
  const r = 2;
  for (const c of CUES) {
    const name = `cue-${c.kind}`;
    if (map.hasImage(name)) continue;
    const size = (c.kind === "oneway" ? 14 : 20) * r;
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const g = cv.getContext("2d")!;
    if (c.kind !== "oneway") {
      // dark rim keeps the badge readable over traffic colours
      g.fillStyle = "#101316";
      g.beginPath();
      if (c.round) g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      else g.rect(0, 0, size, size);
      g.fill();
      g.fillStyle = c.bg;
      g.beginPath();
      if (c.round) g.arc(size / 2, size / 2, size / 2 - 1.5 * r, 0, Math.PI * 2);
      else g.rect(1.5 * r, 1.5 * r, size - 3 * r, size - 3 * r);
      g.fill();
    }
    const inset = c.kind === "oneway" ? 0 : 4 * r;
    g.translate(inset, inset);
    g.scale((size - 2 * inset) / 24, (size - 2 * inset) / 24);
    g.lineCap = "round";
    g.lineJoin = "round";
    if (c.kind === "oneway") {
      g.strokeStyle = "#101316";
      g.lineWidth = 6;
      g.stroke(new Path2D(c.path));
    }
    g.strokeStyle = c.ink;
    g.lineWidth = c.kind === "oneway" ? 3 : 2.4;
    g.stroke(new Path2D(c.path));
    map.addImage(name, g.getImageData(0, 0, size, size), { pixelRatio: r });
  }
}

/** A stretchable rounded pill per congestion colour, for the ratio labels on the map. */
function addPills(map: MLMap) {
  const r = 2; // drawn at 2x for sharp edges
  const w = 22 * r,
    h = 18 * r;
  for (const [name, color] of PILL_COLORS) {
    if (map.hasImage(name)) continue;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    // drawn by hand rather than with roundRect, which older iPhones lack
    const pill = (x: number, y: number, pw: number, ph: number) => {
      const rr = ph / 2;
      g.beginPath();
      g.moveTo(x + rr, y);
      g.lineTo(x + pw - rr, y);
      g.arc(x + pw - rr, y + rr, rr, -Math.PI / 2, Math.PI / 2);
      g.lineTo(x + rr, y + ph);
      g.arc(x + rr, y + rr, rr, Math.PI / 2, (3 * Math.PI) / 2);
      g.closePath();
      g.fill();
    };
    g.fillStyle = "#101316";
    pill(0, 0, w, h);
    g.fillStyle = color;
    pill(1.5 * r, 1.5 * r, w - 3 * r, h - 3 * r);
    map.addImage(name, g.getImageData(0, 0, w, h), {
      pixelRatio: r,
      stretchX: [[9 * r, 13 * r]],
      stretchY: [[8 * r, 10 * r]],
      content: [6 * r, 2 * r, 16 * r, 16 * r],
    });
  }
}

/** Keep one CSS-animated ring on every jammed spot (2× or worse), coloured by its level. */
function syncPulses(map: MLMap, pulses: Map<string, Marker>, spots: GeoJSON.Feature[]) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const keep = new Set<string>();
  for (const f of spots) {
    const { id, cur } = f.properties as { id: string; cur: number };
    if (cur < 2) continue;
    keep.add(id);
    let m = pulses.get(id);
    if (!m) {
      const el = document.createElement("div");
      el.className = "map-pulse";
      el.setAttribute("aria-hidden", "true");
      // every ring shares one clock, so they breathe together
      el.style.setProperty("--d", `-${Math.round(performance.now() % 1800)}ms`);
      m = new Marker({ element: el }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).addTo(map);
      pulses.set(id, m);
    }
    m.getElement().style.setProperty("--c", flowColor(cur));
  }
  for (const [id, m] of pulses) {
    if (keep.has(id)) continue;
    m.remove();
    pulses.delete(id);
  }
}

export function CityMap({ areas, profileHours, mode, hour, liveRatio, incidents, selectedId, onSelect, padding, layers, user, locateTick, trend, onZoom, zoomInTick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const queue = useRef<(() => void)[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const paddingRef = useRef(padding);
  paddingRef.current = padding;
  const areasRef = useRef(areas);
  areasRef.current = areas;
  // breathing rings round jammed spots: DOM markers animated by CSS, so the map itself never has to redraw for them
  const pulses = useRef(new Map<string, Marker>());
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  const whenReady = (fn: () => void) => {
    if (ready.current) fn();
    else queue.current.push(fn);
  };

  useEffect(() => {
    if (!el.current) return;
    const rings = pulses.current;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const map = new MLMap({
      container: el.current,
      style: STYLE,
      center: CENTER,
      zoom: window.innerWidth < 768 ? 10.4 : 11.2,
      minZoom: 9,
      maxZoom: 17.5,
      maxBounds: BOUNDS,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // one finger pans, two fingers zoom: the map owns the gestures, like Google Maps
      cooperativeGestures: false,
      fadeDuration: 150,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new AttributionControl({ compact: true, customAttribution: 'Traffic © <a href="https://www.tomtom.com">TomTom</a>' }), coarse ? "top-right" : "bottom-right");
    // phones pinch to zoom; mice get buttons
    if (!coarse) map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      restyleBase(map);
      map.addSource("tt-flow", { type: "raster", tiles: ["/api/tiles/{z}/{x}/{y}"], tileSize: 256, minzoom: 9, maxzoom: 18 });
      map.addLayer({ id: "tt-flow", type: "raster", source: "tt-flow", paint: { "raster-opacity": 0.95, "raster-fade-duration": 200 } });

      // one-way arrows from the basemap's own road data, brighter and from further out than its faint defaults
      addCueIcons(map);
      for (const id of ["road_oneway", "road_oneway_opposite"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      for (const [id, dir] of [
        ["cue-oneway", 1],
        ["cue-oneway-rev", -1],
      ] as const) {
        map.addLayer({
          id,
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "transportation",
          minzoom: CUES.find((c) => c.kind === "oneway")!.minzoom,
          filter: ["all", ["==", ["get", "oneway"], dir], ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"], true, false]],
          layout: {
            "icon-image": "cue-oneway",
            "icon-rotate": dir === 1 ? 0 : 180,
            "icon-rotation-alignment": "map",
            "symbol-placement": "line",
            "symbol-spacing": ["interpolate", ["linear"], ["zoom"], 14, 90, 17, 140],
            "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 1, 17, 1.45],
            "icon-padding": 1,
          },
          paint: { "icon-opacity": 0.95 },
        });
      }

      map.addSource("stretches", { type: "geojson", data: empty });
      map.addLayer({
        id: "stretches-casing",
        type: "line",
        source: "stretches",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0b0d0f", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 12] },
      });
      map.addLayer({
        id: "stretches",
        type: "line",
        source: "stretches",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": flowStepExpression("cur"), "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.2, 15, 8] },
      });

      // the measured road through the selected spot, drawn like a route
      map.addSource("route", { type: "geojson", data: empty });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#eceee9", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 15, 16], "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["case", ["get", "typical"], flowStepExpression("cur"), "#2d6cdf"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 10] },
      });

      map.addSource("incidents", { type: "geojson", data: empty });
      map.addLayer({
        id: "incidents",
        type: "line",
        source: "incidents",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round" },
        paint: {
          "line-color": ["match", ["get", "mag"], 4, "#7b1636", 3, "#cf2f3d", 2, "#f39228", "#f0d860"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 15, 5],
          "line-opacity": 0.95,
          "line-dasharray": [1, 1.4],
        },
      });

      // signals, U-turn openings and bus stops across the city (OpenStreetMap)
      map.addSource("cues", { type: "geojson", data: "/data/road-cues.json" });
      for (const c of CUES) {
        if (c.kind === "oneway") continue;
        map.addLayer({
          id: `cue-${c.kind}`,
          type: "symbol",
          source: "cues",
          minzoom: c.minzoom,
          filter: ["==", ["get", "k"], c.kind],
          layout: {
            "icon-image": `cue-${c.kind}`,
            "icon-size": ["interpolate", ["linear"], ["zoom"], c.minzoom, 0.7, 16, 1],
            "icon-padding": 2,
            // signals and U-turns are sparse and matter most beside a spot, so they always draw; bus stops give way
            "icon-allow-overlap": c.kind !== "bus",
            "icon-ignore-placement": c.kind !== "bus",
            // signals win a clash with U-turns, which win over bus stops
            "symbol-sort-key": c.kind === "signal" ? 0 : c.kind === "uturn" ? 1 : 2,
          },
          paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], c.minzoom, 0, c.minzoom + 0.4, 1] },
        });
      }

      map.addSource("hotspots", { type: "geojson", data: empty });
      map.addLayer({
        id: "hotspot-halo",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "sel"], 14, 8.5], 15, ["case", ["get", "sel"], 24, 14]],
          "circle-color": "#101316",
          // markers start hidden and fade in once the first data lands
          "circle-opacity": 0,
        },
      });
      map.addLayer({
        id: "hotspots",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "sel"], 9, 5.5], 15, ["case", ["get", "sel"], 15, 9.5]],
          "circle-color": flowStepExpression("cur"),
          "circle-stroke-color": ["case", ["get", "sel"], "#eceee9", "#101316"],
          "circle-stroke-width": ["case", ["get", "sel"], 3, 1.5],
          "circle-opacity": 0,
          "circle-stroke-opacity": 0,
        },
      });
      addPills(map);
      addGlyphs(map);
      // pill text: cause icon, slowdown, and an arrow when a live reading is off its usual level
      const ink = ["case", [">=", ["get", "cur"], 2], "l", "d"];
      const ratio = ["concat", " ", ["number-format", ["get", "cur"], { "min-fraction-digits": 1, "max-fraction-digits": 1 }], "×"];
      const pillText = [
        "case",
        ["==", ["get", "trend"], ""],
        ["format", ["image", ["concat", "c-", ["get", "cause"], "-", ink]], {}, ratio, {}],
        ["format", ["image", ["concat", "c-", ["get", "cause"], "-", ink]], {}, ratio, {}, " ", {}, ["image", ["concat", "t-", ["get", "trend"], "-", ink]], {}],
      ];
      map.addLayer({
        id: "hotspot-pills",
        type: "symbol",
        source: "hotspots",
        // flowing spots stay plain dots until the map is zoomed in, so the ones that matter stand out
        filter: ["all", [">", ["get", "cur"], 0], ["any", ["get", "sel"], ["get", "notable"]]],
        layout: {
          "text-field": pillText as never,
          "text-font": ["Noto Sans Bold"],
          "text-size": ["case", ["get", "sel"], 14, 12],
          "icon-image": ["step", ["get", "cur"], "pill-none", 0.01, "pill-0", 1.15, "pill-1", 1.5, "pill-2", 2, "pill-3", 3, "pill-4"],
          "icon-text-fit": "both",
          "icon-text-fit-padding": [2, 7, 2, 7],
          // when pills collide the worst spot, then the selected one, keeps its pill
          "symbol-sort-key": ["case", ["get", "sel"], -100, ["-", 0, ["get", "cur"]]],
          "symbol-z-order": "source",
          "icon-allow-overlap": false,
          "text-allow-overlap": false,
          "icon-padding": 1,
        },
        paint: {
          "text-color": ["step", ["get", "cur"], "#101316", 2, "#ffffff"],
          "icon-opacity": 0,
          "text-opacity": 0,
        },
      });
      const pillDef = map.getLayer("hotspot-pills")!;
      map.addLayer(
        {
          id: "hotspot-pills-near",
          type: "symbol",
          source: "hotspots",
          minzoom: 12.5,
          filter: ["all", [">", ["get", "cur"], 0], ["!", ["get", "sel"]], ["!", ["get", "notable"]]],
          layout: Object.fromEntries(Object.keys(pillDef.layout ?? {}).map((k) => [k, map.getLayoutProperty("hotspot-pills", k)])) as never,
          paint: { "text-color": "#101316", "icon-opacity": 1, "text-opacity": 1 },
        },
        "hotspot-pills",
      );
      // the -transition keys are valid MapLibre style but missing from its types
      const fade = (layer: string, prop: string, delay = 0) => map.setPaintProperty(layer, `${prop}-transition` as never, { duration: 700, delay } as never);
      fade("hotspot-halo", "circle-opacity");
      fade("hotspots", "circle-opacity", 120);
      fade("hotspots", "circle-stroke-opacity", 120);
      fade("hotspot-pills", "icon-opacity", 260);
      fade("hotspot-pills", "text-opacity", 260);
      map.addLayer({
        id: "hotspot-labels",
        type: "symbol",
        source: "hotspots",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["case", ["get", "sel"], 14, 12.5],
          "text-offset": [0, 1.4],
          "text-anchor": "top",
          "text-optional": true,
          "symbol-sort-key": ["case", ["get", "sel"], 0, ["-", 10, ["get", "cur"]]],
        },
        paint: {
          "text-color": "#eceee9",
          "text-halo-color": "#101316",
          "text-halo-width": 1.6,
          // names show from city zoom for the worst spots, and always for the one selected
          "text-opacity": ["step", ["zoom"], ["case", ["get", "sel"], 1, [">=", ["get", "cur"], 2], 1, 0], 12, 1],
        },
      });

      map.addSource("user", { type: "geojson", data: empty });
      map.addLayer({ id: "user-halo", type: "circle", source: "user", paint: { "circle-radius": 16, "circle-color": "#2d6cdf", "circle-opacity": 0.2 } });
      map.addLayer({ id: "user", type: "circle", source: "user", paint: { "circle-radius": 6.5, "circle-color": "#4f8bf5", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } });

      // desktop hover names
      const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 14 });
      map.on("mousemove", (e) => {
        if (coarse) return;
        const a = pick(map, e, areasRef.current);
        map.getCanvas().style.cursor = a ? "pointer" : "";
        if (!a) return void popup.remove();
        popup.setLngLat([a.lon, a.lat]).setHTML(`<strong style="font-weight:600">${a.name}</strong>`).addTo(map);
      });
      const cuePopup = new Popup({ closeButton: false, offset: 14, maxWidth: "220px" });
      map.on("click", (e) => {
        const a = pick(map, e, areasRef.current);
        if (a) return onSelectRef.current(a.id);
        // a tap on a road symbol names it
        const { x, y } = e.point;
        const cue = map.queryRenderedFeatures(
          [
            [x - 14, y - 14],
            [x + 14, y + 14],
          ],
          { layers: CUES.map((c) => `cue-${c.kind}`).concat("cue-oneway-rev") },
        )[0];
        if (cue) {
          const kind = cue.layer.id === "cue-oneway-rev" ? "oneway" : cue.layer.id.replace("cue-", "");
          const c = CUES.find((k) => k.kind === kind)!;
          const at = cue.geometry.type === "Point" ? ((cue.geometry as GeoJSON.Point).coordinates as [number, number]) : e.lngLat;
          cuePopup.setLngLat(at).setHTML(`<strong style="font-weight:600">${c.label}</strong>`).addTo(map);
          return;
        }
        cuePopup.remove();
        onSelectRef.current(null);
      });

      const report = () => onZoomRef.current?.(map.getZoom());
      map.on("zoomend", report);
      report();

      ready.current = true;
      for (const fn of queue.current) fn();
      queue.current = [];
    });
    return () => {
      ready.current = false;
      rings.clear();
      // tearing down WebGL takes a while on phones: do it just after the next page's first frame, not before it
      requestAnimationFrame(() => setTimeout(() => map.remove(), 0));
    };
  }, []);

  // data that depends on mode / hour / live readings
  useEffect(() => {
    whenReady(() => {
      const map = mapRef.current!;
      const typical = mode === "typical";
      const hotspots: GeoJSON.Feature[] = areas.map((a) => {
        const cur = typical ? atHour(a.profile?.hours ?? [], hour) : (liveRatio[a.id] ?? null);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [a.lon, a.lat] },
          properties: {
            id: a.id,
            name: a.name,
            cur: cur ?? 0,
            sel: a.id === selectedId,
            cause: kindsOf(a.causes)[0] ?? "signal",
            trend: typical ? "" : (trend[a.id] ?? ""),
            notable: (cur ?? 0) >= 1.15 || (!typical && !!trend[a.id]),
          },
        };
      });
      (map.getSource("hotspots") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: hotspots });
      syncPulses(map, pulses.current, hotspots);
      if (map.getPaintProperty("hotspots", "circle-opacity") === 0) {
        map.setPaintProperty("hotspot-halo", "circle-opacity", 0.85);
        map.setPaintProperty("hotspots", "circle-opacity", 1);
        map.setPaintProperty("hotspots", "circle-stroke-opacity", 1);
        map.setPaintProperty("hotspot-pills", "icon-opacity", 1);
        map.setPaintProperty("hotspot-pills", "text-opacity", 1);
      }

      const sel = areas.find((a) => a.id === selectedId);
      const route: GeoJSON.Feature[] = sel
        ? sel.stretches.map((s) => ({
            type: "Feature" as const,
            geometry: { type: "LineString" as const, coordinates: s.g },
            properties: { typical, cur: atHour(profileHours.map((h, i) => [h, s.r[i]]), hour) ?? 0 },
          }))
        : [];
      (map.getSource("route") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: route });

      const stretches: GeoJSON.Feature[] =
        typical && layers.stretches
          ? areas.flatMap((a) =>
              a.stretches.map((s) => ({
                type: "Feature" as const,
                geometry: { type: "LineString" as const, coordinates: s.g },
                properties: { id: a.id, cur: atHour(profileHours.map((h, i) => [h, s.r[i]]), hour) ?? 0 },
              })),
            )
          : [];
      (map.getSource("stretches") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: stretches });

      const inc: GeoJSON.Feature[] =
        typical || !layers.incidents
          ? []
          : incidents
              .filter((i) => i.p.iconCategory === 6 && i.g.type === "LineString")
              .map((i) => ({ type: "Feature" as const, geometry: i.g as GeoJSON.LineString, properties: { mag: i.p.magnitudeOfDelay } }));
      (map.getSource("incidents") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: inc });
      map.setLayoutProperty("tt-flow", "visibility", !typical && layers.flow ? "visible" : "none");
      for (const c of CUES) {
        const v = layers[c.kind] ? "visible" : "none";
        for (const id of c.kind === "oneway" ? ["cue-oneway", "cue-oneway-rev"] : [`cue-${c.kind}`]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
      }
    });
  }, [areas, profileHours, mode, hour, liveRatio, incidents, selectedId, layers, trend]);

  // fly to the selected spot, keeping it clear of the sheet or side panel
  const target = useRef<{ center: [number, number]; zoom: number } | null>(null);
  useEffect(() => {
    const a = areas.find((x) => x.id === selectedId);
    if (!a) {
      target.current = null;
      return;
    }
    whenReady(() => {
      const map = mapRef.current!;
      // close enough that its signals, U-turns and one-way arrows show
      target.current = { center: [a.lon, a.lat], zoom: Math.max(map.getZoom(), 14.6) };
      map.flyTo({ ...target.current, padding: paddingRef.current, duration: 800, curve: 1.3, essential: true });
    });
  }, [selectedId, areas]);

  // when the sheet moves, slide the map's centre with it
  const padKey = `${padding.top}|${padding.bottom}|${padding.left}|${padding.right}`;
  useEffect(() => {
    // the sheet often rises while the map is still flying to a spot: carry on to it rather than stop short
    whenReady(() => mapRef.current!.easeTo({ ...(target.current ?? {}), padding: paddingRef.current, duration: target.current ? 650 : 300 }));
  }, [padKey]);

  useEffect(() => {
    whenReady(() => {
      const map = mapRef.current!;
      (map.getSource("user") as GeoJSONSource | undefined)?.setData(
        user ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: user }, properties: {} }] } : empty,
      );
    });
  }, [user]);

  useEffect(() => {
    if (!zoomInTick) return;
    whenReady(() => mapRef.current!.easeTo({ zoom: Math.max(mapRef.current!.getZoom(), 14.6), padding: paddingRef.current, duration: 700 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomInTick]);

  useEffect(() => {
    if (!user || !locateTick) return;
    whenReady(() => mapRef.current!.flyTo({ center: user, zoom: 14, padding: paddingRef.current, duration: 800, essential: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateTick]);

  // MapLibre sets position: relative on its container, so the absolute box is a wrapper
  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" role="region" aria-label="Map of Hyderabad congestion hotspots" />
    </div>
  );
}

/** The spot nearest a tap, within a finger-sized box; tapping a stretch picks its spot too. */
function pick(map: MLMap, e: MapMouseEvent, areas: AreaWithStretches[]) {
  const { x, y } = e.point;
  const box = (r: number): [[number, number], [number, number]] => [
    [x - r, y - r],
    [x + r, y + r],
  ];
  let id: string | undefined;
  let bd = Infinity;
  for (const f of map.queryRenderedFeatures(box(TAP_PX), { layers: ["hotspots", "hotspot-pills", "hotspot-pills-near"] })) {
    const p = map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) {
      bd = d;
      id = f.properties?.id;
    }
  }
  id ??= map.queryRenderedFeatures(box(8), { layers: ["stretches"] })[0]?.properties?.id;
  return id ? (areas.find((a) => a.id === id) ?? null) : null;
}
