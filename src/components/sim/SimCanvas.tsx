"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Simulation, Vehicle, VType } from "@/sim/engine";
import { flowColor } from "@/lib/flow";

// Drawn with west on the left, as on a map: Tolichowki left, Mehdipatnam right.
// Eastbound (towards Mehdipatnam) runs on the upper carriageway, westbound on the lower,
// each keeping left as traffic in India does, so kerb lanes are on the outer edges.

// validated categorical steps for the asphalt surface; two-wheelers, the majority, stay neutral
export const VEHICLE_COLORS: Record<VType, string> = {
  "2w": "#c9d1cc",
  car: "#3987e5",
  auto: "#c98500",
  bus: "#d95926",
  lcv: "#199e70",
};

export const MARK = {
  median: "#f0d860",
  newUturn: "#7aa5f5",
  wrong: "#ff5a5a",
  busLane: "#d9592633",
  rail: "#c9d1cc",
};

export interface SimCanvasHandle {
  draw: () => void;
}

interface Props {
  sim: Simulation;
  window: [number, number]; // chainage range shown in the street view
  labels: { s: number; name: string }[];
  title: string;
  onPickWindow: (center: number) => void;
  /** today's openings, so new ones can be marked */
  baseOpenings?: number[];
}

const LANE_PX = 13;
const MEDIAN_PX = 8;
const OVERVIEW_H = 30;
const GAP = 44;
const FONT = "500 11px var(--font-plex), system-ui, sans-serif";

export const SimCanvas = forwardRef<SimCanvasHandle, Props>(function SimCanvas({ sim, window: win, labels, title, onPickWindow, baseOpenings }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const winRef = useRef(win);
  winRef.current = win;

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const L = sim.L;
    const model = sim.model;
    const layout = sim.layout;
    const ow = layout.oneWay ?? null;

    // ---------- overview strip: speed along the whole corridor ----------
    const ox = (s: number) => ((L - s) / L) * W;
    const cell = 25;
    const n = Math.ceil(L / cell);
    const speedSum = [new Float32Array(n), new Float32Array(n)];
    const count = [new Uint16Array(n), new Uint16Array(n)];
    for (const v of sim.vehicles) {
      if (v.state === "wrongside") continue;
      const s = sim.sOf(v.cw, v.x);
      const i = Math.min(n - 1, Math.max(0, Math.floor(s / cell)));
      speedSum[v.cw][i] += v.v;
      count[v.cw][i] += 1;
    }
    const free = (sim.A.freeSpeed / 3.6) * 0.9;
    for (const cw of [1, 0] as const) {
      const y = cw === 1 ? 0 : OVERVIEW_H / 2 + 1;
      for (let i = 0; i < n; i++) {
        const x0 = ox((i + 1) * cell);
        const x1 = ox(i * cell);
        const k = count[cw][i];
        g.fillStyle = ow !== null && ow !== cw ? "#1a1f23" : k ? flowColor(free / Math.max(0.6, speedSum[cw][i] / k)) : "#21272c";
        g.fillRect(x0, y, x1 - x0 + 0.5, OVERVIEW_H / 2 - 1);
      }
    }
    const [w0, w1] = winRef.current;
    g.strokeStyle = "#eceee9";
    g.lineWidth = 1.5;
    g.strokeRect(ox(w1), 0.75, ox(w0) - ox(w1), OVERVIEW_H - 1.5);
    g.fillStyle = "#a9b1ab";
    g.font = FONT;
    g.textBaseline = "top";
    // place names under the strip, dropping any that would collide on a narrow screen
    let right = -Infinity;
    for (const l of [...labels].sort((p, q) => ox(p.s) - ox(q.s))) {
      const tw = g.measureText(l.name).width;
      const x0 = Math.min(W - tw, Math.max(0, ox(l.s) - tw / 2));
      if (x0 < right + 8) continue;
      g.fillText(l.name, x0, OVERVIEW_H + 4);
      right = x0 + tw;
    }

    // ---------- street view ----------
    const top = OVERVIEW_H + GAP;
    const span = w1 - w0;
    const sx = (s: number) => ((w1 - s) / span) * W;
    const ppm = W / span;
    const maxLanes = 3;
    const medianY = top + maxLanes * LANE_PX;
    const roadBottom = medianY + MEDIAN_PX + maxLanes * LANE_PX;
    const lanesOf = (side: 0 | 1, s: number) => sim.roadLanes(side, s);
    // y of the kerb-side edge of lane k (counted from the kerb) on a carriageway
    const laneTop = (side: 0 | 1, s: number, k: number) =>
      side === 1 ? medianY - lanesOf(1, s) * LANE_PX + k * LANE_PX : medianY + MEDIAN_PX + (lanesOf(0, s) - 1 - k) * LANE_PX;

    // carriageways, drawn per 10 m so lane drops show
    for (let s = Math.floor(w0 / 10) * 10; s < w1; s += 10) {
      const x0 = sx(s + 10);
      const x1 = sx(s);
      const le = lanesOf(1, s + 5);
      const lw = lanesOf(0, s + 5);
      g.fillStyle = "#262c31";
      g.fillRect(x0, medianY - le * LANE_PX, x1 - x0 + 0.6, le * LANE_PX);
      g.fillRect(x0, medianY + MEDIAN_PX, x1 - x0 + 0.6, lw * LANE_PX);
      if (layout.busLane) {
        // the kerb lane of each running carriageway, reserved for buses and autos
        g.fillStyle = MARK.busLane;
        for (const side of [0, 1] as const) {
          if (ow !== null && side !== ow) continue;
          g.fillRect(x0, laneTop(side, s + 5, 0), x1 - x0 + 0.6, LANE_PX);
        }
      }
    }
    // lane lines
    g.strokeStyle = "#ffffff22";
    g.setLineDash([6, 8]);
    g.lineWidth = 1;
    for (let l = 1; l < maxLanes; l++) {
      g.beginPath();
      g.moveTo(0, medianY - l * LANE_PX);
      g.lineTo(W, medianY - l * LANE_PX);
      g.moveTo(0, medianY + MEDIAN_PX + l * LANE_PX);
      g.lineTo(W, medianY + MEDIAN_PX + l * LANE_PX);
      g.stroke();
    }
    g.setLineDash([]);

    // travel arrows painted on each carriageway; both point the same way on a one-way road
    const step = Math.max(60, Math.round(140 / ppm / 20) * 20);
    g.fillStyle = "#ffffff26";
    for (let s = Math.ceil(w0 / step) * step + step / 2; s < w1; s += step) {
      for (const side of [0, 1] as const) {
        const dirRight = ow === null ? side === 1 : ow === 1;
        const lanes = lanesOf(side, s);
        const y = side === 1 ? medianY - (lanes * LANE_PX) / 2 : medianY + MEDIAN_PX + (lanes * LANE_PX) / 2;
        const x = sx(s);
        const d = dirRight ? 1 : -1;
        g.beginPath();
        g.moveTo(x + 7 * d, y);
        g.lineTo(x - 3 * d, y - 4.5);
        g.lineTo(x - 3 * d, y + 4.5);
        g.closePath();
        g.fill();
      }
    }
    if (layout.busLane && span < 900) {
      g.fillStyle = "#f0a27a";
      g.font = "600 9px var(--font-plex), system-ui, sans-serif";
      g.textBaseline = "middle";
      for (let s = Math.ceil(w0 / 150) * 150 + 75; s < w1; s += 150) {
        for (const side of [0, 1] as const) {
          if (ow !== null && side !== ow) continue;
          g.fillText("BUS", sx(s) - 8, laneTop(side, s, 0) + LANE_PX / 2);
        }
      }
    }

    // median kerb: black-and-yellow, broken where there is an opening
    const openings = layout.openings;
    for (let s = Math.floor(w0 / 4) * 4; s < w1; s += 4) {
      if (openings.some((o) => Math.abs(o.s - s) < 7)) continue;
      g.fillStyle = Math.floor(s / 4) % 2 ? MARK.median : "#15181b";
      g.fillRect(sx(s + 4), medianY + 1, 4 * ppm + 0.5, MEDIAN_PX - 2);
    }
    for (const o of openings) {
      if (o.s < w0 - 40 || o.s > w1 + 40) continue;
      if (o.pocket) {
        g.fillStyle = "#3a434a";
        g.fillRect(sx(o.s + 32), medianY + 1, 25 * ppm, MEDIAN_PX - 2);
        g.fillRect(sx(o.s - 7), medianY + 1, 25 * ppm, MEDIAN_PX - 2);
      }
      // U-turn marker: blue when it is new in this design
      const isNew = baseOpenings && !baseOpenings.some((b) => Math.abs(b - o.s) < 15);
      const x = sx(o.s);
      g.strokeStyle = isNew ? MARK.newUturn : MARK.median;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x, medianY + MEDIAN_PX / 2, 4.5, -Math.PI / 2, Math.PI / 2, x > W / 2);
      g.stroke();
    }

    // lane drop: a taper marker where three lanes become two
    for (const seg of model.lanes) {
      if (layout.fullLanes || seg.from <= 0 || seg.from < w0 || seg.from > w1) continue;
      const x = sx(seg.from);
      g.fillStyle = "#f39228";
      g.font = FONT;
      g.textBaseline = "bottom";
      const t = "Lane drop";
      g.fillText(t, Math.min(W - g.measureText(t).width - 2, Math.max(2, x - g.measureText(t).width / 2)), top - 16);
      g.fillRect(x - 0.75, top - 14, 1.5, roadBottom - top + 14);
    }

    // enforcement: railings along both kerbs and cameras at the openings
    if (layout.enforcement) {
      g.fillStyle = MARK.rail;
      for (let s = Math.floor(w0 / 6) * 6; s < w1; s += 6) {
        g.fillRect(sx(s), medianY - lanesOf(1, s) * LANE_PX - 2.5, 1.5, 2);
        g.fillRect(sx(s), medianY + MEDIAN_PX + lanesOf(0, s) * LANE_PX + 0.5, 1.5, 2);
      }
    }

    // bus stops (and bays)
    for (const b of model.busStops) {
      if (b.s < w0 - 20 || b.s > w1 + 20) continue;
      const bay = layout.busBays.some((x) => Math.abs(x - b.s) < 6);
      const x = sx(b.s);
      // on a one-way road every stop sits on the running carriageway's kerb
      const side = (ow ?? b.cw) as 0 | 1;
      const yKerb = side === 1 ? medianY - lanesOf(1, b.s) * LANE_PX : medianY + MEDIAN_PX + lanesOf(0, b.s) * LANE_PX;
      if (bay) {
        g.fillStyle = "#3a434a";
        const bw = 45 * ppm;
        g.fillRect(x - bw / 2, side === 1 ? yKerb - 9 : yKerb, bw, 9);
      }
      g.fillStyle = "#f39228";
      g.fillRect(x - 1, side === 1 ? yKerb - 14 : yKerb + 2, 2, 12);
      g.fillStyle = "#a9b1ab";
      g.font = "500 10.5px var(--font-plex), system-ui, sans-serif";
      g.textBaseline = side === 1 ? "bottom" : "top";
      g.fillText(bay ? "Bus bay" : "Bus stop", x + 4, side === 1 ? yKerb - 2 : yKerb + 2);
    }
    // signals
    for (const sig of model.signals) {
      if (sig.s < w0 - 5 || sig.s > w1 + 5) continue;
      const share = sig.green ?? (sig.name ? layout.signalGreens?.[sig.name] : undefined) ?? layout.signalGreen;
      const ph = (((sim.t + sig.offset) % sig.cycle) + sig.cycle) % sig.cycle;
      const red = ph >= share * sig.cycle;
      const x = sx(sig.s);
      for (const side of [0, 1] as const) {
        if (sig.cw !== undefined && sig.cw !== side && ow === null) continue;
        g.fillStyle = red ? "#cf2f3d" : "#29a36a";
        const y0 = side === 1 ? medianY - lanesOf(1, sig.s) * LANE_PX : medianY + MEDIAN_PX;
        g.fillRect(x - 1.5, y0, 3, lanesOf(side, sig.s) * LANE_PX);
      }
    }

    // vehicles
    const place = (v: Vehicle, s: number): { side: 0 | 1; k: number } => {
      if (ow === null) return { side: v.cw, k: v.lane };
      const own = lanesOf(ow, s);
      if (v.lane < own) return { side: ow, k: v.lane };
      const other = (1 - ow) as 0 | 1;
      return { side: other, k: lanesOf(other, s) - 1 - (v.lane - own) };
    };
    for (const v of sim.vehicles) {
      const s = sim.sOf(v.cw, v.x);
      if (s < w0 - 15 || s > w1 + 15) continue;
      const len = Math.max(2.5, v.len * ppm);
      const wid = v.type === "2w" ? 4 : v.type === "auto" ? 7 : v.type === "bus" ? 10 : 8;
      const { side, k } = place(v, s);
      let y: number;
      if (v.state === "pocket" && v.type !== "bus" && v.type !== "auto") {
        y = medianY + MEDIAN_PX / 2 - 2; // in the waiting pocket
      } else if (v.state === "pocket") {
        // in a bus bay or auto bay, off the kerb lane
        y = side === 1 ? medianY - lanesOf(1, s) * LANE_PX - 8 : medianY + MEDIAN_PX + lanesOf(0, s) * LANE_PX + 1;
      } else if (v.state === "wrongside") {
        y = side === 1 ? medianY - lanesOf(1, s) * LANE_PX + 1 : medianY + MEDIAN_PX + lanesOf(0, s) * LANE_PX - 5;
      } else {
        y = laneTop(side, s, k) + LANE_PX / 2 - wid / 2;
      }
      const xFront = sx(s);
      // eastbound moves right (front at the larger x); westbound moves left
      const x0 = v.cw === 1 ? xFront - len : xFront;
      if (v.state === "wrongside") {
        g.fillStyle = MARK.wrong;
        g.beginPath();
        g.arc(xFront, y + 2, 2.6, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      g.fillStyle = VEHICLE_COLORS[v.type];
      g.fillRect(x0, y, len, wid);
      if (v.state === "uturn-wait" || (v.state === "pocket" && v.type !== "bus" && v.type !== "auto")) {
        g.strokeStyle = MARK.median;
        g.lineWidth = 1.5;
        g.strokeRect(x0 - 1, y - 1, len + 2, wid + 2);
      }
    }

    // direction labels
    g.fillStyle = "#a9b1ab";
    g.font = FONT;
    const up = ow === 0 ? "← Towards Tolichowki" : "Towards Mehdipatnam →";
    const down = ow === 1 ? "Towards Mehdipatnam →" : "← Towards Tolichowki";
    g.textBaseline = "bottom";
    if (ow === 0) g.fillText(up, W - g.measureText(up).width - 4, top - 2);
    else g.fillText(up, 4, top - 2);
    g.textBaseline = "top";
    if (ow === 1) g.fillText(down, 4, roadBottom + 4);
    else g.fillText(down, W - g.measureText(down).width - 4, roadBottom + 4);
    // scale bar
    const m100 = 100 * ppm;
    g.fillRect(4, roadBottom + 24, m100, 2);
    g.fillText("100 m", 8 + m100, roadBottom + 18);
  };

  useImperativeHandle(ref, () => ({ draw }));

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(() => draw());
    if (canvas.current) ro.observe(canvas.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win]);

  // tap or drag on the overview strip moves the street view
  const pickAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientY - r.top > OVERVIEW_H + 18) return false;
    onPickWindow(sim.L - ((e.clientX - r.left) / r.width) * sim.L);
    return true;
  };

  return (
    <canvas
      ref={canvas}
      onPointerDown={(e) => {
        if (pickAt(e)) e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pickAt(e);
      }}
      className="block h-[200px] w-full cursor-pointer touch-pan-y select-none"
      aria-label={`${title}: live simulation of the corridor. Tap or drag the strip at the top to move the street view.`}
      role="img"
    />
  );
});
