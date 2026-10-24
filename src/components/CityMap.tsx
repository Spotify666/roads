"use client";

import { useEffect, useRef } from "react";
import { AttributionControl, Map as MLMap, NavigationControl, Popup, type GeoJSONSource, type MapMouseEvent, type PaddingOptions } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { atHour, flowStepExpression } from "@/lib/flow";
import type { AreaSummary, LiveIncident } from "@/lib/types";

type Stretch = { g: [number, number][]; r: number[] };
export type AreaWithStretches = AreaSummary & { stretches: Stretch[] };

export interface MapLayers {
  flow: boolean; // TomTom live traffic tiles
  incidents: boolean;
  stretches: boolean; // typical-weekday stretches
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

export function CityMap({ areas, profileHours, mode, hour, liveRatio, incidents, selectedId, onSelect, padding, layers, user, locateTick }: Props) {
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
  const pulseRaf = useRef(0);

  const whenReady = (fn: () => void) => {
    if (ready.current) fn();
    else queue.current.push(fn);
  };

  useEffect(() => {
    if (!el.current) return;
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

      map.addSource("hotspots", { type: "geojson", data: empty });
      // a soft ring that breathes around jammed spots
      map.addLayer({
        id: "hotspot-pulse",
        type: "circle",
        source: "hotspots",
        filter: [">=", ["get", "cur"], 2],
        paint: { "circle-radius": 10, "circle-color": flowStepExpression("cur"), "circle-opacity": 0, "circle-blur": 0.35 },
      });
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
      // the -transition keys are valid MapLibre style but missing from its types
      const fade = (layer: string, prop: string, delay = 0) => map.setPaintProperty(layer, `${prop}-transition` as never, { duration: 700, delay } as never);
      fade("hotspot-halo", "circle-opacity");
      fade("hotspots", "circle-opacity", 120);
      fade("hotspots", "circle-stroke-opacity", 120);
      map.addLayer({
        id: "hotspot-labels",
        type: "symbol",
        source: "hotspots",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["case", ["get", "sel"], 14, 12.5],
          "text-offset": [0, 1.25],
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
      map.on("click", (e) => onSelectRef.current(pick(map, e, areasRef.current)?.id ?? null));

      // pulse: one shared ring for every jammed spot, driven by the frame clock
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce) {
        let last = 0;
        const tick = (t: number) => {
          // about 30 frames a second is smooth enough for a ring and kinder to batteries
          if (t - last > 33 && map.getLayer("hotspot-pulse")) {
            last = t;
            const p = (t % 1800) / 1800;
            map.setPaintProperty("hotspot-pulse", "circle-radius", 7 + (1 - Math.pow(1 - p, 3)) * 16);
            map.setPaintProperty("hotspot-pulse", "circle-opacity", 0.55 * (1 - p));
          }
          pulseRaf.current = requestAnimationFrame(tick);
        };
        pulseRaf.current = requestAnimationFrame(tick);
      }

      ready.current = true;
      for (const fn of queue.current) fn();
      queue.current = [];
    });
    return () => {
      ready.current = false;
      cancelAnimationFrame(pulseRaf.current);
      map.remove();
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
          properties: { id: a.id, name: a.name, cur: cur ?? 0, sel: a.id === selectedId },
        };
      });
      (map.getSource("hotspots") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: hotspots });
      if (map.getPaintProperty("hotspots", "circle-opacity") === 0) {
        map.setPaintProperty("hotspot-halo", "circle-opacity", 0.85);
        map.setPaintProperty("hotspots", "circle-opacity", 1);
        map.setPaintProperty("hotspots", "circle-stroke-opacity", 1);
      }

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
    });
  }, [areas, profileHours, mode, hour, liveRatio, incidents, selectedId, layers]);

  // fly to the selected spot, keeping it clear of the sheet or side panel
  useEffect(() => {
    const a = areas.find((x) => x.id === selectedId);
    if (!a) return;
    whenReady(() => {
      const map = mapRef.current!;
      map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(map.getZoom(), 13.4), padding: paddingRef.current, duration: 700, curve: 1.3, essential: true });
    });
  }, [selectedId, areas]);

  // when the sheet moves, slide the map's centre with it
  const padKey = `${padding.top}|${padding.bottom}|${padding.left}|${padding.right}`;
  useEffect(() => {
    whenReady(() => mapRef.current!.easeTo({ padding: paddingRef.current, duration: 300 }));
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
  for (const f of map.queryRenderedFeatures(box(TAP_PX), { layers: ["hotspots"] })) {
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
