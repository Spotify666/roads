"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Simulation } from "@/sim/engine";
import { PILOT_MODEL } from "@/sim/pilot";
import { TODAY_DESIGN, makeSim, type Calibration, type Design } from "@/sim/scenario";
import { MARK, SimCanvas, VEHICLE_COLORS, type SimCanvasHandle } from "@/components/sim/SimCanvas";
import { SlidingNumber } from "@/components/ui/sliding-number";
import { cn } from "@/lib/utils";
import { ClockIcon, PauseIcon, PlayIcon, ResetIcon, UturnIcon, WrongIcon } from "./icons";

const SPOTS = [
  { s: 180, name: "Mehdipatnam" },
  { s: 960, name: "Rethibowli" },
  { s: 1450, name: "Nanal Nagar" },
  { s: 2450, name: "Tolichowki" },
];
const LABELS = [
  { s: 60, name: "Mehdipatnam" },
  { s: 986, name: "Rethibowli" },
  { s: 1371, name: "Nanal Nagar" },
  { s: 2630, name: "Tolichowki" },
];
// metres of road in the street view: less on narrow screens so vehicles stay legible
const spanFor = (width: number) => (width < 520 ? 230 : width < 900 ? 360 : 520);
const SPEEDS = [1, 4, 10, 30];

interface Counters {
  speed: number;
  waiting: number;
  wrong: number;
  done: number;
  avgTrip: number;
}

function counters(sim: Simulation): Counters {
  let sum = 0,
    n = 0,
    waiting = 0,
    wrong = 0;
  for (const v of sim.vehicles) {
    if (v.state === "wrongside") {
      wrong++;
      continue;
    }
    if (v.state === "uturn-wait" || (v.state === "pocket" && v.plan.kind === "reverse")) waiting++;
    if (v.state === "drive") {
      sum += v.v;
      n++;
    }
  }
  const through = sim.trips.filter((t) => t.through);
  const done = through.length;
  return { speed: n ? (sum / n) * 3.6 : 0, waiting, wrong, done, avgTrip: done ? through.reduce((a, t) => a + t.time, 0) / done : 0 };
}

function prefilled(d: Design, hour: number, cal: Calibration, reverseShare: number) {
  const sim = makeSim(d, hour, cal, reverseShare);
  sim.warmup = 0;
  sim.run(200, 0.5); // fill the road so the view starts mid-flow
  sim.trips = [];
  return sim;
}

function Stat({ icon, value, unit, tone }: { icon: React.ReactNode; value: React.ReactNode; unit?: string; tone?: "bad" }) {
  return (
    <span className={cn("flex items-center gap-1.5 rounded-full bg-asphalt-3 py-1 pr-2.5 pl-2 text-[12.5px] font-medium num", tone === "bad" ? "text-[#ff9a9a]" : "text-chalk")}>
      <span className="text-chalk-2">{icon}</span>
      {value}
      {unit && <span className="text-chalk-2">{unit}</span>}
    </span>
  );
}

export function LiveSim({ design, hour, cal, reverseShare, baseOpenings }: { design: Design; hour: number; cal: Calibration; reverseShare: number; baseOpenings: number[] }) {
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4);
  const [center, setCenter] = useState(1450);
  const [epoch, setEpoch] = useState(0);
  const todaySim = useMemo(() => prefilled(TODAY_DESIGN, hour, cal, reverseShare), [hour, cal, reverseShare, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  // rebuild the design run a moment after the last edit, not on every tap
  const [settled, setSettled] = useState(design);
  useEffect(() => {
    const t = setTimeout(() => setSettled(design), 220);
    return () => clearTimeout(t);
  }, [design]);
  const designSim = useMemo(() => prefilled(settled, hour, cal, reverseShare), [settled, hour, cal, reverseShare, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const sims = useRef({ today: todaySim, design: designSim });
  sims.current = { today: todaySim, design: designSim };

  const [stats, setStats] = useState<{ today: Counters; design: Counters } | null>(null);
  const todayRef = useRef<SimCanvasHandle>(null);
  const designRef = useRef<SimCanvasHandle>(null);
  const playRef = useRef(playing);
  const speedRef = useRef(speed);
  playRef.current = playing;
  speedRef.current = speed;
  const visible = useRef(true);
  const host = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState(520);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSpan(spanFor(e.contentRect.width)));
    if (host.current) ro.observe(host.current);
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    if (host.current) io.observe(host.current);
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastStats = 0;
    const loop = (now: number) => {
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { today, design: dsim } = sims.current;
      if (playRef.current && visible.current && !document.hidden) {
        acc += dtReal * speedRef.current;
        let steps = 0;
        while (acc >= 0.25 && steps < 120) {
          today.step(0.25);
          dsim.step(0.25);
          acc -= 0.25;
          steps++;
        }
        if (steps >= 120) acc = 0;
        todayRef.current?.draw();
        designRef.current?.draw();
      }
      if (now - lastStats > 500) {
        lastStats = now;
        setStats({ today: counters(today), design: counters(dsim) });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const win: [number, number] = [Math.max(0, center - span / 2), Math.min(PILOT_MODEL.length, center + span / 2)];
  const pick = useCallback((s: number) => setCenter(Math.round(Math.min(PILOT_MODEL.length - span / 2, Math.max(span / 2, s)))), [span]);

  return (
    <div ref={host}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="flex h-10 items-center gap-2 rounded-full bg-chalk px-4 text-[14px] font-semibold text-asphalt transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.96]"
          aria-pressed={playing}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => setEpoch((e) => e + 1)}
          aria-label="Restart"
          className="flex size-10 items-center justify-center rounded-full bg-asphalt-3 text-chalk transition-transform duration-150 active:scale-[0.94]"
        >
          <ResetIcon size={18} />
        </button>
        <div className="flex rounded-full bg-asphalt-2 p-1 text-[13px]" role="radiogroup" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === speed}
              onClick={() => setSpeed(s)}
              className={cn("h-8 rounded-full px-3 font-semibold num transition-colors duration-150", s === speed ? "bg-asphalt-4 text-chalk" : "text-chalk-2 hover:text-chalk")}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 text-[13px] [scrollbar-width:none]" role="group" aria-label="Jump to">
          {SPOTS.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => pick(s.s)}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 font-medium transition-colors duration-150",
                Math.abs(center - s.s) < 120 ? "bg-asphalt-4 text-chalk" : "bg-asphalt-2 text-chalk-2 hover:text-chalk",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {(["today", "design"] as const).map((k) => {
        const st = stats?.[k];
        return (
          <div key={k} className="mt-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                <span className={cn("size-2 rounded-full", k === "today" ? "bg-[#5d6870]" : "bg-sign-bright")} />
                {k === "today" ? "Today" : "Your design"}
              </h3>
              {st && (
                <div className="flex flex-wrap gap-1.5">
                  <Stat
                    icon={<span className="text-[11px] font-semibold">km/h</span>}
                    value={
                      <span className="flex">
                        <SlidingNumber value={Math.round(st.speed)} />
                      </span>
                    }
                  />
                  <Stat icon={<ClockIcon size={14} />} value={st.done >= 10 ? (st.avgTrip / 60).toFixed(1) : "…"} unit="min" />
                  <Stat icon={<UturnIcon size={14} />} value={st.waiting} />
                  <Stat icon={<WrongIcon size={14} />} value={st.wrong} tone={st.wrong ? "bad" : undefined} />
                </div>
              )}
            </div>
            <SimCanvas
              ref={k === "today" ? todayRef : designRef}
              sim={k === "today" ? todaySim : designSim}
              window={win}
              labels={LABELS}
              title={k === "today" ? "Today" : "Your design"}
              onPickWindow={pick}
              baseOpenings={baseOpenings}
            />
          </div>
        );
      })}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-chalk-2" aria-label="Legend">
        {(
          [
            ["2w", "Two-wheeler"],
            ["car", "Car"],
            ["auto", "Auto"],
            ["bus", "Bus"],
            ["lcv", "Goods"],
          ] as const
        ).map(([k, l]) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-[1px]" style={{ background: VEHICLE_COLORS[k] }} />
            {l}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-[1px] outline outline-[1.5px]" style={{ outlineColor: MARK.median }} />
          Waiting to U-turn
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: MARK.wrong }} />
          Wrong-side
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-[1.5px]" style={{ borderColor: MARK.newUturn }} />
          New U-turn
        </li>
      </ul>
    </div>
  );
}
