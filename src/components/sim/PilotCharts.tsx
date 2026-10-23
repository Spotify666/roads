"use client";

import { useState } from "react";
import { flowColor, hourLabel } from "@/lib/flow";

const PLACES = [
  { s: 0, name: "Mehdipatnam" },
  { s: 986, name: "Rethibowli" },
  { s: 1371, name: "Nanal Nagar" },
  { s: 1934, name: "Salarjung Colony" },
  { s: 2696, name: "Tolichowki" },
];

export function placeNear(s: number) {
  return PLACES.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a)).name;
}

type Stretch = { from: number; to: number; ff: number; hours: [number, number, number][] };

/** Stretch-by-hour grid for one direction of the pilot corridor (TomTom typical weekday). */
export function StretchGrid({ stretches, title }: { stretches: Stretch[]; title: string }) {
  const hours = stretches[0].hours.map((h) => h[0]);
  const [sel, setSel] = useState<{ i: number; h: number } | null>(null);
  const cur = sel ? stretches[sel.i].hours[sel.h] : null;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 text-[16px] font-semibold">{title}</figcaption>
      <div className="overflow-x-auto pb-1">
        <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-[3px] text-[12.5px]">
          <thead>
            <tr>
              <th scope="col" className="w-[190px] text-left font-medium text-ink-2">
                Stretch
              </th>
              {hours.map((h) => (
                <th key={h} scope="col" className="font-medium text-ink-2 num">
                  {h % 12 === 0 ? (h === 0 ? "12a" : "12p") : h < 12 ? `${h}a` : `${h - 12}p`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stretches.map((st, i) => (
              <tr key={i}>
                <th scope="row" className="pr-2 text-left font-normal whitespace-nowrap num">
                  {Math.min(st.from, st.to)}–{Math.max(st.from, st.to)} m <span className="text-ink-2">· {placeNear((st.from + st.to) / 2)}</span>
                </th>
                {st.hours.map(([h, r, d], hi) => (
                  <td key={h} className="p-0">
                    <button
                      type="button"
                      onMouseEnter={() => setSel({ i, h: hi })}
                      onFocus={() => setSel({ i, h: hi })}
                      onMouseLeave={() => setSel(null)}
                      className="block h-7 w-full rounded-[3px]"
                      style={{ background: flowColor(r) }}
                      aria-label={`${st.from} to ${st.to} m at ${hourLabel(h)}: ${r.toFixed(2)} times free flow, ${d} s lost`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 h-5 text-[13px] text-ink-2 num" aria-live="polite">
        {cur && sel
          ? `${stretches[sel.i].from}–${stretches[sel.i].to} m at ${hourLabel(cur[0])}: ${cur[1].toFixed(2)}× free flow, ${cur[2]} s lost on this stretch`
          : "Hover a cell for the numbers. Chainage is metres from Mehdipatnam."}
      </p>
    </figure>
  );
}

interface CalRow {
  hour: number;
  tomtom: number;
  sim: number;
}

/** TomTom typical slowdown against the calibrated simulation, one small chart per direction. */
export function CalibrationChart({ rows, title }: { rows: CalRow[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 520,
    H = 220,
    pad = { l: 40, r: 12, t: 14, b: 28 };
  const maxY = Math.max(2.2, ...rows.map((r) => Math.max(r.tomtom, r.sim))) + 0.1;
  const x = (h: number) => pad.l + (h / 23) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - 1) / (maxY - 1)) * (H - pad.t - pad.b);
  const line = (k: "tomtom" | "sim") => rows.map((r, i) => `${i ? "L" : "M"}${x(r.hour).toFixed(1)},${y(r[k]).toFixed(1)}`).join(" ");
  const ticks = [1, 1.5, 2, 2.5].filter((t) => t <= maxY);
  const h = hover != null ? rows[hover] : null;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-[16px] font-semibold">{title}</figcaption>
      <div className="mb-2 flex gap-5 text-[13px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 bg-[#2a78d6]" />
          TomTom typical
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 bg-[#eb6834]" />
          Simulated today
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${title}: simulated slowdown follows TomTom's typical slowdown through the day`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const hx = (((e.clientX - r.left) / r.width) * W - pad.l) / (W - pad.l - pad.r) * 23;
          let best = 0;
          rows.forEach((row, i) => {
            if (Math.abs(row.hour - hx) < Math.abs(rows[best].hour - hx)) best = i;
          });
          setHover(best);
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#14171a" strokeOpacity={0.08} />
            <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#4a5157" className="num">
              {t.toFixed(1)}×
            </text>
          </g>
        ))}
        {[0, 6, 12, 18, 23].map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor={t === 23 ? "end" : t === 0 ? "start" : "middle"} fontSize="11" fill="#4a5157">
            {hourLabel(t)}
          </text>
        ))}
        <path d={line("tomtom")} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinejoin="round" />
        <path d={line("sim")} fill="none" stroke="#eb6834" strokeWidth={2} strokeLinejoin="round" strokeDasharray="5 3" />
        {h && (
          <g>
            <line x1={x(h.hour)} x2={x(h.hour)} y1={pad.t} y2={H - pad.b} stroke="#14171a" strokeOpacity={0.25} />
            <circle cx={x(h.hour)} cy={y(h.tomtom)} r={4} fill="#2a78d6" stroke="#f3f3ee" strokeWidth={2} />
            <circle cx={x(h.hour)} cy={y(h.sim)} r={4} fill="#eb6834" stroke="#f3f3ee" strokeWidth={2} />
          </g>
        )}
      </svg>
      <p className="mt-1 h-5 text-[13px] text-ink-2 num" aria-live="polite">
        {h ? `${hourLabel(h.hour)}: TomTom ${h.tomtom.toFixed(2)}×, simulation ${h.sim.toFixed(2)}×` : "Hover the chart for each hour."}
      </p>
    </figure>
  );
}
