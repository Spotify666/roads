"use client";

import { useEffect, useRef } from "react";
import { AttributionControl, Map as MLMap, NavigationControl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { flowStepExpression } from "@/lib/flow";
import type { AreaDirection } from "@/lib/types";

interface Props {
  center: [number, number];
  dirs: AreaDirection[];
  active: number; // index into dirs
  hourIndex: number;
  highlightLeg: number | null;
}

export function AreaMap({ center, dirs, active, hourIndex, highlightLeg }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const [lon, lat] = center;

  useEffect(() => {
    if (!el.current) return;
    const center: [number, number] = [lon, lat];
    const m = new MLMap({
      container: el.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center,
      zoom: 14.6,
      attributionControl: false,
      dragRotate: false,
      cooperativeGestures: true,
    });
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    m.addControl(new AttributionControl({ compact: true, customAttribution: "Traffic © TomTom" }), "bottom-left");
    m.on("load", () => {
      if (m.getLayer("background")) m.setPaintProperty("background", "background-color", "#101316");
      m.addSource("legs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "legs-casing",
        type: "line",
        source: "legs",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["case", ["get", "hl"], "#eceee9", "#0b0d0f"], "line-width": ["case", ["get", "hl"], 14, 11], "line-opacity": ["case", ["get", "other"], 0.5, 1] },
      });
      m.addLayer({
        id: "legs",
        type: "line",
        source: "legs",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": flowStepExpression("r"), "line-width": 7, "line-opacity": ["case", ["get", "other"], 0.35, 1] },
      });
      m.addSource("pt", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: center }, properties: {} } });
      m.addLayer({ id: "pt", type: "circle", source: "pt", paint: { "circle-radius": 5, "circle-color": "#eceee9", "circle-stroke-color": "#101316", "circle-stroke-width": 2 } });
      ready.current = true;
      pending.current?.();
      pending.current = null;
    });
    map.current = m;
    return () => {
      ready.current = false;
      m.remove();
    };
  }, [lon, lat]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const features: GeoJSON.Feature[] = [];
      dirs.forEach((d, di) =>
        d.legs.forEach((leg, li) =>
          features.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: leg.geom },
            properties: { r: d.hours[hourIndex]?.legs[li] ?? 0, other: di !== active, hl: di === active && li === highlightLeg },
          }),
        ),
      );
      // draw the active direction last so it sits on top
      features.sort((a, b) => Number(!a.properties!.other) - Number(!b.properties!.other));
      (m.getSource("legs") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
    };
    if (ready.current) apply();
    else pending.current = apply;
  }, [dirs, active, hourIndex, highlightLeg]);

  return <div ref={el} className="h-full w-full" role="region" aria-label="Map of the stretches studied at this spot" />;
}
