"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { flowColor, flowLabel, hourLabel, minutes } from "@/lib/flow";
import type { AreaDetail, LiveReading } from "@/lib/types";
import { cn } from "@/lib/utils";

const AreaMap = dynamic(() => import("@/components/AreaMap").then((m) => m.AreaMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-asphalt-2" />,
});

const istHour = () => new Date(Date.now() + 5.5 * 3600e3).getUTCHours();

function nearestIndex(hours: number[], h: number) {
  let best = 0;
  for (let i = 0; i < hours.length; i++) if (Math.abs(hours[i] - h) < Math.abs(hours[best] - h)) best = i;
  return best;
}

export function AreaWhen({ area }: { area: AreaDetail }) {
  const [dirIdx, setDirIdx] = useState(() => {
    let best = 0;
    area.dirs.forEach((d, i) => {
      if (d.peak.ratio > area.dirs[best].peak.ratio) best = i;
    });
    return best;
  });
  const dir = area.dirs[dirIdx];
  const hours = useMemo(() => dir?.hours.map((h) => h.hour) ?? [], [dir]);
  const [hourIdx, setHourIdx] = useState(() => (dir ? dir.hours.findIndex((h) => h.hour === dir.peak.hour) : 0));
  const [hl, setHl] = useState<number | null>(null);

  if (!dir) {
    return <p className="text-ink-2">TomTom could not supply a clean corridor for this spot yet, so only live readings are shown.</p>;
  }

  const row = dir.hours[hourIdx];
  const worstLeg = row.legDelay.indexOf(Math.max(...row.legDelay));
  const starts = dir.legs.reduce<number[]>((acc, l, i) => [...acc, i === 0 ? 0 : acc[i - 1] + dir.legs[i - 1].len], []);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
      <div className="min-w-0">
        {area.dirs.length > 1 && (
          <div className="mb-6 inline-flex rounded-lg bg-paper-2 p-1 text-sm" role="tablist" aria-label="Direction of travel">
            <AnimatedBackground
              defaultValue={String(dirIdx)}
              className="rounded-md bg-white shadow-[0_1px_3px_#0002]"
              transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
              onValueChange={(v) => v != null && setDirIdx(Number(v))}
            >
              {area.dirs.map((d, i) => (
                <button key={d.tag} data-id={String(i)} type="button" role="tab" aria-selected={i === dirIdx} className="px-3.5 py-2.5 font-medium capitalize text-ink-2 data-[checked=true]:text-ink sm:py-1.5">
                  {d.heading}
                </button>
              ))}
            </AnimatedBackground>
          </div>
        )}

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { k: "Empty road", v: `${minutes(dir.freeFlowS)} min`, s: `${(dir.lengthM / 1000).toFixed(1)} km`, c: undefined },
            { k: "Worst hour", v: hourLabel(dir.peak.hour), s: `${minutes(dir.freeFlowS + dir.peak.delay)} min`, c: dir.peak.ratio },
            { k: "Slowdown", v: `${dir.peak.ratio.toFixed(1)}×`, s: flowLabel(dir.peak.ratio), c: dir.peak.ratio },
            { k: "Morning peak", v: hourLabel(dir.am.hour), s: `${dir.am.ratio.toFixed(1)}×`, c: dir.am.ratio },
          ].map((t) => (
            <li key={t.k} className="rounded-2xl bg-paper-2 p-3.5">
              <div className="text-[12.5px] text-ink-2">{t.k}</div>
              <div className="mt-1 flex items-center gap-2 text-[22px] leading-none font-semibold tracking-[-0.02em] num">
                {t.c != null && <span className="size-2.5 rounded-full" style={{ background: flowColor(t.c) }} />}
                {t.v}
              </div>
              <div className="mt-1.5 text-[12.5px] text-ink-2 num">{t.s}</div>
            </li>
          ))}
        </ul>

        <div className="mt-8 overflow-x-auto pb-2">
          <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-[3px] text-[12.5px]">
            <caption className="sr-only">Slowdown of each stretch by hour on a typical weekday</caption>
            <thead>
              <tr>
                <th scope="col" className="w-[92px] pr-2 text-left font-medium text-ink-2">
                  Stretch
                </th>
                {hours.map((h, i) => (
                  <th key={h} scope="col" className={cn("font-medium num", i === hourIdx ? "text-ink" : "text-ink-2")}>
                    {h % 12 === 0 ? (h === 0 ? "12a" : "12p") : h < 12 ? `${h}a` : `${h - 12}p`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dir.legs.map((leg, li) => (
                <tr key={li} onMouseEnter={() => setHl(li)} onMouseLeave={() => setHl(null)}>
                  <th scope="row" className="pr-2 text-left font-normal whitespace-nowrap text-ink-2 num">
                    {(starts[li] / 1000).toFixed(1)}–{((starts[li] + leg.len) / 1000).toFixed(1)} km
                  </th>
                  {dir.hours.map((h, hi) => {
                    const r = h.legs[li];
                    const worstHere = h.legDelay[li] === Math.max(...h.legDelay) && h.legDelay[li] > 5;
                    return (
                      <td key={hi} className="p-0">
                        <button
                          type="button"
                          onClick={() => setHourIdx(hi)}
                          className={cn(
                            "relative block h-8 w-full rounded-[3px] transition-transform duration-150 active:scale-95",
                            hi === hourIdx && "ring-2 ring-ink ring-offset-1 ring-offset-paper",
                          )}
                          style={{ background: flowColor(r) }}
                          aria-label={`${(starts[li] / 1000).toFixed(1)} km stretch at ${hourLabel(h.hour)}: ${r.toFixed(2)} times free flow${worstHere ? ", worst stretch at this hour" : ""}`}
                        >
                          {worstHere && <span className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-ink/80" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <span className="size-1.5 rounded-full bg-ink/80" /> worst stretch at that hour · rows in travel order · tap a cell
        </p>

        <div className="mt-6 flex flex-wrap gap-2 text-[13.5px] num" aria-live="polite">
          <span className="flex items-center gap-2 rounded-full bg-paper-2 px-3 py-1.5 font-semibold">
            <span className="size-2.5 rounded-full" style={{ background: flowColor(row.ratio) }} />
            {hourLabel(row.hour)} · {row.ratio.toFixed(2)}× · {flowLabel(row.ratio)}
          </span>
          <span className="rounded-full bg-paper-2 px-3 py-1.5">{row.delay > 0 ? `${Math.round(row.delay)} s lost` : "No delay"}</span>
          {row.delay > 5 && (
            <span className="rounded-full bg-ink px-3 py-1.5 font-medium text-chalk">
              Bottleneck {(starts[worstLeg] / 1000).toFixed(1)}–{((starts[worstLeg] + dir.legs[worstLeg].len) / 1000).toFixed(1)} km ·{" "}
              {Math.round((100 * row.legDelay[worstLeg]) / Math.max(1, row.delay))}% of delay
            </span>
          )}
        </div>
      </div>

      <div className="h-[360px] overflow-hidden rounded-lg bg-asphalt lg:sticky lg:top-20 lg:h-[520px]">
        <AreaMap center={[area.snapped.lon, area.snapped.lat]} dirs={area.dirs} active={dirIdx} hourIndex={hourIdx} highlightLeg={hl} />
      </div>
    </div>
  );
}

export function LiveNow({ id }: { id: string }) {
  const [r, setR] = useState<LiveReading | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/live")
      .then((x) => x.json())
      .then((j) => setR((j.readings as LiveReading[]).find((x) => x.hotspot_id === id) ?? null))
      .catch(() => setR(null));
  }, [id]);
  if (r === undefined) return <div className="h-10 w-56 animate-pulse rounded-full bg-asphalt-3" />;
  if (r === null) return <span className="inline-flex h-10 items-center rounded-full bg-asphalt-3 px-4 text-[14px] text-chalk-2">No live reading yet</span>;
  const ratio = r.current_travel_time / r.free_flow_travel_time;
  const t = new Date(r.observed_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return (
    <div className="flex flex-wrap items-center gap-2 num">
      <span className="flex h-10 items-center gap-2 rounded-full bg-asphalt-3 px-4 text-[17px] font-semibold">
        <span className="size-2.5 rounded-full" style={{ background: flowColor(ratio) }} />
        {flowLabel(ratio)} · {ratio.toFixed(1)}×
      </span>
      <span className="flex h-10 items-center rounded-full bg-asphalt-3 px-4 text-[14px]">
        {Math.round(r.current_speed)} <span className="ml-1 text-chalk-2">km/h · free {Math.round(r.free_flow_speed)}</span>
      </span>
      <span className="flex h-10 items-center gap-1.5 rounded-full px-2 text-[13px] text-chalk-2">
        <span className="size-1.5 rounded-full bg-flow-0" /> Live · {t}
      </span>
    </div>
  );
}

interface Hourly {
  weekend: boolean;
  hour: number;
  samples: number;
  slowdown: number;
  avg_speed: number;
  first_seen: string;
}

export function Measured({ id, typical }: { id: string; typical: { hour: number; ratio: number }[] }) {
  const [data, setData] = useState<{ hourly: Hourly[]; recent: unknown[] } | null>(null);
  useEffect(() => {
    fetch(`/api/measured/${id}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ hourly: [], recent: [] }));
  }, [id]);
  if (!data) return <p className="text-ink-2">Loading RoadFix readings…</p>;
  const weekday = data.hourly.filter((h) => !h.weekend);
  const total = data.hourly.reduce((a, h) => a + h.samples, 0);
  const first = data.hourly.map((h) => h.first_seen).sort()[0];
  const now = istHour();
  return (
    <div>
      <p className="flex flex-wrap gap-2 text-[13px] text-ink-2 num">
        <span className="rounded-full bg-paper-2 px-3 py-1">Every 30 min</span>
        {total ? (
          <>
            <span className="rounded-full bg-paper-2 px-3 py-1">{total} readings</span>
            <span className="rounded-full bg-paper-2 px-3 py-1">
              since {new Date(first).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
            </span>
          </>
        ) : (
          <span className="rounded-full bg-paper-2 px-3 py-1">First readings within the hour</span>
        )}
      </p>
      {total > 0 && (
        <div className="mt-5 grid gap-[3px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {Array.from({ length: 24 }, (_, h) => {
            const m = weekday.find((x) => x.hour === h) ?? data.hourly.find((x) => x.hour === h);
            const t = typical.find((x) => x.hour === h);
            return (
              <div key={h} className="text-center">
                <div
                  className={cn("h-8 rounded-[3px]", !m && "bg-paper-3")}
                  style={m ? { background: flowColor(Number(m.slowdown)) } : undefined}
                  title={m ? `${hourLabel(h)}: ${Number(m.slowdown).toFixed(2)}× over ${m.samples} readings${t ? `; typical ${t.ratio.toFixed(2)}×` : ""}` : `${hourLabel(h)}: no readings yet`}
                />
                <div className={cn("mt-1 text-[10.5px] num", h === now ? "font-semibold text-ink" : "text-ink-2")}>{h % 6 === 0 ? hourLabel(h).replace(" ", "") : ""}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { nearestIndex };
