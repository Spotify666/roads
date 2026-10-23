"use client";

import type { ComponentType } from "react";
import { motion } from "motion/react";
import { CHECKPOINT, type Metrics } from "@/sim/scenario";
import { cn } from "@/lib/utils";
import { BusLaneIcon, ClockIcon, CrawlIcon, DivertIcon, FlowIcon, FuelIcon, QueueIcon, RouteIcon, WrongIcon } from "./icons";

type Row = {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  get: (m: Metrics) => number | null;
  fmt: (v: number) => string;
  better: "lower" | "higher";
  optional?: boolean;
};

const min = (s: number) => `${(s / 60).toFixed(1)} min`;
const per = (n: number) => `${Math.round(n).toLocaleString("en-IN")}/h`;

export const ROWS: Row[] = [
  { key: "w", label: "→ Tolichowki", icon: ClockIcon, get: (m) => m.thr[0], fmt: min, better: "lower" },
  { key: "e", label: "→ Mehdipatnam", icon: ClockIcon, get: (m) => m.thr[1], fmt: min, better: "lower" },
  { key: "bus", label: "Bus trip", icon: BusLaneIcon, get: (m) => m.bus, fmt: min, better: "lower" },
  { key: "slow", label: "Crawling / trip", icon: CrawlIcon, get: (m) => m.slow, fmt: (s) => `${Math.round(s)} s`, better: "lower" },
  { key: "fuel", label: "Fuel / trip", icon: FuelIcon, get: (m) => m.fuel, fmt: (l) => `${Math.round(l * 1000)} ml`, better: "lower" },
  { key: "dist", label: "Distance / trip", icon: RouteIcon, get: (m) => m.dist, fmt: (d) => `${(d / 1000).toFixed(2)} km`, better: "lower" },
  { key: "wrong", label: "Wrong-side", icon: WrongIcon, get: (m) => m.wrong, fmt: per, better: "lower" },
  { key: "served", label: "Throughput", icon: FlowIcon, get: (m) => m.served, fmt: per, better: "higher" },
  { key: "stuck", label: "Still queued", icon: QueueIcon, get: (m) => m.stuck, fmt: (n) => Math.round(n).toLocaleString("en-IN"), better: "lower" },
  { key: "div", label: "Diverted", icon: DivertIcon, get: (m) => m.diverted, fmt: per, better: "lower", optional: true },
];

/** Changes smaller than this are within one run's noise. */
const NOISE = 0.03;

export function change(t: number | null, y: number | null, better: "lower" | "higher") {
  if (t == null || y == null) return { rel: null, verdict: "na" as const };
  if (t === 0 && y === 0) return { rel: 0, verdict: "same" as const };
  const rel = t === 0 ? 1 : (y - t) / t;
  const good = better === "lower" ? rel < -NOISE : rel > NOISE;
  const bad = better === "lower" ? rel > NOISE : rel < -NOISE;
  return { rel, verdict: good ? ("better" as const) : bad ? ("worse" as const) : ("same" as const) };
}

const TONE = {
  better: { bar: "#29a36a", chip: "bg-[#173a2a] text-[#7fe0ae]" },
  worse: { bar: "#cf2f3d", chip: "bg-[#3a2226] text-[#ffb3b3]" },
  same: { bar: "#7aa5f5", chip: "bg-asphalt-3 text-chalk-2" },
  na: { bar: "#4a5560", chip: "bg-asphalt-3 text-chalk-2" },
};

export function Headline({ today, yours }: { today: Metrics; yours: Metrics }) {
  const w = change(today.thr[0], yours.thr[0], "lower");
  const e = change(today.thr[1], yours.thr[1], "lower");
  const dirs = [
    { name: "Tolichowki", c: w, closed: yours.thr[0] == null },
    { name: "Mehdipatnam", c: e, closed: yours.thr[1] == null },
  ];
  const better = dirs.filter((d) => d.c.verdict === "better").map((d) => d.name);
  const worse = dirs.filter((d) => d.c.verdict === "worse").map((d) => d.name);
  const closed = dirs.filter((d) => d.closed).map((d) => d.name);
  let text: string;
  let tone: keyof typeof TONE;
  if (closed.length) {
    text = better.length ? `Faster → ${better[0]}, closed → ${closed[0]}` : `Closed → ${closed[0]}`;
    tone = "worse";
  } else if (better.length === 2) [text, tone] = ["Faster both ways", "better"];
  else if (worse.length === 2) [text, tone] = ["Slower both ways", "worse"];
  else if (better.length && worse.length) [text, tone] = [`Faster → ${better[0]}, slower → ${worse[0]}`, "same"];
  else if (better.length) [text, tone] = [`Faster → ${better[0]}`, "better"];
  else if (worse.length) [text, tone] = [`Slower → ${worse[0]}`, "worse"];
  else [text, tone] = ["No real change", "same"];
  const served = change(today.served, yours.served, "higher");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <motion.span
        key={text}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
        className={cn("rounded-full px-3 py-1.5 text-[15px] font-semibold", TONE[tone].chip)}
      >
        {text}
      </motion.span>
      {served.verdict === "worse" && <span className={cn("rounded-full px-2.5 py-1 text-[12.5px] font-medium", TONE.worse.chip)}>Carries fewer vehicles</span>}
      {yours.diverted > 0 && <span className="rounded-full bg-[#3a3020] px-2.5 py-1 text-[12.5px] font-medium text-[#f5c97a]">{per(yours.diverted)} diverted</span>}
    </div>
  );
}

export function LabResults({ today, yours, plan, progress, running }: { today: Metrics; yours: Metrics; plan?: Metrics | null; progress: number; running: boolean }) {
  const rows = ROWS.filter((r) => !r.optional || (r.get(today) ?? 0) > 0 || (r.get(yours) ?? 0) > 0);
  const minutes = Math.round((progress * 40) / 5) * 5;
  return (
    <div>
      <Headline today={today} yours={yours} />
      <p className="mt-2 text-[12.5px] text-chalk-2 num">
        {running ? `Measuring… ${minutes} of 40 min simulated` : `40 min of traffic, measured after a ${CHECKPOINT / 60}-min warm-up`} · same traffic and seed
      </p>
      <ul className="mt-4 divide-y divide-white/[0.06]">
        {rows.map((r, i) => {
          const t = r.get(today);
          const y = r.get(yours);
          const p = plan ? r.get(plan) : null;
          const c = change(t, y, r.better);
          const max = Math.max(t ?? 0, y ?? 0, p ?? 0, 1e-9);
          const Icon = r.icon;
          return (
            <motion.li
              key={r.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, type: "spring", duration: 0.4, bounce: 0 }}
              className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5"
            >
              <span className="text-chalk-2">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[13.5px]">
                  <span className="font-medium">{r.label}</span>
                  <span className="text-chalk-2 num">
                    {t == null ? "—" : r.fmt(t)} <span aria-hidden="true">→</span> <span className="font-semibold text-chalk">{y == null ? "closed" : r.fmt(y)}</span>
                  </span>
                </div>
                <div className="relative mt-1.5 h-[13px]" aria-hidden="true">
                  <div className="absolute inset-x-0 top-0 h-[5px] rounded-full bg-white/[0.05]">
                    <motion.div className="h-full rounded-full bg-[#5d6870]" initial={false} animate={{ width: `${((t ?? 0) / max) * 100}%` }} transition={{ type: "spring", duration: 0.5, bounce: 0 }} />
                  </div>
                  <div className="absolute inset-x-0 top-[7px] h-[5px] rounded-full bg-white/[0.05]">
                    <motion.div className="h-full rounded-full" style={{ background: TONE[c.verdict].bar }} initial={false} animate={{ width: `${((y ?? 0) / max) * 100}%` }} transition={{ type: "spring", duration: 0.5, bounce: 0 }} />
                  </div>
                  {p != null && <div className="absolute top-[5px] h-[9px] w-[2px] rounded-full bg-[#f0d860]" style={{ left: `calc(${(p / max) * 100}% - 1px)` }} title="RoadFix plan" />}
                </div>
              </div>
              <span className={cn("min-w-[58px] rounded-full px-2 py-0.5 text-center text-[12px] font-semibold num", TONE[c.verdict].chip)}>
                {c.rel == null ? "—" : c.verdict === "same" ? "≈ same" : `${c.rel > 0 ? "+" : "−"}${Math.abs(c.rel) >= 1 && t === 0 ? "new" : `${Math.round(Math.abs(c.rel) * 100)}%`}`}
              </span>
            </motion.li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-chalk-2">
        <span className="flex items-center gap-1.5">
          <span className="h-[5px] w-4 rounded-full bg-[#5d6870]" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[5px] w-4 rounded-full bg-[#29a36a]" /> Your design
        </span>
        {plan && (
          <span className="flex items-center gap-1.5">
            <span className="h-[9px] w-[2px] rounded-full bg-[#f0d860]" /> RoadFix plan
          </span>
        )}
        <span>Within ±3%: same</span>
      </div>
    </div>
  );
}
