"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_ASSUMPTIONS, Simulation } from "@/sim/engine";
import { PILOT_MODEL, TODAY, demandFor, fixLayout } from "@/sim/pilot";
import { SimCanvas, VEHICLE_COLORS, type SimCanvasHandle } from "@/components/sim/SimCanvas";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { SlidingNumber } from "@/components/ui/sliding-number";
import { hourLabel } from "@/lib/flow";
import { cn } from "@/lib/utils";

interface Props {
  calibration: Record<string, { qW: number; qE: number; target: number[]; got: number[] }>;
  openings: number[];
}

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
const SPAN = 520;
const SPEEDS = [1, 4, 10, 30];

interface Counters {
  clock: string;
  onRoad: number;
  speed: number;
  waiting: number;
  wrong: number;
  busBlocking: number;
  done: number;
  avgTrip: number;
  queued: number;
}

function counters(sim: Simulation, hour: number): Counters {
  let sum = 0,
    n = 0,
    waiting = 0,
    wrong = 0,
    bus = 0;
  for (const v of sim.vehicles) {
    if (v.state === "wrongside") {
      wrong++;
      continue;
    }
    if (v.state === "uturn-wait" || (v.state === "pocket" && v.plan.kind === "reverse")) waiting++;
    if (v.type === "bus" && v.state === "dwell") bus++;
    if (v.state === "drive") {
      sum += v.v;
      n++;
    }
  }
  // end-to-end trips only: the measure the calibration matches against TomTom
  const through = sim.trips.filter((t) => t.through);
  const done = through.length;
  const avgTrip = done ? through.reduce((a, t) => a + t.time, 0) / done : 0;
  const secs = hour * 3600 + Math.floor(sim.t);
  const hh = Math.floor(secs / 3600) % 24;
  const mm = Math.floor((secs % 3600) / 60);
  return {
    clock: `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`,
    onRoad: sim.vehicles.length,
    speed: n ? (sum / n) * 3.6 : 0,
    waiting,
    wrong,
    busBlocking: bus,
    done,
    avgTrip,
    queued: sim.queued,
  };
}

function make(hour: number, cal: Props["calibration"], openings: number[]) {
  const c = cal[String(hour)];
  const d = demandFor(c.qW, c.qE);
  const today = new Simulation(PILOT_MODEL, TODAY, d, DEFAULT_ASSUMPTIONS, 7, 0);
  const fix = new Simulation(PILOT_MODEL, fixLayout(openings), d, DEFAULT_ASSUMPTIONS, 7, 0);
  // fill the road before showing it, so the view starts mid-flow
  today.run(240, 0.5);
  fix.run(240, 0.5);
  today.trips = [];
  fix.trips = [];
  return { today, fix };
}

export function SimView({ calibration, openings }: Props) {
  const hours = useMemo(() => Object.keys(calibration).map(Number).filter((h) => h >= 6).sort((a, b) => a - b), [calibration]);
  const [hour, setHour] = useState(18);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(4);
  const [center, setCenter] = useState(1450);
  const [epoch, setEpoch] = useState(0);
  const sims = useMemo(() => make(hour, calibration, openings), [hour, calibration, openings, epoch]); // eslint-disable-line react-hooks/exhaustive-deps
  const [stats, setStats] = useState<{ today: Counters; fix: Counters } | null>(null);
  const todayRef = useRef<SimCanvasHandle>(null);
  const fixRef = useRef<SimCanvasHandle>(null);
  const playRef = useRef(playing);
  const speedRef = useRef(speed);
  playRef.current = playing;
  speedRef.current = speed;
  const visible = useRef(true);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    if (host.current) io.observe(host.current);
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) setPlaying(false);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastStats = 0;
    const loop = (now: number) => {
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playRef.current && visible.current) {
        acc += dtReal * speedRef.current;
        let steps = 0;
        while (acc >= 0.25 && steps < 160) {
          sims.today.step(0.25);
          sims.fix.step(0.25);
          acc -= 0.25;
          steps++;
        }
        if (steps >= 160) acc = 0;
        todayRef.current?.draw();
        fixRef.current?.draw();
      }
      if (now - lastStats > 400) {
        lastStats = now;
        setStats({ today: counters(sims.today, hour), fix: counters(sims.fix, hour) });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sims, hour]);

  const win: [number, number] = [Math.max(0, center - SPAN / 2), Math.min(PILOT_MODEL.length, center + SPAN / 2)];
  const pick = useCallback((s: number) => setCenter(Math.round(Math.min(PILOT_MODEL.length - SPAN / 2, Math.max(SPAN / 2, s)))), []);

  const c = calibration[String(hour)];

  return (
    <div ref={host}>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
        <div>
          <div className="mb-2 text-[13px] text-chalk-2" id="hour-label">
            Hour of a weekday
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-asphalt-2 p-1" role="radiogroup" aria-labelledby="hour-label">
            <AnimatedBackground defaultValue={String(hour)} className="rounded-md bg-asphalt-4" transition={{ type: "spring", bounce: 0.15, duration: 0.3 }} onValueChange={(v) => v && setHour(Number(v))}>
              {hours.map((h) => (
                <button key={h} data-id={String(h)} type="button" role="radio" aria-checked={h === hour} className="px-2.5 py-1.5 text-[13.5px] font-medium text-chalk-2 num data-[checked=true]:text-chalk">
                  {hourLabel(h)}
                </button>
              ))}
            </AnimatedBackground>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex h-10 w-[92px] items-center justify-center gap-2 rounded-md bg-sign font-medium text-white transition-transform duration-150 active:scale-[0.97]"
            aria-pressed={playing}
          >
            {playing ? (
              <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
                <rect x="1" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
                <rect x="7.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
                <path d="M2 1.5v11l9-5.5z" fill="currentColor" />
              </svg>
            )}
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => setEpoch((e) => e + 1)} className="h-10 rounded-md bg-asphalt-3 px-3 font-medium text-chalk transition-transform duration-150 active:scale-[0.97]">
            Restart
          </button>
          <div className="ml-2 flex rounded-md bg-asphalt-2 p-1 text-[13.5px]" role="radiogroup" aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={s === speed}
                onClick={() => setSpeed(s)}
                className={cn("rounded px-2.5 py-1.5 font-medium num transition-colors duration-150", s === speed ? "bg-asphalt-4 text-chalk" : "text-chalk-2 hover:text-chalk")}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[13.5px]">
          <span className="mr-1 text-chalk-2">Look at</span>
          {SPOTS.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => pick(s.s)}
              className={cn("rounded-md px-2.5 py-1.5 font-medium transition-colors duration-150", Math.abs(center - s.s) < 120 ? "bg-asphalt-4 text-chalk" : "bg-asphalt-2 text-chalk-2 hover:text-chalk")}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[13.5px] text-chalk-2 num">
        Traffic at {hourLabel(hour)}: {c.qW.toLocaleString("en-IN")} vehicles an hour towards Tolichowki and {c.qE.toLocaleString("en-IN")} towards Mehdipatnam, plus side-road
        traffic. Calibrated so today&apos;s run matches TomTom&apos;s typical times ({c.target[0].toFixed(2)}× and {c.target[1].toFixed(2)}× free flow).
      </p>

      {(["today", "fix"] as const).map((k) => {
        const st = stats?.[k];
        return (
          <div key={k} className="mt-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{k === "today" ? "Today" : "With RoadFix changes"}</h3>
              {st && (
                <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-chalk-2 num">
                  <div className="flex gap-1.5">
                    <dt>Clock</dt>
                    <dd className="text-chalk">{st.clock}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>On the road</dt>
                    <dd className="text-chalk">{st.onRoad}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Average speed</dt>
                    <dd className="flex text-chalk">
                      <SlidingNumber value={Math.round(st.speed)} />
                      &nbsp;km/h
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Waiting to U-turn</dt>
                    <dd className="text-chalk">{st.waiting}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Wrong-side now</dt>
                    <dd className={cn(st.wrong ? "text-[#ff7a7a]" : "text-chalk")}>{st.wrong}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>End-to-end trip</dt>
                    <dd className="text-chalk">{st.done >= 15 ? `${(st.avgTrip / 60).toFixed(1)} min` : "measuring…"}</dd>
                  </div>
                </dl>
              )}
            </div>
            <SimCanvas ref={k === "today" ? todayRef : fixRef} sim={sims[k]} window={win} labels={LABELS} title={k === "today" ? "Today" : "With RoadFix changes"} onPickWindow={pick} />
          </div>
        );
      })}

      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-chalk-2" aria-label="Legend">
        {(
          [
            ["2w", "Two-wheeler"],
            ["car", "Car"],
            ["auto", "Auto"],
            ["bus", "Bus"],
            ["lcv", "Goods vehicle"],
          ] as const
        ).map(([k, l]) => [VEHICLE_COLORS[k], l] as const).map(([c, l]) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-[1px]" style={{ background: c }} />
            {l}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-[1px] outline outline-[1.5px] outline-[#f0d860]" />
          Waiting to U-turn
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#ff5a5a]" />
          Riding wrong-side
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-[1px] bg-[#f0d860]" />
          Median kerb (gaps are U-turn openings)
        </li>
      </ul>
    </div>
  );
}
