"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { BottomSheet, type Snap } from "@/components/ui/BottomSheet";
import { CityPulse } from "@/components/CityPulse";
import { CauseIcon } from "@/components/ui/CauseIcon";
import { KIND_LABEL, kindsOf } from "@/lib/causes";
import { CAUSE_LABELS, FIX_TYPE_LABELS, FLOW_COLORS, FLOW_LABELS, atHour, flowColor, flowLabel, flowLevel, hourLabel } from "@/lib/flow";
import type { LiveIncident, LiveReading } from "@/lib/types";
import type { AreaWithStretches, MapLayers } from "@/components/CityMap";
import { cn } from "@/lib/utils";

const CityMap = dynamic(() => import("@/components/CityMap").then((m) => m.CityMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-asphalt-2" />,
});

interface Data {
  generated: string;
  hours: number[];
  areas: AreaWithStretches[];
}

interface Live {
  readings: LiveReading[];
  incidents: { observedAt: string | null; total: number; jams: number; items: LiveIncident[] };
}

const istHour = () => new Date(Date.now() + 5.5 * 3600e3).getUTCHours();
const istTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const HYD = { w: 77.9, e: 78.95, s: 17.05, n: 17.8 };
const SPRING = { type: "spring" as const, duration: 0.35, bounce: 0.12 };

function useWide() {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/* ---------- small pieces ---------- */

function Ratio({ v, size = "md" }: { v: number | null; size?: "md" | "lg" }) {
  const l = flowLevel(v);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold num", size === "lg" ? "h-9 px-3.5 text-[17px]" : "h-7 min-w-[52px] px-2.5 text-[13.5px]")}
      style={{ background: v == null ? "#2c3338" : flowColor(v), color: l >= 3 ? "#fff" : l < 0 ? "#a9b1ab" : "#101316" }}
    >
      {v == null ? "–" : `${v.toFixed(1)}×`}
    </span>
  );
}

function DayStrip({ hours, hour, peak, tall }: { hours: [number, number][]; hour: number | null; peak?: number; tall?: boolean }) {
  return (
    <div className={cn("flex gap-[2px]", tall ? "h-7" : "h-[5px]")} aria-hidden="true">
      {Array.from({ length: 24 }, (_, h) => (
        <span key={h} className={cn("relative flex-1 rounded-[2px]", h === hour && "outline-[1.5px] outline-chalk outline-offset-1 outline")} style={{ background: flowColor(atHour(hours, h)) }}>
          {tall && peak === h && <span className="absolute -top-[7px] left-1/2 size-[5px] -translate-x-1/2 rounded-full bg-chalk" />}
        </span>
      ))}
    </div>
  );
}

function Distribution({ values }: { values: (number | null)[] }) {
  const counts = [0, 0, 0, 0, 0];
  for (const v of values) {
    const l = flowLevel(v);
    if (l >= 0) counts[l]++;
  }
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
        {counts.map((c, i) =>
          c ? <motion.span key={i} layout transition={SPRING} className="h-full first:rounded-l-full last:rounded-r-full" style={{ background: FLOW_COLORS[i], flexGrow: c / total }} /> : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-chalk-2 num">
        {[4, 3, 2, 1, 0].map((i) =>
          counts[i] ? (
            <span key={i} className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: FLOW_COLORS[i] }} />
              <span className="font-semibold text-chalk">{counts[i]}</span> {FLOW_LABELS[i].toLowerCase()}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function SearchBox({ areas, onPick, compact }: { areas: AreaWithStretches[]; onPick: (id: string) => void; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return areas.filter((a) => `${a.name} ${a.place} ${a.police}`.toLowerCase().includes(t)).slice(0, 6);
  }, [q, areas]);
  const choose = (id: string) => {
    onPick(id);
    setQ("");
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  return (
    <div className="relative">
      <div className={cn("flex h-12 items-center gap-2.5 rounded-full bg-asphalt-2 pr-2 pl-3.5 shadow-[0_4px_18px_#0007] ring-1 ring-white/[0.06]", compact && "shadow-none")}>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
          <rect x="1" y="3" width="20" height="16" rx="3" fill="#2d6cdf" />
          <path d="M3 9.2h6.5M12.5 9.2H19M3 12.8h6.5M12.5 12.8H19" stroke="#eceee9" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M9.5 9.2c1.2 0 2 .8 2 1.8s-.8 1.8-2 1.8" stroke="#f0d860" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(hits.length - 1, a + 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
            else if (e.key === "Enter" && hits[active]) choose(hits[active].id);
            else if (e.key === "Escape") setQ("");
          }}
          placeholder="Search a junction or area"
          aria-label="Search a junction or area"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls="search-results"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-chalk outline-none placeholder:text-chalk-2 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="flex size-9 items-center justify-center rounded-full text-chalk-2 active:bg-asphalt-3">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <AnimatePresence>
        {open && hits.length > 0 && (
          <motion.ul
            id="search-results"
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-x-0 top-[54px] z-50 origin-top overflow-hidden rounded-2xl bg-asphalt-2 py-1.5 shadow-[0_10px_30px_#000a] ring-1 ring-white/[0.06]"
          >
            {hits.map((a, i) => (
              <li key={a.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(a.id)}
                  className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left", i === active ? "bg-asphalt-3" : "active:bg-asphalt-3")}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: flowColor(a.profile?.peak.ratio) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{a.name}</span>
                    <span className="block truncate text-[12.5px] text-chalk-2">{a.place}</span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModeChips({ mode, setMode, hour, liveOk, onHour }: { mode: "live" | "typical"; setMode: (m: "live" | "typical") => void; hour: number; liveOk: boolean; onHour: () => void }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="What the map shows">
      {(
        [
          ["live", "Live"],
          ["typical", "Typical"],
        ] as const
      ).map(([m, l]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          disabled={m === "live" && !liveOk}
          onClick={() => (m === "typical" && mode === "typical" ? onHour() : setMode(m))}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold shadow-[0_2px_10px_#0006] transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.96] disabled:opacity-40",
            mode === m ? "bg-chalk text-asphalt" : "bg-asphalt-2 text-chalk",
          )}
        >
          {m === "live" && <span className={cn("size-2 rounded-full", liveOk ? "bg-flow-0" : "bg-chalk-2")} />}
          {l}
          {m === "typical" && mode === "typical" && <span className="font-medium num opacity-70">· {hourLabel(hour)}</span>}
        </button>
      ))}
    </div>
  );
}

function RoundButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex size-12 items-center justify-center rounded-full shadow-[0_4px_16px_#0008] ring-1 ring-white/[0.06] transition-[background-color,transform] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.94]",
        active ? "bg-chalk text-asphalt" : "bg-asphalt-2 text-chalk",
      )}
    >
      {children}
    </button>
  );
}

/* ---------- the spot preview ---------- */

type Trend = "up" | "down" | "same";

/** A live reading against the usual for this hour: clearly worse, clearly better, or about the same. */
function trendOf(live: number, usual: number): Trend {
  if (live >= usual * 1.1 && live >= 1.15) return "up";
  if (live <= usual / 1.1 && usual >= 1.15) return "down";
  return "same";
}

function TrendTag({ trend, compact }: { trend: Trend | null; compact?: boolean }) {
  if (!trend) return null;
  const t = {
    up: { text: compact ? "worse" : "Worse than usual", cls: "text-[#ff9a9a]", arrow: "M6 2 11 10H1Z" },
    down: { text: compact ? "better" : "Better than usual", cls: "text-[#7fe0ae]", arrow: "M6 10 11 2H1Z" },
    same: { text: compact ? "usual" : "As usual", cls: "text-chalk-2", arrow: "" },
  }[trend];
  return (
    <span className={cn("flex items-center gap-1 text-[11.5px] font-medium", t.cls)}>
      {t.arrow && (
        <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
          <path d={t.arrow} fill="currentColor" />
        </svg>
      )}
      {t.text}
    </span>
  );
}

/** Name, place and slowdown: the part of a spot's card that stays visible when the sheet is collapsed. */
function PlaceHeader({ a, value, onClose }: { a: AreaWithStretches; value: number | null; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 pb-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[21px] leading-tight font-semibold tracking-[-0.015em] text-balance">{a.name}</h2>
        <p className="mt-1 flex items-center gap-2 text-[13px] text-chalk-2">
          <Ratio v={value} />
          <span className="truncate">{a.place}</span>
        </p>
      </div>
      <button
        type="button"
        data-no-drag
        onClick={onClose}
        aria-label="Close"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-asphalt-3 text-chalk-2 transition-transform duration-150 active:scale-90"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function Preview({
  a,
  value,
  valueLabel,
  markHour,
  live,
  onClose,
  withHeader,
  usual,
}: {
  a: AreaWithStretches;
  value: number | null;
  valueLabel: string;
  markHour: number;
  live: LiveReading | undefined;
  onClose: () => void;
  withHeader: boolean;
  /** typical slowdown at this hour, to judge the live reading against */
  usual: number | null;
}) {
  const p = a.profile;
  const trend = live && value != null && usual != null ? trendOf(value, usual) : null;
  return (
    <div className="pb-6">
      {withHeader && <PlaceHeader a={a} value={value} onClose={onClose} />}
      <div className="px-4">
        <div className="mt-1 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-asphalt-3 p-2.5">
            <div className="text-[11.5px] text-chalk-2">{valueLabel}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[20px] font-semibold num" style={{ color: flowColor(value, "#a9b1ab") }}>
                {value == null ? "–" : `${value.toFixed(1)}×`}
              </span>
            </div>
            <div className="text-[11.5px] text-chalk-2 num">{live ? `${Math.round(live.current_speed)} km/h` : flowLabel(value)}</div>
          </div>
          {live ? (
            <div className="rounded-xl bg-asphalt-3 p-2.5">
              <div className="text-[11.5px] text-chalk-2">Usual now</div>
              <div className="mt-1 flex items-center gap-1 text-[20px] font-semibold num" style={{ color: flowColor(usual) }}>
                {usual == null ? "–" : `${usual.toFixed(1)}×`}
              </div>
              <TrendTag trend={trend} />
            </div>
          ) : (
            <div className="rounded-xl bg-asphalt-3 p-2.5">
              <div className="text-[11.5px] text-chalk-2">Lost at peak</div>
              <div className="mt-1 text-[20px] font-semibold num">{p ? Math.round(p.peakDelayPerKm) : "–"}</div>
              <div className="text-[11.5px] text-chalk-2 num">s per km</div>
            </div>
          )}
          <div className="rounded-xl bg-asphalt-3 p-2.5">
            <div className="text-[11.5px] text-chalk-2">Weekday peak</div>
            <div className="mt-1 text-[20px] font-semibold num" style={{ color: flowColor(p?.peak.ratio) }}>
              {p ? `${p.peak.ratio.toFixed(1)}×` : "–"}
            </div>
            <div className="text-[11.5px] text-chalk-2 num">{p ? hourLabel(p.peak.hour) : ""}</div>
          </div>
        </div>

        {p && (
          <div className="mt-5">
            <DayStrip hours={p.hours} hour={markHour} peak={p.peak.hour} tall />
            <div className="mt-1.5 flex justify-between text-[11px] text-chalk-2 num" aria-hidden="true">
              <span>12a</span>
              <span>6a</span>
              <span>12p</span>
              <span>6p</span>
              <span>11p</span>
            </div>
          </div>
        )}

        <div className="mt-5 text-[12px] font-semibold tracking-wide text-chalk-2">WHY</div>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {a.causes.map((c) => {
            const k = kindsOf([c])[0];
            return (
              <li key={c} className="flex items-center gap-1.5 rounded-full bg-asphalt-3 py-1 pr-2.5 pl-2 text-[12.5px] text-chalk">
                {k && (
                  <span className="text-chalk-2">
                    <CauseIcon kind={k} size={14} />
                  </span>
                )}
                {CAUSE_LABELS[c] ?? c}
              </li>
            );
          })}
        </ul>

        <div className="mt-5 rounded-2xl bg-[#14233f] p-3.5 ring-1 ring-sign/30">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-sign-bright">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 0-5-5L13 2l-2 2 3.7 2.3Z" />
              <path d="m3 21 6-6" />
            </svg>
            FIX · {FIX_TYPE_LABELS[a.fix.type] ?? a.fix.type}
          </div>
          <p className="mt-1.5 text-[15px] leading-snug font-medium">{a.fix.title}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px] num">
            <span className="rounded-full bg-black/25 px-2.5 py-1">
              ₹{a.fix.costLakh[0]}–{a.fix.costLakh[1]} lakh
            </span>
            <span className="rounded-full bg-black/25 px-2.5 py-1">~{a.fix.weeks} weeks</span>
            <span className="rounded-full bg-black/25 px-2.5 py-1">{a.fix.agency}</span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Link
            href={`/area/${a.id}`}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-sign text-[14.5px] font-semibold text-white transition-transform duration-150 active:scale-[0.97]"
          >
            Details <span aria-hidden="true">→</span>
          </Link>
          {a.pilot && (
            <Link href="/pilot" className="flex h-11 flex-1 items-center justify-center rounded-full bg-asphalt-3 text-[14.5px] font-semibold text-chalk transition-transform duration-150 active:scale-[0.97]">
              Simulate
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- the page ---------- */

export function MapHome({ data }: { data: Data }) {
  const wide = useWide();
  const [mode, setMode] = useState<"live" | "typical">("live");
  const [hour, setHour] = useState(18);
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [liveError, setLiveError] = useState(false);
  const [snap, setSnap] = useState<Snap>("peek");
  const [sheetH, setSheetH] = useState(180);
  const [layers, setLayers] = useState<MapLayers>({ flow: true, incidents: true, stretches: true });
  const [layersOpen, setLayersOpen] = useState(false);
  const [user, setUser] = useState<[number, number] | null>(null);
  const [locateTick, setLocateTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<"all" | "up" | "down" | "jam">("all");

  useEffect(() => {
    setHour(istHour());
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/live");
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as Live;
        if (!alive) return;
        setLive(j);
        setLiveError(false);
        if (!j.readings.length) setMode("typical");
      } catch {
        if (!alive) return;
        setLiveError(true);
        setMode("typical");
      }
    };
    load();
    const t = setInterval(load, 120_000);
    // coming back to the tab or the app reloads at once rather than showing old readings
    const onShow = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const liveRatio = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of live?.readings ?? []) if (r.free_flow_travel_time > 0 && r.confidence >= 0.5) m[r.hotspot_id] = r.current_travel_time / r.free_flow_travel_time;
    return m;
  }, [live]);
  const liveOk = !liveError && (live === null || live.readings.length > 0);


  const valueOf = useCallback((a: AreaWithStretches) => (mode === "live" ? (liveRatio[a.id] ?? null) : atHour(a.profile?.hours ?? [], hour)), [mode, liveRatio, hour]);
  const ranked = useMemo(() => [...data.areas].sort((a, b) => (valueOf(b) ?? 0) - (valueOf(a) ?? 0)), [data.areas, valueOf]);
  const sel = data.areas.find((a) => a.id === selected) ?? null;
  // the newest reading, not the first in the list: one spot's feed can lag the rest
  const observed = live?.readings.reduce<string | null>((m, r) => (!m || r.observed_at > m ? r.observed_at : m), null) ?? null;
  const ageMin = observed ? Math.max(0, Math.round((now - new Date(observed).getTime()) / 60000)) : null;
  const nowHour = new Date(now + 5.5 * 3600e3).getUTCHours();
  const usualOf = useCallback((a: AreaWithStretches) => atHour(a.profile?.hours ?? [], nowHour), [nowHour]);
  const trends = useMemo(() => {
    const m: Record<string, Trend> = {};
    for (const a of data.areas) {
      const v = liveRatio[a.id];
      const u = usualOf(a);
      if (v != null && u != null) m[a.id] = trendOf(v, u);
    }
    return m;
  }, [data.areas, liveRatio, usualOf]);
  const mapTrend = useMemo(() => {
    const m: Record<string, "up" | "down"> = {};
    for (const [id, t] of Object.entries(trends)) if (t !== "same") m[id] = t;
    return m;
  }, [trends]);
  // stacked counts per hour for the day chart: slow, heavy, jammed, standstill
  const levels = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => {
        const c: [number, number, number, number] = [0, 0, 0, 0];
        for (const a of data.areas) {
          const l = flowLevel(atHour(a.profile?.hours ?? [], h));
          if (l >= 1) c[l - 1]++;
        }
        return c;
      }),
    [data.areas],
  );
  const liveCount = Object.values(liveRatio).filter((v) => v >= 1.15).length;
  const counts = {
    up: Object.values(trends).filter((t) => t === "up").length,
    down: Object.values(trends).filter((t) => t === "down").length,
    jam: Object.values(liveRatio).filter((v) => v >= 1.5).length,
  };

  const select = (id: string | null) => {
    setSelected(id);
    if (id && !wide) setSnap((s) => (s === "peek" ? "half" : s));
    if (id) setLayersOpen(false);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setToast("Location is not available");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        if (p[0] < HYD.w || p[0] > HYD.e || p[1] < HYD.s || p[1] > HYD.n) return setToast("You are outside Hyderabad");
        setUser(p);
        setLocateTick((t) => t + 1);
      },
      () => setToast("Location permission was not given"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  };

  const padding = wide ? { top: 24, bottom: 24, left: 440, right: 80 } : { top: 120, bottom: Math.min(sheetH, 420), left: 0, right: 0 };

  const stale = ageMin != null && ageMin > 50;
  const statusLine =
    mode === "live" ? (
      observed ? (
        <span className="flex items-center gap-2">
          <span className="relative flex size-2">
            {!stale && <span className="absolute inset-0 animate-ping rounded-full bg-flow-0 opacity-60" />}
            <span className={cn("relative size-2 rounded-full", stale ? "bg-flow-2" : "bg-flow-0")} />
          </span>
          Live · {istTime(observed)}
          <span className={cn("font-medium", stale ? "text-flow-2" : "text-chalk-2")}>· {ageMin! < 2 ? "just now" : ageMin! < 60 ? `${ageMin} min ago` : `${Math.floor(ageMin! / 60)} h ${ageMin! % 60} min ago`}</span>
        </span>
      ) : liveError ? (
        "Live unavailable"
      ) : (
        "Loading live…"
      )
    ) : (
      `Typical weekday · ${hourLabel(hour)}`
    );

  const summary = (
    <div className="px-4 pb-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold">{statusLine}</span>
        <span className="text-[12.5px] text-chalk-2 num">{data.areas.length} spots</span>
      </div>
      <Distribution values={data.areas.map(valueOf)} />
      <div className="mt-4">
        <CityPulse
          levels={levels}
          nowHour={nowHour}
          hour={mode === "typical" ? hour : null}
          liveCount={mode === "live" && observed ? liveCount : null}
          onPick={(h) => {
            setHour(h);
            setMode("typical");
            setFilter("all");
          }}
        />
      </div>
      {mode === "live" && observed && (
        <div data-no-drag className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]" role="radiogroup" aria-label="Show">
          {(
            [
              ["all", `All ${data.areas.length}`, ""],
              ["jam", `Heavy now ${counts.jam}`, "bg-flow-2"],
              ["up", `Worse than usual ${counts.up}`, "bg-flow-3"],
              ["down", `Better than usual ${counts.down}`, "bg-flow-0"],
            ] as const
          ).map(([k, l, dot]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap num transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
                filter === k ? "bg-chalk text-asphalt" : "bg-asphalt-3 text-chalk-2",
              )}
            >
              {dot && <span className={cn("size-2 rounded-full", dot)} />}
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const shown = mode === "live" && filter !== "all" ? ranked.filter((a) => (filter === "jam" ? (liveRatio[a.id] ?? 0) >= 1.5 : trends[a.id] === filter)) : ranked;
  const list = (
    <ol className="px-2 pb-4" aria-label="Spots ranked by congestion">
      {shown.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-chalk-2">None right now</li>}
      {shown.map((a, i) => {
        const v = valueOf(a);
        const kinds = kindsOf(a.causes).slice(0, 3);
        const t = mode === "live" ? trends[a.id] : undefined;
        const u = usualOf(a);
        return (
          <motion.li
            key={a.id}
            layout="position"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: Math.min(i, 14) * 0.025 }}
          >
            <button type="button" onClick={() => select(a.id)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-asphalt-3 active:bg-asphalt-3">
              <span className="w-5 shrink-0 text-right text-[12px] font-semibold text-chalk-2 num">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{a.name}</span>
                <span className="mt-1 flex items-center gap-2 text-chalk-2">
                  {kinds.map((k) => (
                    <span key={k} title={KIND_LABEL[k]} className="flex">
                      <CauseIcon kind={k} size={14} />
                    </span>
                  ))}
                  <span className="truncate text-[12px]">{a.place}</span>
                </span>
                {a.profile && (
                  <span className="mt-1.5 block">
                    <DayStrip hours={a.profile.hours} hour={mode === "typical" ? hour : nowHour} />
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Ratio v={v} />
                {t && t !== "same" && <TrendTag trend={t} compact />}
                {t === "same" && u != null && <span className="text-[11px] text-chalk-2 num">usual {u.toFixed(1)}×</span>}
              </span>
            </button>
          </motion.li>
        );
      })}
    </ol>
  );

  const body = (
    <AnimatePresence mode="wait" initial={false}>
      {sel ? (
        <motion.div key={`p-${sel.id}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
          <Preview
            a={sel}
            value={valueOf(sel)}
            valueLabel={mode === "live" ? "Now" : hourLabel(hour)}
            markHour={mode === "live" ? nowHour : hour}
            usual={usualOf(sel)}
            live={live?.readings.find((r) => r.hotspot_id === sel.id)}
            onClose={() => setSelected(null)}
            withHeader={!!wide}
          />
        </motion.div>
      ) : (
        <motion.div key="list" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
          {list}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const layersCard = (
    <AnimatePresence>
      {layersOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="absolute right-0 bottom-[60px] w-[230px] origin-bottom-right rounded-2xl bg-asphalt-2 p-2 shadow-[0_10px_30px_#000a] ring-1 ring-white/[0.06]"
          role="group"
          aria-label="Map layers"
        >
          {(
            [
              ["flow", "Live traffic", "live"],
              ["incidents", "Reported queues", "live"],
              ["stretches", "Typical stretches", "typical"],
            ] as const
          ).map(([k, l, m]) => (
            <button
              key={k}
              type="button"
              role="switch"
              aria-checked={layers[k]}
              onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium active:bg-asphalt-3"
            >
              <span>
                {l}
                <span className="block text-[11.5px] font-normal text-chalk-2">{m === "live" ? "Live view" : "Typical view"}</span>
              </span>
              <span className={cn("relative h-6 w-10 rounded-full transition-colors duration-200", layers[k] ? "bg-sign" : "bg-asphalt-4")}>
                <motion.span layout transition={SPRING} className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow", layers[k] ? "right-0.5" : "left-0.5")} />
              </span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const fabs = (
    <div className="relative flex flex-col gap-2.5">
      {layersCard}
      <RoundButton label="Map layers" onClick={() => setLayersOpen((o) => !o)} active={layersOpen}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 13 9 5 9-5" />
        </svg>
      </RoundButton>
      <RoundButton label="Show my location" onClick={locate} active={!!user}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="6.5" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
        </svg>
      </RoundButton>
    </div>
  );

  return (
    <main className="dark-surface relative h-[calc(100dvh-64px-env(safe-area-inset-bottom))] overflow-hidden bg-asphalt text-chalk sm:h-[calc(100dvh-56px)]">
      <CityMap
        areas={data.areas}
        profileHours={data.hours}
        mode={mode}
        hour={hour}
        liveRatio={liveRatio}
        incidents={live?.incidents.items ?? []}
        selectedId={selected}
        onSelect={select}
        padding={padding}
        layers={layers}
        user={user}
        locateTick={locateTick}
        trend={mode === "live" ? mapTrend : {}}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING}
            className="absolute top-[calc(env(safe-area-inset-top)+118px)] left-1/2 z-40 -translate-x-1/2 rounded-full bg-asphalt-3 px-4 py-2 text-[13px] font-medium whitespace-nowrap shadow-[0_6px_20px_#0009] lg:top-6 lg:left-[calc(50%+210px)]"
            role="status"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {wide ? (
        <>
          <aside className="absolute top-4 bottom-4 left-4 z-30 flex w-[400px] flex-col overflow-hidden rounded-[22px] bg-asphalt-2/[0.97] shadow-[0_10px_40px_#000a] ring-1 ring-white/[0.06]">
            <div className="space-y-3 p-4 pb-3">
              <SearchBox areas={data.areas} onPick={(id) => select(id)} compact />
              <ModeChips mode={mode} setMode={setMode} hour={hour} liveOk={liveOk} onHour={() => {}} />
            </div>
            {!sel && summary}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.06] pt-2">{body}</div>
          </aside>
          <div className="absolute right-4 bottom-8 z-30">{fabs}</div>
        </>
      ) : wide === false ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 space-y-2.5 px-3 pt-[calc(env(safe-area-inset-top)+10px)] [&>*]:pointer-events-auto">
            <SearchBox areas={data.areas} onPick={(id) => select(id)} />
            <motion.div animate={{ opacity: snap === "full" ? 0 : 1, y: snap === "full" ? -8 : 0 }} transition={SPRING} className={cn(snap === "full" && "pointer-events-none")}>
              <ModeChips mode={mode} setMode={setMode} hour={hour} liveOk={liveOk} onHour={() => setSnap((s) => (s === "peek" ? "half" : s))} />
            </motion.div>
          </div>
          <motion.div
            className={cn("absolute right-3 z-20", snap === "full" && "pointer-events-none")}
            animate={{ bottom: Math.min(sheetH, 420) + 12, opacity: snap === "full" ? 0 : 1 }}
            transition={SPRING}
          >
            {fabs}
          </motion.div>
          <BottomSheet
            snap={snap}
            onSnap={setSnap}
            header={
              sel ? (
                <motion.div key={sel.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
                  <PlaceHeader a={sel} value={valueOf(sel)} onClose={() => setSelected(null)} />
                </motion.div>
              ) : (
                summary
              )
            }
            onSettle={setSheetH}
            label="Spots ranked by congestion"
            top={70}
          >
            {body}
          </BottomSheet>
        </>
      ) : null}
    </main>
  );
}
