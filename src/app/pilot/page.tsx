import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { Lab } from "@/components/lab/Lab";
import { CalibrationChart, StretchGrid } from "@/components/sim/PilotCharts";
import { Results } from "@/components/sim/Results";
import { Reveal } from "@/components/ui/Reveal";
import { PILOT_CORRIDOR, PILOT_ID } from "@/sim/pilotCorridor";
import type { Corridor } from "@/sim/scenario";
import pilotData from "@/data/pilot.json";
import areasData from "@/data/areas.json";

type Row = { vehHours: number; vehKm: number; fuel: number; slowHours: number; wrongside: number; uturns: number; trips: number; thrW: number; thrE: number };
interface PilotData {
  length: number;
  stretches: Record<"west" | "east", { from: number; to: number; ff: number; hours: [number, number, number][] }[]>;
  results: null | {
    cost: Record<string, number>;
    hours: Record<string, { today: Row; fix: Row }>;
    daily: { today: Row; fix: Row };
  };
}

const data = pilotData as unknown as PilotData;
const areas = (areasData as unknown as { areas: { id: string; name: string }[] }).areas;
// the pilot first, then every other spot by name
const roads = [
  { id: PILOT_ID, name: PILOT_CORRIDOR.name },
  ...areas
    .filter((a) => a.id !== PILOT_ID)
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((a, b) => a.name.localeCompare(b.name)),
];

/** A spot's calibrated corridor, read on the server; the pilot is built in. */
function load(id: string | undefined): Corridor {
  if (!id || id === PILOT_ID || !/^[a-z0-9-]+$/.test(id)) return PILOT_CORRIDOR;
  const file = path.join(process.cwd(), "public", "data", "corridors", `${id}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Corridor) : PILOT_CORRIDOR;
}

type Search = { searchParams: Promise<{ spot?: string }> };

export async function generateMetadata({ searchParams }: Search): Promise<Metadata> {
  const c = load((await searchParams).spot);
  return {
    title: `Simulation Lab: ${c.name}`,
    description: `Change ${c.name} yourself: move U-turns, make it one-way, add a bus lane, retime signals. Then test it in a traffic simulation calibrated to TomTom travel times.`,
  };
}

export default async function PilotPage({ searchParams }: Search) {
  const c = load((await searchParams).spot);
  const r = c.pilot ? data.results : null;
  const calRows = (d: 0 | 1) =>
    Object.entries(c.cal)
      .filter(([, v]) => v.target[d] != null && v.got[d] != null)
      .map(([h, v]) => ({ hour: Number(h), tomtom: v.target[d]!, sim: v.got[d]! }))
      .sort((a, b) => a.hour - b.hour);
  const totalCost = r ? Object.values(r.cost).reduce((a, b) => a + b, 0) : 0;
  const errs = Object.values(c.cal).flatMap((v) => v.target.map((t, i) => (t == null || v.got[i] == null ? 0 : Math.abs(v.got[i]! - t))));
  const typicalErr = errs.sort((a, b) => a - b)[Math.floor(errs.length / 2)] ?? 0;
  const oneDir = c.cal[Object.keys(c.cal)[0]]?.target[1] == null;

  return (
    <main>
      <section className="dark-surface plus-grid bg-asphalt text-chalk">
        <div className="mx-auto max-w-[1440px] px-4 pt-6 pb-14 sm:px-6 sm:pt-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <h1 className="display text-[34px] sm:text-[44px]">Simulation Lab</h1>
            <ul className="flex flex-wrap gap-1.5 text-[12.5px] font-medium text-chalk-2">
              <li className="rounded-full bg-asphalt-3 px-2.5 py-1">
                {c.toward[1]} ↔ {c.toward[0]}
              </li>
              <li className="rounded-full bg-asphalt-3 px-2.5 py-1 num">{(c.length / 1000).toFixed(1)} km</li>
              <li className="rounded-full bg-asphalt-3 px-2.5 py-1">Weekday</li>
              <li className="rounded-full bg-asphalt-3 px-2.5 py-1 num">Typically within ±{typicalErr.toFixed(2)}× of TomTom</li>
            </ul>
          </div>
          <Lab corridor={c} roads={roads} />
        </div>
      </section>

      {r && (
        <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20">
          <Reveal>
            <h2 className="display text-[30px] sm:text-[38px]">RoadFix plan, every hour</h2>
            <p className="mt-2 mb-7 text-[14px] text-ink-2">Re-spaced U-turns with pockets · bus bays · auto bays · clear Tolichowki kerb</p>
          </Reveal>
          <Results hours={r.hours} daily={r.daily} costLakh={totalCost} />
        </section>
      )}

      {c.pilot && (
        <section className="bg-paper-2">
          <div className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20">
            <Reveal>
              <h2 className="display text-[30px] sm:text-[38px]">Where the time goes today</h2>
              <p className="mt-2 text-[14px] text-ink-2">TomTom typical weekday · ~300 m stretches · metres from Mehdipatnam</p>
            </Reveal>
            <div className="mt-8 grid gap-12 [&>*]:min-w-0">
              <Reveal>
                <StretchGrid stretches={data.stretches.west} title="→ Tolichowki" />
              </Reveal>
              <Reveal>
                <StretchGrid stretches={data.stretches.east} title="→ Mehdipatnam" />
              </Reveal>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20">
        <Reveal>
          <h2 className="display text-[30px] sm:text-[38px]">Model vs TomTom</h2>
          <p className="mt-2 text-[14px] text-ink-2">
            Slowdown against free flow, each hour, today&apos;s layout{oneDir ? " · TomTom measures one direction here; the other runs the same traffic" : ""}
          </p>
        </Reveal>
        <div className="mt-8 grid gap-12 lg:grid-cols-2 [&>*]:min-w-0">
          <Reveal>
            <CalibrationChart rows={calRows(0)} title={`→ ${c.toward[0]}`} />
          </Reveal>
          {!oneDir && (
            <Reveal delay={0.08}>
              <CalibrationChart rows={calRows(1)} title={`→ ${c.toward[1]}`} />
            </Reveal>
          )}
        </div>
        <div className="mt-10 flex flex-wrap gap-2">
          {!c.pilot && (
            <Link
              href={`/area/${c.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-sign px-5 text-[14.5px] font-medium text-white transition-[transform,box-shadow] duration-200 ease-[var(--ease-out-strong)] hover:-translate-y-px active:scale-[0.97]"
            >
              When {c.name} jams
              <span aria-hidden="true">→</span>
            </Link>
          )}
          <Link
            href={c.pilot ? "/method#pilot" : "/method#lab"}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-chalk transition-[transform,box-shadow] duration-200 ease-[var(--ease-out-strong)] hover:-translate-y-px hover:shadow-[0_8px_24px_#14171a33] active:scale-[0.97]"
          >
            How the model was built
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
