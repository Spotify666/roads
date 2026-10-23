import type { Metadata } from "next";
import Link from "next/link";
import { Lab } from "@/components/lab/Lab";
import { CalibrationChart, StretchGrid } from "@/components/sim/PilotCharts";
import { Results } from "@/components/sim/Results";
import type { Metrics } from "@/sim/scenario";
import pilotData from "@/data/pilot.json";
import labBaseline from "@/data/lab_baseline.json";

export const metadata: Metadata = {
  title: "Simulation Lab: Mehdipatnam–Tolichowki",
  description:
    "Change the real 2.7 km Mehdipatnam–Tolichowki corridor yourself: move U-turns, make it one-way, add a bus lane, retime signals. Then test it in a traffic simulation calibrated to TomTom travel times.",
};

type Row = { vehHours: number; vehKm: number; fuel: number; slowHours: number; wrongside: number; uturns: number; trips: number; thrW: number; thrE: number };
interface PilotData {
  length: number;
  stretches: Record<"west" | "east", { from: number; to: number; ff: number; hours: [number, number, number][] }[]>;
  tomtom: Record<"west" | "east", { hour: number; free: number; typical: number; ratio: number }[]>;
  calibration: { base: number[]; hours: Record<string, { qW: number; qE: number; target: number[]; got: number[] }> };
  results: null | {
    cost: Record<string, number>;
    hours: Record<string, { today: Row; fix: Row }>;
    daily: { today: Row; fix: Row };
  };
}

const data = pilotData as unknown as PilotData;
const baseline = labBaseline as unknown as { hours: Record<string, { today: Metrics[]; plan: Metrics[] }>; planOpenings: number[]; reverseShare: number };

export default function PilotPage() {
  const r = data.results;
  const cal = data.calibration.hours;
  const calRows = (d: 0 | 1) =>
    Object.entries(cal)
      .map(([h, c]) => ({ hour: Number(h), tomtom: c.target[d], sim: c.got[d] }))
      .sort((a, b) => a.hour - b.hour);
  const tomtom = Object.fromEntries(
    data.tomtom.west.map((w) => [String(w.hour), Math.max(w.ratio, data.tomtom.east.find((e) => e.hour === w.hour)?.ratio ?? 0)]),
  );
  const totalCost = r ? Object.values(r.cost).reduce((a, b) => a + b, 0) : 0;
  const err = Math.max(...Object.values(cal).flatMap((c) => c.target.map((t, i) => Math.abs(c.got[i] - t))));

  return (
    <main>
      <section className="dark-surface bg-asphalt text-chalk">
        <div className="mx-auto max-w-[1440px] px-4 pt-6 pb-14 sm:px-6 sm:pt-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] sm:text-[32px]">Simulation Lab</h1>
            <ul className="flex flex-wrap gap-1.5 text-[12.5px] font-medium text-chalk-2">
              <li className="rounded-full bg-asphalt-3 px-2.5 py-1">Mehdipatnam ↔ Tolichowki</li>
              <li className="rounded-full bg-asphalt-3 px-2.5 py-1 num">{(data.length / 1000).toFixed(1)} km</li>
              <li className="rounded-full bg-asphalt-3 px-2.5 py-1">Weekday</li>
              <li className="rounded-full bg-asphalt-3 px-2.5 py-1 num">Matches TomTom ±{err.toFixed(2)}×</li>
            </ul>
          </div>
          <Lab cal={cal} tomtom={tomtom} baseline={baseline} />
        </div>
      </section>

      {r && (
        <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">RoadFix plan, every hour</h2>
          <p className="mt-1 mb-6 text-[14px] text-ink-2">Re-spaced U-turns with pockets · bus bays · auto bays · clear Tolichowki kerb</p>
          <Results hours={r.hours} daily={r.daily} costLakh={totalCost} />
        </section>
      )}

      <section className="bg-paper-2">
        <div className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20">
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">Where the time goes today</h2>
          <p className="mt-1 text-[14px] text-ink-2">TomTom typical weekday · ~300 m stretches · metres from Mehdipatnam</p>
          <div className="mt-8 grid gap-12 [&>*]:min-w-0">
            <StretchGrid stretches={data.stretches.west} title="→ Tolichowki" />
            <StretchGrid stretches={data.stretches.east} title="→ Mehdipatnam" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20">
        <h2 className="text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">Model vs TomTom</h2>
        <p className="mt-1 text-[14px] text-ink-2">Slowdown against free flow, each hour, today&apos;s layout</p>
        <div className="mt-8 grid gap-12 lg:grid-cols-2 [&>*]:min-w-0">
          <CalibrationChart rows={calRows(0)} title="→ Tolichowki" />
          <CalibrationChart rows={calRows(1)} title="→ Mehdipatnam" />
        </div>
        <Link
          href="/method#pilot"
          className="mt-10 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-chalk transition-transform duration-150 active:scale-[0.97]"
        >
          How the model and plan were built
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    </main>
  );
}
