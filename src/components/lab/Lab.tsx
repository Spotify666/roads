"use client";

import { useMemo, useState, type ComponentType } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { flowColor, hourLabel } from "@/lib/flow";
import { cn } from "@/lib/utils";
import { TODAY_DESIGN, designCost, planDesign, sameDesign, type Calibration, type Design, type Metrics } from "@/sim/scenario";
import { TODAY_OPENINGS } from "@/sim/pilot";
import { CorridorEditor, bestNewOpening, type EditMode } from "./CorridorEditor";
import { LabResults } from "./LabResults";
import { LiveSim } from "./LiveSim";
import { useLabRunner } from "./useLabRunner";
import {
  AutoIcon,
  BayIcon,
  BeakerIcon,
  BusLaneIcon,
  KerbIcon,
  LanesIcon,
  OneWayIcon,
  PocketIcon,
  ShieldIcon,
  SignalIcon,
  TrafficIcon,
  UturnIcon,
} from "./icons";

interface Props {
  cal: Calibration;
  tomtom: Record<string, number>; // worst-direction slowdown per hour, for the hour chips
  baseline: { hours: Record<string, { today: Metrics[]; plan: Metrics[] }>; planOpenings: number[]; reverseShare: number };
}

type Toggle = { key: keyof Design; label: string; icon: ComponentType<{ size?: number }> };
const TOGGLES: Toggle[] = [
  { key: "busLane", label: "Bus + auto lane", icon: BusLaneIcon },
  { key: "fullLanes", label: "No lane drop", icon: LanesIcon },
  { key: "busBays", label: "Bus bays", icon: BayIcon },
  { key: "autoBays", label: "Auto bays", icon: AutoIcon },
  { key: "clearKerb", label: "Clear kerb", icon: KerbIcon },
  { key: "enforcement", label: "Stop wrong-side", icon: ShieldIcon },
];

function countChanges(d: Design) {
  let n = 0;
  const near = (s: number, l: number[]) => l.some((x) => Math.abs(x - s) < 15);
  n += d.openings.filter((o) => !near(o.s, TODAY_OPENINGS) || o.pocket).length;
  n += TODAY_OPENINGS.filter((s) => !near(s, d.openings.map((o) => o.s))).length;
  for (const t of TOGGLES) if (d[t.key]) n++;
  if (d.oneWay !== null) n++;
  if (Math.abs(d.greenNanal - TODAY_DESIGN.greenNanal) > 0.005) n++;
  if (Math.abs(d.greenRethibowli - TODAY_DESIGN.greenRethibowli) > 0.005) n++;
  if (d.traffic !== 1) n++;
  return n;
}

function Slider({
  icon: Icon,
  label,
  value,
  min,
  max,
  step,
  base,
  fmt,
  onChange,
}: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  base: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const changed = Math.abs(value - base) > step / 2;
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-[13px]">
        <span className="flex items-center gap-2 font-medium">
          <span className="text-chalk-2">
            <Icon size={17} />
          </span>
          {label}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[12.5px] font-semibold num", changed ? "bg-sign/25 text-sign-bright" : "text-chalk-2")}>{fmt(value)}</span>
      </span>
      <span className="relative mt-1 block">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="lab-range w-full" aria-valuetext={fmt(value)} />
        <span className="pointer-events-none absolute top-[3px] h-[10px] w-[2px] rounded-full bg-chalk-2/70" style={{ left: `calc(${((base - min) / (max - min)) * 100}% + ${(0.5 - (base - min) / (max - min)) * 22}px - 1px)` }} aria-hidden="true" />
      </span>
    </label>
  );
}

export function Lab({ cal, tomtom, baseline }: Props) {
  const hours = useMemo(() => Object.keys(baseline.hours).map(Number).sort((a, b) => a - b), [baseline]);
  const plan = useMemo(() => planDesign(baseline.planOpenings), [baseline]);
  const [hour, setHour] = useState(18);
  const [design, setDesign] = useState<Design>(TODAY_DESIGN);
  const [mode, setMode] = useState<EditMode>("uturn");
  const { state, run } = useLabRunner();

  const set = <K extends keyof Design>(k: K, v: Design[K]) => setDesign((d) => ({ ...d, [k]: v }));
  const cost = designCost(design);
  const changes = countChanges(design);
  const pockets = design.openings.filter((o) => o.pocket).length;

  const key = JSON.stringify(design);
  const fresh = state.designKey === key && state.hour === hour;
  const i = Math.min(state.today.length, state.design.length) - 1;
  const base = baseline.hours[String(hour)];
  const showPlan = state.hour != null && design.traffic === 1 ? baseline.hours[String(state.hour)]?.plan[i] : null;

  const start = () => {
    // with nothing changed there is nothing to compare, so test the plan
    const d = sameDesign(design, TODAY_DESIGN) ? plan : design;
    if (d !== design) setDesign(d);
    run(d, hour, cal, baseline.reverseShare, d.traffic === 1 ? base.today : null);
  };

  const presets: { id: string; label: string; d: Design }[] = [
    { id: "today", label: "Today", d: TODAY_DESIGN },
    { id: "plan", label: "RoadFix plan", d: plan },
    { id: "plan-signal", label: "Plan + Nanal Nagar signal", d: { ...plan, greenNanal: 0.6 } },
    { id: "oneway", label: "One-way trial", d: { ...TODAY_DESIGN, oneWay: 0 } },
  ];
  const activePreset = presets.find((p) => sameDesign(p.d, design))?.id;

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* live view: sticks beside the tools on wide screens */}
      <div className="min-w-0 lg:sticky lg:top-[72px] lg:self-start">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <div className="flex w-max gap-1 rounded-full bg-asphalt-2 p-1" role="radiogroup" aria-label="Hour of a weekday">
            <AnimatedBackground defaultValue={String(hour)} className="rounded-full bg-asphalt-4" transition={{ type: "spring", bounce: 0.15, duration: 0.3 }} onValueChange={(v) => v && setHour(Number(v))}>
              {hours.map((h) => (
                <button key={h} data-id={String(h)} type="button" role="radio" aria-checked={h === hour} className="h-10 px-2.5 pt-1.5 text-[13px] font-semibold text-chalk-2 num data-[checked=true]:text-chalk">
                  {hourLabel(h).replace(" ", "")}
                  <span className="mx-auto mt-1 block h-[3px] w-4 rounded-full" style={{ background: flowColor(tomtom[String(h)]) }} aria-hidden="true" />
                </button>
              ))}
            </AnimatedBackground>
          </div>
        </div>
        <div className="mt-5">
          <LiveSim design={design} hour={hour} cal={cal} reverseShare={baseline.reverseShare} baseOpenings={TODAY_OPENINGS} />
        </div>
      </div>

      {/* design tools and results */}
      <div className="min-w-0">
        <div className="rounded-2xl bg-asphalt-2 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">Your design</h2>
            <span className="rounded-full bg-asphalt-3 px-2.5 py-1 text-[12.5px] font-medium text-chalk-2 num">
              {changes} change{changes === 1 ? "" : "s"} · ₹{cost.lakh.toFixed(1)} lakh{cost.widening ? " + widening" : ""}
            </span>
          </div>

          <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDesign(p.d)}
                aria-pressed={activePreset === p.id}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
                  activePreset === p.id ? "bg-chalk text-asphalt" : "bg-asphalt-3 text-chalk-2 hover:text-chalk",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex rounded-full bg-asphalt-3 p-1 text-[13px]" role="radiogroup" aria-label="Tap the road to">
              {(
                [
                  ["uturn", "U-turns", UturnIcon],
                  ["pocket", "Pockets", PocketIcon],
                ] as const
              ).map(([m, l, Icon]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn("flex h-8 items-center gap-1.5 rounded-full px-3 font-medium transition-colors duration-150", mode === m ? "bg-asphalt-4 text-chalk" : "text-chalk-2")}
                >
                  <Icon size={15} />
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const s = bestNewOpening(design.openings.map((o) => o.s));
                if (s != null) set("openings", [...design.openings, { s, pocket: true }]);
              }}
              className="h-9 rounded-full bg-asphalt-3 px-3 text-[13px] font-medium text-chalk transition-transform duration-150 active:scale-[0.96]"
            >
              + U-turn
            </button>
          </div>
          <p className="mt-2 text-[12px] text-chalk-2">{mode === "uturn" ? "Tap road: add · tap U-turn: remove · drag: move" : "Tap a U-turn: pocket on or off"}</p>
          <div className="mt-2">
            <CorridorEditor design={design} onChange={setDesign} baseOpenings={TODAY_OPENINGS} mode={mode} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-chalk-2">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full border-[1.5px] border-[#f0d860]" /> Existing U-turn
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full border-[1.5px] border-sign-bright" /> New
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-3 rounded-[1px] bg-[repeating-linear-gradient(45deg,#cf2f3d_0_1.5px,#3a2226_1.5px_3px)]" /> Can&apos;t build
            </span>
            <span className="flex items-center gap-1">
              <span className="h-[2px] w-3 rounded-full bg-[#cf2f3d]" /> Gap over 600 m
            </span>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <span className="text-chalk-2">
                <OneWayIcon size={17} />
              </span>
              Direction
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-asphalt-3 p-1 text-[12.5px]" role="radiogroup" aria-label="Direction of traffic">
              {(
                [
                  [null, "Two-way"],
                  [0, "← Tolichowki"],
                  [1, "Mehdipatnam →"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={design.oneWay === v}
                  onClick={() => set("oneWay", v)}
                  className={cn("h-9 rounded-lg font-medium transition-colors duration-150", design.oneWay === v ? (v === null ? "bg-asphalt-4 text-chalk" : "bg-sign text-white") : "text-chalk-2")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {TOGGLES.map((t) => {
              const on = Boolean(design[t.key]);
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set(t.key, !on as never)}
                  className={cn(
                    "flex h-12 items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-medium transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]",
                    on ? "bg-sign text-white" : "bg-asphalt-3 text-chalk-2 hover:text-chalk",
                  )}
                >
                  <Icon size={19} />
                  <span className="leading-tight">{t.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={pockets === design.openings.length && pockets > 0}
              onClick={() => {
                const all = pockets < design.openings.length;
                set(
                  "openings",
                  design.openings.map((o) => ({ ...o, pocket: all })),
                );
              }}
              className={cn(
                "col-span-2 flex h-12 items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
                pockets && pockets === design.openings.length ? "bg-sign text-white" : "bg-asphalt-3 text-chalk-2 hover:text-chalk",
              )}
            >
              <PocketIcon size={19} />
              <span className="flex-1">Waiting pockets on every U-turn</span>
              <span className="text-[12px] num opacity-80">
                {pockets}/{design.openings.length}
              </span>
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <Slider icon={SignalIcon} label="Nanal Nagar green" value={design.greenNanal} min={0.3} max={0.7} step={0.05} base={TODAY_DESIGN.greenNanal} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("greenNanal", v)} />
            <Slider icon={SignalIcon} label="Rethibowli green" value={design.greenRethibowli} min={0.3} max={0.7} step={0.05} base={TODAY_DESIGN.greenRethibowli} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("greenRethibowli", v)} />
            <Slider icon={TrafficIcon} label="Traffic" value={design.traffic} min={0.7} max={1.3} step={0.05} base={1} fmt={(v) => (Math.abs(v - 1) < 0.01 ? "today" : `${v > 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)}%`)} onChange={(v) => set("traffic", v)} />
          </div>

          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 -mx-4 mt-3 bg-asphalt-2/95 px-4 pt-2 pb-3 backdrop-blur-sm sm:bottom-0 sm:-mx-5 sm:px-5 sm:pb-4">
            <button
              type="button"
              onClick={start}
              disabled={state.status === "running"}
              className="relative flex h-13 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-sign text-[15.5px] font-semibold text-white shadow-[0_8px_24px_#2d6cdf55] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.98] disabled:cursor-progress"
            >
              {state.status === "running" && (
                <motion.span className="absolute inset-y-0 left-0 bg-white/20" initial={false} animate={{ width: `${state.progress * 100}%` }} transition={{ type: "spring", duration: 0.4, bounce: 0 }} aria-hidden="true" />
              )}
              <span className="relative flex items-center gap-2">
                <BeakerIcon size={19} />
                {state.status === "running"
                  ? `Testing… ${Math.round(state.progress * 100)}%`
                  : sameDesign(design, TODAY_DESIGN)
                    ? `Test the RoadFix plan at ${hourLabel(hour)}`
                    : fresh
                      ? "Test again"
                      : `Test at ${hourLabel(hour)}`}
              </span>
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {state.status !== "idle" && i >= 0 && (
            <motion.section
              key="results"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", duration: 0.45, bounce: 0 }}
              className="mt-4 rounded-2xl bg-asphalt-2 p-4 sm:p-5"
              aria-live="polite"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[17px] font-semibold">Result at {hourLabel(state.hour!)}</h2>
                {!fresh && state.status === "done" && <span className="rounded-full bg-[#3a3020] px-2.5 py-1 text-[12px] font-medium text-[#f5c97a]">Design changed: test again</span>}
              </div>
              <LabResults today={state.today[i]} yours={state.design[i]} plan={showPlan} progress={state.progress} running={state.status === "running"} />
              <div className="mt-4 flex flex-wrap gap-1.5 text-[12px]">
                {cost.items.map((c) => (
                  <span key={c.label} className="rounded-full bg-asphalt-3 px-2.5 py-1 text-chalk-2 num">
                    {c.label} · ₹{c.lakh.toFixed(1)}L
                  </span>
                ))}
                {design.fullLanes && <span className="rounded-full bg-[#3a3020] px-2.5 py-1 text-[#f5c97a]">Widening needs land: not costed</span>}
                {(design.greenNanal !== TODAY_DESIGN.greenNanal || design.greenRethibowli !== TODAY_DESIGN.greenRethibowli) && (
                  <span className="rounded-full bg-[#3a3020] px-2.5 py-1 text-[#f5c97a]">Side-street waits not modelled</span>
                )}
                {design.oneWay !== null && <span className="rounded-full bg-[#3a3020] px-2.5 py-1 text-[#f5c97a]">Other roads not modelled</span>}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
