"use client";

import { useEffect, useRef } from "react";
import { AttributionControl, Map as MLMap, NavigationControl, Popup, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { atHour, flowStepExpression } from "@/lib/flow";
import type { AreaSummary, LiveIncident } from "@/lib/types";

type Stretch = { g: [number, number][]; r: number[] };
export type AreaWithStretches = AreaSummary & { stretches: Stretch[] };

interface Props {
  areas: AreaWithStretches[];
  profileHours: number[];
  mode: "live" | "typical";
  hour: number;
  liveRatio: Record<string, number>;
  incidents: LiveIncident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const STYLE = "https://tiles.openfreemap.org/styles/dark";
const CENTER: [number, number] = [78.44, 17.415];

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
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "symbol" && /name|place/.test(layer.id)) {
      set(layer.id, "text-color", "#8b948f");
      set(layer.id, "text-halo-color", "#101316");
    }
  }
}

export function CityMap({ areas, profileHours, mode, hour, liveRatio, incidents, selectedId, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const map = new MLMap({
      container: el.current,
      style: STYLE,
      center: CENTER,
      zoom: window.innerWidth < 768 ? 10.3 : 11.1,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: 'Traffic © <a href="https://www.tomtom.com">TomTom</a>',
      }),
      "bottom-left",
    );
    mapRef.current = map;

    map.on("load", () => {
      restyleBase(map);
      map.addSource("tt-flow", { type: "raster", tiles: ["/api/tiles/{z}/{x}/{y}"], tileSize: 256, minzoom: 9, maxzoom: 18 });
      map.addLayer({ id: "tt-flow", type: "raster", source: "tt-flow", paint: { "raster-opacity": 0.95, "raster-fade-duration": 200 } });

      map.addSource("stretches", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
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

      map.addSource("incidents", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
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

      map.addSource("hotspots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "hotspot-halo",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "sel"], 13, 8], 15, ["case", ["get", "sel"], 22, 14]],
          "circle-color": "#101316",
          "circle-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "hotspots",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["get", "sel"], 8, 5], 15, ["case", ["get", "sel"], 14, 9]],
          "circle-color": flowStepExpression("cur"),
          "circle-stroke-color": ["case", ["get", "sel"], "#eceee9", "#101316"],
          "circle-stroke-width": ["case", ["get", "sel"], 2.5, 1.5],
        },
      });
      map.addLayer({
        id: "hotspot-labels",
        type: "symbol",
        source: "hotspots",
        minzoom: 11.6,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12.5,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: { "text-color": "#eceee9", "text-halo-color": "#101316", "text-halo-width": 1.6 },
      });

      const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 });
      map.on("mouseenter", "hotspots", (e: MapLayerMouseEvent) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        popup
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(`<strong style="font-weight:600">${f.properties?.name}</strong>`)
          .addTo(map);
      });
      map.on("mouseleave", "hotspots", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "hotspots", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) onSelectRef.current(id);
      });
      ready.current = true;
      pending.current?.();
      pending.current = null;
    });
    return () => {
      ready.current = false;
      map.remove();
    };
  }, []);

  // data that depends on mode / hour / live readings
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const typical = mode === "typical";
      const hotspots: GeoJSON.Feature[] = areas.map((a) => {
        const hrs = a.profile?.hours ?? [];
        const cur = typical ? atHour(hrs, hour) : liveRatio[a.id] ?? null;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [a.lon, a.lat] },
          properties: { id: a.id, name: a.name, cur: cur ?? 0, sel: a.id === selectedId },
        };
      });
      (map.getSource("hotspots") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: hotspots });

      const stretches: GeoJSON.Feature[] = typical
        ? areas.flatMap((a) =>
            a.stretches.map((s) => ({
              type: "Feature" as const,
              geometry: { type: "LineString" as const, coordinates: s.g },
              properties: { cur: atHour(profileHours.map((h, i) => [h, s.r[i]]), hour) ?? 0 },
            })),
          )
        : [];
      (map.getSource("stretches") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: stretches });

      const inc: GeoJSON.Feature[] = typical
        ? []
        : incidents
            .filter((i) => i.p.iconCategory === 6 && i.g.type === "LineString")
            .map((i) => ({
              type: "Feature" as const,
              geometry: i.g as GeoJSON.LineString,
              properties: { mag: i.p.magnitudeOfDelay },
            }));
      (map.getSource("incidents") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: inc });
      if (map.getLayer("tt-flow")) map.setLayoutProperty("tt-flow", "visibility", typical ? "none" : "visible");
    };
    if (ready.current) apply();
    else pending.current = apply;
  }, [areas, profileHours, mode, hour, liveRatio, incidents, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const a = areas.find((x) => x.id === selectedId);
    if (!map || !a) return;
    map.flyTo({ center: [a.lon, a.lat], zoom: Math.max(map.getZoom(), 13.2), duration: 650, essential: true });
  }, [selectedId, areas]);

  return <div ref={el} className="h-full w-full" role="region" aria-label="Map of Hyderabad congestion hotspots" />;
}
