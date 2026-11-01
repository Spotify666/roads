"use client";

import { useEffect, useRef } from "react";
import { AttributionControl, Map as MLMap, NavigationControl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { flowStepExpression } from "@/lib/flow";
import type { AreaDirection } from "@/lib/types";

interface Props {
  center: [number, number];
  /** the spot's name, shown beside its junction dot */
  name: string;
  dirs: AreaDirection[];
  active: number; // index into dirs
  hourIndex: number;
  highlightLeg: number | null;
}

export function AreaMap({ center, name, dirs, active, hourIndex, highlightLeg }: Props) {
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
      // the junction the reports name; the coloured stretch is what TomTom measures through it
      m.addSource("pt", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: center }, properties: { name } } });
      m.addLayer({ id: "pt", type: "circle", source: "pt", paint: { "circle-radius": 6, "circle-color": "#eceee9", "circle-stroke-color": "#101316", "circle-stroke-width": 2.5 } });
      m.addLayer({
        id: "pt-label",
        type: "symbol",
        source: "pt",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#eceee9", "text-halo-color": "#101316", "text-halo-width": 1.8 },
      });
      ready.current = true;
      pending.current?.();
      pending.current = null;
    });
    map.current = m;
    return () => {
      ready.current = false;
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" role="region" aria-label="Map of the stretches studied at this spot" />
      <ul className="pointer-events-none absolute top-2 left-2 space-y-1 rounded-xl bg-asphalt/90 px-3 py-2 text-[11.5px] text-chalk backdrop-blur-sm" aria-label="Map key">
        <li className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-chalk ring-2 ring-asphalt" />
          {name}: the junction
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-[5px] w-4 overflow-hidden rounded-full" aria-hidden="true">
            <span className="flex-1 bg-flow-0" />
            <span className="flex-1 bg-flow-2" />
            <span className="flex-1 bg-flow-3" />
          </span>
          Stretch TomTom measures, by slowdown
        </li>
        {dirs.length > 1 && (
          <li className="flex items-center gap-2">
            <span className="h-[5px] w-4 rounded-full bg-chalk-2/40" aria-hidden="true" />
            Other direction, faded
          </li>
        )}
      </ul>
    </div>
  );
}
