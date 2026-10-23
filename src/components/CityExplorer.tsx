"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { HourStrip } from "@/components/HourStrip";
import { CAUSE_LABELS, atHour, flowColor, flowLabel, hourLabel } from "@/lib/flow";
import type { LiveIncident, LiveReading } from "@/lib/types";
import type { AreaWithStretches } from "@/components/CityMap";
import { cn } from "@/lib/utils";

const CityMap = dynamic(() => import("@/components/CityMap").then((m) => m.CityMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-asphalt-2" />,
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
const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function CityExplorer({ data }: { data: Data }) {
  const [mode, setMode] = useState<"live" | "typical">("live");
  const [hour, setHour] = useState(18);
  const [selected, setSelected] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [liveError, setLiveError] = useState(false);

  useEffect(() => {
    setHour(istHour());
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/live");
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as Live;
        if (alive) {
          setLive(j);
          setLiveError(false);
          if (!j.readings.length) setMode("typical");
        }
      } catch {
        if (alive) {
          setLiveError(true);
          setMode("typical");
        }
      }
    };
    load();
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const liveRatio = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of live?.readings ?? []) {
      if (r.free_flow_travel_time > 0 && r.confidence >= 0.5) m[r.hotspot_id] = r.current_travel_time / r.free_flow_travel_time;
    }
    return m;
  }, [live]);

  const cityByHour = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => {
        const vals = data.areas.map((a) => atHour(a.profile?.hours ?? [], h)).filter((v): v is number => v != null);
        return vals.reduce((x, y) => x + y, 0) / Math.max(1, vals.length);
      }),
    [data.areas],
  );

  const valueOf = (a: AreaWithStretches) => (mode === "live" ? liveRatio[a.id] ?? null : atHour(a.profile?.hours ?? [], hour));
  const ranked = useMemo(
    () => [...data.areas].sort((a, b) => (valueOf(b) ?? 0) - (valueOf(a) ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.areas, mode, hour, liveRatio],
  );

  const observed = live?.readings[0]?.observed_at;
  const jammed = Object.values(liveRatio).filter((r) => r >= 1.5).length;

  return (
    <section className="dark-surface bg-asphalt text-chalk lg:grid lg:h-[calc(100svh-56px)] lg:grid-cols-[minmax(380px,460px)_1fr]">
      <div className="h-[56svh] lg:order-2 lg:h-full">
        <CityMap
          areas={data.areas}
          profileHours={data.hours}
          mode={mode}
          hour={hour}
          liveRatio={liveRatio}
          incidents={live?.incidents.items ?? []}
          selectedId={selected}
          onSelect={(id) => setSelected(id)}
        />
      </div>

      <div className="flex min-h-0 flex-col lg:order-1">
        <div className="px-4 pt-7 pb-5 sm:px-6">
          <h1 className="text-[30px] leading-[1.08] font-semibold tracking-[-0.025em] text-balance sm:text-[38px]">
            Where Hyderabad jams, and the cheap fix for each
          </h1>
          <p className="mt-3 max-w-[46ch] text-[15.5px] leading-relaxed text-chalk-2">
            41 junctions and stretches, ranked by measured traffic. Each one shows when it jams, the bottleneck behind it, and a
            low-cost fix an agency can build in weeks.
          </p>
        </div>

        <div className="px-4 sm:px-6">
          <div className="flex items-center gap-1 rounded-lg bg-asphalt-2 p-1 text-sm" role="tablist" aria-label="What the map shows">
            <AnimatedBackground
              defaultValue={mode}
              className="rounded-md bg-asphalt-4"
              transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
              onValueChange={(v) => v && setMode(v as "live" | "typical")}
            >
              {[
                { id: "live", label: "Live now" },
                { id: "typical", label: "Typical weekday" },
              ].map((t) => (
                <button
                  key={t.id}
                  data-id={t.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.id}
                  disabled={t.id === "live" && (liveError || (live !== null && !live.readings.length))}
                  className="flex-1 px-3 py-2 font-medium text-chalk-2 transition-colors duration-150 data-[checked=true]:text-chalk disabled:opacity-40"
                >
                  {t.label}
                </button>
              ))}
            </AnimatedBackground>
          </div>

          <div className="mt-4">
            <HourStrip
              values={cityByHour}
              hour={hour}
              active={mode === "typical"}
              label="Hour of a typical weekday"
              onChange={(h) => {
                setHour(h);
                setMode("typical");
              }}
            />
          </div>

          <p className="mt-4 min-h-[44px] text-sm leading-snug text-chalk-2" aria-live="polite">
            {mode === "live" ? (
              observed ? (
                <>
                  <span className="mr-1.5 inline-block size-2 translate-y-[-1px] rounded-full bg-flow-0 align-middle" />
                  Live from TomTom, read {istTime(observed)} IST. {jammed} of 41 spots are jammed;{" "}
                  {live?.incidents.jams ?? 0} queues reported across the city.
                </>
              ) : liveError ? (
                "Live readings are unavailable right now, so the map shows a typical weekday."
              ) : (
                "Loading live readings…"
              )
            ) : (
              <>Typical weekday at {hourLabel(hour)}, from TomTom&apos;s historical speeds. Colour shows how much slower than free flow each stretch runs.</>
            )}
          </p>
        </div>

        <ol className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-6 sm:px-3 lg:pb-3" aria-label="Hotspots ranked by congestion">
          {ranked.map((a) => {
            const v = valueOf(a);
            const open = a.id === selected;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelected(open ? null : a.id)}
                  aria-expanded={open}
                  className={cn(
                    "w-full rounded-lg px-2.5 py-3 text-left transition-colors duration-150 sm:px-3",
                    open ? "bg-asphalt-3" : "hover:bg-asphalt-2",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.name}</div>
                      <div className="truncate text-[13px] text-chalk-2">{a.place}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center justify-end gap-1.5 font-medium num">
                        <span className="size-2.5 rounded-full" style={{ background: flowColor(v) }} />
                        {v != null ? `${v.toFixed(1)}×` : "–"}
                      </div>
                      <div className="text-[12px] text-chalk-2">{flowLabel(v)}</div>
                    </div>
                  </div>
                  {a.profile && (
                    <div className="mt-2 flex h-[5px] gap-[2px]" aria-hidden="true">
                      {Array.from({ length: 24 }, (_, h) => {
                        const hv = atHour(a.profile!.hours, h);
                        return (
                          <span
                            key={h}
                            className={cn("flex-1 rounded-[1px]", mode === "typical" && h === hour ? "outline outline-1 outline-chalk" : "")}
                            style={{ background: flowColor(hv), opacity: mode === "typical" && h !== hour ? 0.75 : 1 }}
                          />
                        );
                      })}
                    </div>
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pt-1 pb-4 text-[14px] leading-relaxed">
                        {a.profile && (
                          <p className="text-chalk-2">
                            Worst on weekdays at {hourLabel(a.profile.peak.hour)}: {a.profile.peak.ratio.toFixed(1)}× free-flow time{" "}
                            {a.profile.heading}, about {Math.round(a.profile.peakDelayPerKm)} s lost per km.
                          </p>
                        )}
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {a.causes.slice(0, 3).map((c) => (
                            <li key={c} className="rounded-md bg-asphalt-4 px-2 py-0.5 text-[12.5px] text-chalk">
                              {CAUSE_LABELS[c] ?? c}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-3">
                          <span className="text-chalk-2">Fix: </span>
                          {a.fix.title}
                        </p>
                        <p className="text-chalk-2 num">
                          ₹{a.fix.costLakh[0]}–{a.fix.costLakh[1]} lakh · about {a.fix.weeks} weeks · {a.fix.agency}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/area/${a.id}`}
                            className="rounded-md bg-sign px-3 py-2 text-[14px] font-medium text-white transition-transform duration-150 active:scale-[0.97]"
                          >
                            When, why and the fix
                          </Link>
                          {a.pilot && (
                            <Link
                              href="/pilot"
                              className="rounded-md bg-asphalt-4 px-3 py-2 text-[14px] font-medium text-chalk transition-transform duration-150 active:scale-[0.97]"
                            >
                              Watch the simulation
                            </Link>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
