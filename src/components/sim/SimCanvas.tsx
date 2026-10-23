"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Simulation, VType } from "@/sim/engine";
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

export interface SimCanvasHandle {
  draw: () => void;
}

interface Props {
  sim: Simulation;
  window: [number, number]; // chainage range shown in the street view
  labels: { s: number; name: string }[];
  title: string;
  onPickWindow: (center: number) => void;
}

const LANE_PX = 13;
const MEDIAN_PX = 8;
const OVERVIEW_H = 34;
const GAP = 26;

export const SimCanvas = forwardRef<SimCanvasHandle, Props>(function SimCanvas({ sim, window: win, labels, title, onPickWindow }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const winRef = useRef(win);
  winRef.current = win;

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const L = sim.L;
    const model = sim.model;

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
        g.fillStyle = k ? flowColor(free / Math.max(0.6, speedSum[cw][i] / k)) : "#21272c";
        g.fillRect(x0, y, x1 - x0 + 0.5, OVERVIEW_H / 2 - 1);
      }
    }
    // window marker
    const [w0, w1] = winRef.current;
    g.strokeStyle = "#eceee9";
    g.lineWidth = 1.5;
    g.strokeRect(ox(w1), 0.75, ox(w0) - ox(w1), OVERVIEW_H - 1.5);
    // place labels under the strip
    g.fillStyle = "#a9b1ab";
    g.font = "500 11px var(--font-plex), system-ui, sans-serif";
    g.textBaseline = "top";
    for (const l of labels) {
      const x = ox(l.s);
      const tw = g.measureText(l.name).width;
      g.fillText(l.name, Math.min(W - tw, Math.max(0, x - tw / 2)), OVERVIEW_H + 4);
    }

    // ---------- street view ----------
    const top = OVERVIEW_H + GAP;
    const span = w1 - w0;
    const sx = (s: number) => ((w1 - s) / span) * W;
    const ppm = W / span;
    const maxLanes = 3;
    const roadTop = top;
    const medianY = roadTop + maxLanes * LANE_PX;
    const roadBottom = medianY + MEDIAN_PX + maxLanes * LANE_PX;
    // carriageways, drawn per 10 m so lane drops show
    for (let s = Math.floor(w0 / 10) * 10; s < w1; s += 10) {
      const x0 = sx(s + 10);
      const x1 = sx(s);
      const le = sim.lanesAt(1, sim.xOf(1, s + 5));
      const lw = sim.lanesAt(0, sim.xOf(0, s + 5));
      g.fillStyle = "#262c31";
      g.fillRect(x0, medianY - le * LANE_PX, x1 - x0 + 0.6, le * LANE_PX);
      g.fillRect(x0, medianY + MEDIAN_PX, x1 - x0 + 0.6, lw * LANE_PX);
    }
    // median kerb: black-and-yellow, broken where there is an opening
    const openings = sim.layout.openings;
    for (let s = Math.floor(w0 / 4) * 4; s < w1; s += 4) {
      if (openings.some((o) => Math.abs(o.s - s) < 7)) continue;
      g.fillStyle = Math.floor(s / 4) % 2 ? "#f0d860" : "#15181b";
      g.fillRect(sx(s + 4), medianY + 1, 4 * ppm + 0.5, MEDIAN_PX - 2);
    }
    // waiting pockets
    for (const o of openings) {
      if (!o.pocket || o.s < w0 - 40 || o.s > w1 + 40) continue;
      g.fillStyle = "#3a434a";
      g.fillRect(sx(o.s + 32), medianY + 1, 25 * ppm, MEDIAN_PX - 2);
      g.fillRect(sx(o.s - 7), medianY + 1, 25 * ppm, MEDIAN_PX - 2);
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

    // bus stops (and bays)
    for (const b of model.busStops) {
      if (b.s < w0 - 20 || b.s > w1 + 20) continue;
      const bay = sim.layout.busBays.some((x) => Math.abs(x - b.s) < 6);
      const x = sx(b.s);
      const yKerb = b.cw === 1 ? medianY - sim.lanesAt(1, sim.xOf(1, b.s)) * LANE_PX : medianY + MEDIAN_PX + sim.lanesAt(0, sim.xOf(0, b.s)) * LANE_PX;
      if (bay) {
        g.fillStyle = "#3a434a";
        const bw = 45 * ppm;
        g.fillRect(x - bw / 2, b.cw === 1 ? yKerb - 9 : yKerb, bw, 9);
      }
      g.fillStyle = "#f39228";
      g.fillRect(x - 1, b.cw === 1 ? yKerb - 14 : yKerb + 2, 2, 12);
      g.fillStyle = "#a9b1ab";
      g.font = "500 10.5px var(--font-plex), system-ui, sans-serif";
      g.textBaseline = b.cw === 1 ? "bottom" : "top";
      g.fillText(bay ? "Bus bay" : "Bus stop", x + 4, b.cw === 1 ? yKerb - 2 : yKerb + 2);
    }
    // signals
    for (const sig of model.signals) {
      if (sig.s < w0 - 5 || sig.s > w1 + 5) continue;
      const green = (sig.green ?? sim.layout.signalGreen) * sig.cycle;
      const ph = (((sim.t + sig.offset) % sig.cycle) + sig.cycle) % sig.cycle;
      const red = ph >= green;
      const x = sx(sig.s);
      for (const cw of [0, 1] as const) {
        if (sig.cw !== undefined && sig.cw !== cw) continue;
        g.fillStyle = red ? "#cf2f3d" : "#29a36a";
        const y0 = cw === 1 ? medianY - sim.lanesAt(1, sim.xOf(1, sig.s)) * LANE_PX : medianY + MEDIAN_PX;
        const h = sim.lanesAt(cw, sim.xOf(cw, sig.s)) * LANE_PX;
        g.fillRect(x - 1.5, y0, 3, h);
      }
    }

    // vehicles
    for (const v of sim.vehicles) {
      const s = sim.sOf(v.cw, v.x);
      if (s < w0 - 15 || s > w1 + 15) continue;
      const len = Math.max(2.5, v.len * ppm);
      const wid = v.type === "2w" ? 4 : v.type === "auto" ? 7 : v.type === "bus" ? 10 : 8;
      let y: number;
      if (v.state === "pocket" && v.type !== "bus" && v.type !== "auto") {
        y = medianY + MEDIAN_PX / 2 - 2; // in the waiting pocket
      } else if (v.state === "pocket") {
        // in a bus bay or auto bay, off the kerb lane
        y = v.cw === 1 ? medianY - sim.lanesAt(1, v.x) * LANE_PX - 8 : medianY + MEDIAN_PX + sim.lanesAt(0, v.x) * LANE_PX + 1;
      } else if (v.state === "wrongside") {
        y = v.cw === 1 ? medianY - sim.lanesAt(1, v.x) * LANE_PX + 1 : medianY + MEDIAN_PX + sim.lanesAt(0, v.x) * LANE_PX - 5;
      } else {
        // lane 0 is the kerb lane, on the outer edge of each carriageway
        const laneCenter = (v.lane + 0.5) * LANE_PX;
        y =
          v.cw === 1
            ? medianY - sim.lanesAt(1, v.x) * LANE_PX + laneCenter - wid / 2
            : medianY + MEDIAN_PX + sim.lanesAt(0, v.x) * LANE_PX - laneCenter - wid / 2;
      }
      const xFront = sx(s);
      // eastbound moves right (front at the larger x); westbound moves left
      const x0 = v.cw === 1 ? xFront - len : xFront;
      if (v.state === "wrongside") {
        g.fillStyle = "#ff5a5a";
        g.beginPath();
        g.arc(xFront, y + 2, 2.6, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      g.fillStyle = VEHICLE_COLORS[v.type];
      g.fillRect(x0, y, len, wid);
      if (v.state === "uturn-wait" || (v.state === "pocket" && v.type !== "bus" && v.type !== "auto")) {
        g.strokeStyle = "#f0d860";
        g.lineWidth = 1.5;
        g.strokeRect(x0 - 1, y - 1, len + 2, wid + 2);
      }
    }

    // direction labels
    g.fillStyle = "#a9b1ab";
    g.font = "500 11px var(--font-plex), system-ui, sans-serif";
    g.textBaseline = "bottom";
    g.fillText("Towards Mehdipatnam →", 4, roadTop - 4);
    g.textBaseline = "top";
    const t2 = "← Towards Tolichowki";
    g.fillText(t2, W - g.measureText(t2).width - 4, roadBottom + 4);
    // scale bar
    const m100 = 100 * ppm;
    g.fillStyle = "#a9b1ab";
    g.fillRect(4, roadBottom + 22, m100, 2);
    g.fillText("100 m", 8 + m100, roadBottom + 16);
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

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - r.top;
    if (y > OVERVIEW_H + 2) return;
    const s = sim.L - ((e.clientX - r.left) / r.width) * sim.L;
    onPickWindow(s);
  };

  return (
    <canvas
      ref={canvas}
      onClick={onClick}
      className="block h-[200px] w-full cursor-pointer sm:h-[208px]"
      aria-label={`${title}: live simulation of the corridor. Use the overview strip to move the street view.`}
      role="img"
    />
  );
});
