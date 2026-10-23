import type { Metadata } from "next";
import Link from "next/link";
import { SimView } from "@/components/sim/SimView";
import { CalibrationChart, StretchGrid } from "@/components/sim/PilotCharts";
import { LayoutDiagram } from "@/components/sim/LayoutDiagram";
import { Results } from "@/components/sim/Results";
import { hourLabel } from "@/lib/flow";
import pilotData from "@/data/pilot.json";

export const metadata: Metadata = {
  title: "Mehdipatnam–Tolichowki pilot: today vs with RoadFix",
  description:
    "A traffic simulation of the real 2.7 km Mehdipatnam–Tolichowki corridor, calibrated to TomTom travel times, run as it is today and with RoadFix's U-turn, bus-bay and kerb changes.",
};

type Row = { vehHours: number; vehKm: number; fuel: number; slowHours: number; wrongside: number; uturns: number; trips: number; thrW: number; thrE: number };
type Score = { slow: number; vehH: number; vehKm: number; fuel: number; wrong: number };
type Breakdown = { vehKm: number; vehHours: number; stuckHours: number; litres: number; wrongSide: number };
interface PilotData {
  length: number;
  stretches: Record<"west" | "east", { from: number; to: number; ff: number; hours: [number, number, number][] }[]>;
  tomtom: Record<"west" | "east", { hour: number; free: number; typical: number; ratio: number }[]>;
  calibration: { base: number[]; hours: Record<string, { qW: number; qE: number; target: number[]; got: number[] }> };
  results: null | {
    quick: {
      today: { openings: number[]; breakdown: Breakdown };
      goals: Record<string, { openings: number[]; breakdown: Breakdown }>;
      balanced: { openings: number[]; regret: number; breakdown: Breakdown };
    };
    layout: { openings: number[]; added: number[]; kept: number[]; closed: number[]; busBays: number[] };
    cost: Record<string, number>;
    hours: Record<string, { today: Row; fix: Row }>;
    daily: { today: Row; fix: Row };
    attribution: { hour: number; today: Row; parts: Record<string, Row> };
    reverseShare: number;
    selection?: {
      hours: number[];
      today: Score;
      candidates: Record<string, { openings: number[]; score: Score }>;
      pick: string;
      regret: number;
    };
  };
}

const data = pilotData as unknown as PilotData;
const PLACES = [
  { s: 0, name: "Mehdipatnam" },
  { s: 986, name: "Rethibowli" },
  { s: 1371, name: "Nanal Nagar" },
  { s: 2696, name: "Tolichowki" },
];
const GOAL_LABELS: Record<string, string> = {
  congestion: "Least traffic",
  time: "Least travel time",
  distance: "Least travel distance",
  fuel: "Least fuel",
};
const pct = (a: number, b: number) => `${a > b ? "+" : "−"}${Math.abs(Math.round(((a - b) / b) * 100))}%`;

export default function PilotPage() {
  const r = data.results;
  const cal = data.calibration.hours;
  const calRows = (d: 0 | 1) =>
    Object.entries(cal)
      .map(([h, c]) => ({ hour: Number(h), tomtom: c.target[d], sim: c.got[d] }))
      .sort((a, b) => a.hour - b.hour);
  const totalCost = r ? Object.values(r.cost).reduce((a, b) => a + b, 0) : 0;
  const pm = r?.hours["18"];

  return (
    <main>
      <section className="dark-surface bg-asphalt text-chalk">
        <div className="mx-auto max-w-[1280px] px-4 pt-10 pb-16 sm:px-6">
          <h1 className="max-w-[22ch] text-[32px] leading-[1.06] font-semibold tracking-[-0.025em] text-balance sm:text-[44px]">
            Mehdipatnam to Tolichowki, today and with RoadFix
          </h1>
          <p className="mt-4 max-w-[64ch] text-[17px] leading-relaxed text-chalk-2">
            2.7 km of Golconda Road and the Old Bombay Highway, which carries 80,000 to 1,00,000 vehicles a day. The same traffic runs on both roads below:
            the top one as it is today, the bottom one with the changes RoadFix recommends.
          </p>
          <div className="mt-10">
            {r ? <SimView calibration={cal} openings={r.layout.openings} /> : <p className="text-chalk-2">The simulation is being prepared.</p>}
          </div>
        </div>
      </section>

      {r && (
        <section className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6">
          <h2 className="text-[30px] font-semibold tracking-[-0.02em]">What changes</h2>
          <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_1fr]">
            <ul className="space-y-6 text-[16.5px] leading-relaxed">
              <li>
                <strong className="font-semibold">U-turn openings re-spaced, each with a waiting pocket.</strong> Today&apos;s five openings, as mapped in
                OpenStreetMap, sit at {r.quick.today.openings.join(", ")} m from Mehdipatnam, leaving a {Math.max(...gaps(r.quick.today.openings, data.length))} m gap
                that pushes riders to go wrong-side. The recommended five sit at {r.layout.openings.join(", ")} m, so no rider is more than{" "}
                {Math.max(...gaps(r.layout.openings, data.length))} m from the next one.
              </li>
              <li>
                <strong className="font-semibold">Bus bays at the Mehdipatnam and Tolichowki stops</strong> ({r.layout.busBays.length} stops), so buses stop
                out of the running lane.
              </li>
              <li>
                <strong className="font-semibold">Marked shared-auto bays</strong> at the same stops, off the carriageway.
              </li>
              <li>
                <strong className="font-semibold">A no-stopping zone and off-road vending area</strong> on the last 300 m into Tolichowki.
              </li>
              <li className="text-ink-2">
                Not counted: retiming the Nanal Nagar and Rethibowli signals. They also serve side streets that are not simulated, so any gain claimed here
                would be a guess.
              </li>
            </ul>
            <div>
              <LayoutDiagram
                length={data.length}
                places={PLACES}
                layouts={[
                  { label: "Today", openings: r.quick.today.openings, note: "as mapped, to be checked on site" },
                  { label: "With RoadFix", openings: r.layout.openings, note: "each with a waiting pocket", highlight: true },
                ]}
              />
              <p className="mt-3 text-[13.5px] text-ink-2">Openings are blocked within 30 m of bus stops, at junction mouths, at the lane drop and on the flyover ramps.</p>
            </div>
          </div>
        </section>
      )}

      {r && (
        <section className="bg-paper-2">
          <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6">
            <h2 className="text-[30px] font-semibold tracking-[-0.02em]">Results</h2>
            <p className="mt-3 mb-8 max-w-[66ch] text-[16.5px] leading-relaxed text-ink-2">
              Each hour simulated in full, today against the RoadFix package, on the four goals in the plan. At the 6 pm peak an end-to-end trip towards
              Tolichowki takes {Math.round(pm!.today.thrW)} s today and {Math.round(pm!.fix.thrW)} s with the changes; towards Mehdipatnam, {Math.round(pm!.today.thrE)} s
              and {Math.round(pm!.fix.thrE)} s.
            </p>
            <Results hours={r.hours} daily={r.daily} costLakh={totalCost} />
          </div>
        </section>
      )}

      {r && (
        <section className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6">
          <h2 className="text-[30px] font-semibold tracking-[-0.02em]">What the changes do not fix</h2>
          <p className="mt-4 max-w-[66ch] text-[17px] leading-relaxed">
            The evening queue towards Mehdipatnam builds at the Nanal Nagar signal, where two lanes from Tolichowki meet a red light. U-turn spacing and bus
            bays barely touch it: at {hourLabel(16)} the end-to-end trip towards Mehdipatnam is {Math.round(r.hours["16"].today.thrE)} s today and{" "}
            {Math.round(r.hours["16"].fix.thrE)} s with the package. That queue needs the signal retimed or the junction widened, and the first step is a
            turning count at Nanal Nagar.
          </p>
          <h3 className="mt-14 text-[22px] font-semibold tracking-[-0.015em]">Which change does what, at {hourLabel(r.attribution.hour)}</h3>
          <table className="mt-5 w-full max-w-[760px] text-left text-[15.5px]">
            <thead>
              <tr className="text-[13px] text-ink-2">
                <th className="pb-2 font-medium">Change on its own</th>
                <th className="pb-2 text-right font-medium">Vehicle-hours saved in the hour</th>
                <th className="pb-2 text-right font-medium">Crawling time saved</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["openings", "Re-spaced U-turns with pockets"],
                  ["bays", "Bus bays"],
                  ["autos", "Shared-auto bays"],
                  ["kerb", "Clear Tolichowki kerb"],
                ] as const
              ).map(([k, label]) => {
                const t = r.attribution.today;
                const p = r.attribution.parts[k];
                const s = t.trips / Math.max(1, p.trips);
                return (
                  <tr key={k}>
                    <th scope="row" className="py-2.5 font-normal">
                      {label}
                    </th>
                    <td className="py-2.5 text-right num">{Math.round(t.vehHours - p.vehHours * s)}</td>
                    <td className="py-2.5 text-right num">{Math.round(t.slowHours - p.slowHours * s)} veh-h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {r && (
        <section className="bg-paper-2">
          <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6">
            <h2 className="text-[30px] font-semibold tracking-[-0.02em]">How the U-turn layout was chosen</h2>
            <p className="mt-4 max-w-[68ch] text-[16.5px] leading-relaxed">
              First, a quick model finds the best layout for each goal exactly, with a dynamic programme over every buildable site at 50 m spacing. In that
              model the goals pull apart: the least-traffic layout wants few openings, because each one is a conflict point, while the least-distance layout
              wants many, and the balanced layout is within {Math.round(r.quick.balanced.regret * 100)}% of the best on every goal.
            </p>
            {r.selection && (
              <p className="mt-4 max-w-[68ch] text-[16.5px] leading-relaxed">
                Then every candidate runs through the full simulation, with queues, signals and bus stops, at{" "}
                {r.selection.hours.map((h) => hourLabel(h)).join(", ")}. There the balanced layout comes out within{" "}
                {Math.max(0.1, Math.round(r.selection.regret * 1000) / 10)}% of the best on all four goals, and it cuts wrong-side trips the most. It is the
                one recommended.
              </p>
            )}
            <div className="mt-10">
              <LayoutDiagram
                length={data.length}
                places={PLACES}
                layouts={[
                  ...Object.entries(r.quick.goals).map(([g, v]) => ({ label: GOAL_LABELS[g], openings: v.openings, note: `${v.openings.length} openings` })),
                  { label: "Balanced: recommended", openings: r.quick.balanced.openings, note: `${r.quick.balanced.openings.length} openings`, highlight: true },
                ]}
              />
            </div>
            {r.selection && (
              <div className="mt-10 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[15px]">
                  <caption className="mb-3 text-left text-[13.5px] text-ink-2">
                    Full simulation with the whole package, per trip, against today, summed over {r.selection.hours.map((h) => hourLabel(h)).join(", ")}.
                  </caption>
                  <thead>
                    <tr className="text-[13px] text-ink-2">
                      <th className="pb-2 font-medium">U-turn layout</th>
                      <th className="pb-2 text-right font-medium">Crawling time</th>
                      <th className="pb-2 text-right font-medium">Travel time</th>
                      <th className="pb-2 text-right font-medium">Distance</th>
                      <th className="pb-2 text-right font-medium">Fuel</th>
                      <th className="pb-2 text-right font-medium">Wrong-side trips</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(r.selection.candidates).map(([name, c]) => {
                      const t = r.selection!.today;
                      const picked = name === r.selection!.pick;
                      return (
                        <tr key={name} className={picked ? "font-semibold" : ""}>
                          <th scope="row" className="py-2 pr-4 font-[inherit]">
                            {name.replace("(quick model)", "").replace("Quick-model balanced", "Balanced (recommended)").replace("congestion", "least traffic").replace("distance", "least distance").replace("time", "least time").replace("fuel", "least fuel")}
                            <span className="ml-2 font-normal text-ink-2">{c.openings.length} openings</span>
                          </th>
                          <td className="py-2 text-right num">{pct(c.score.slow, t.slow)}</td>
                          <td className="py-2 text-right num">{pct(c.score.vehH, t.vehH)}</td>
                          <td className="py-2 text-right num">{pct(c.score.vehKm, t.vehKm)}</td>
                          <td className="py-2 text-right num">{pct(c.score.fuel, t.fuel)}</td>
                          <td className="py-2 text-right num">
                            {Math.round(c.score.wrong)} <span className="font-normal text-ink-2">vs {Math.round(t.wrong)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[15px]">
                <caption className="mb-3 text-left text-[13.5px] text-ink-2">
                  U-turn detours a day in the quick model, against today&apos;s openings. The full simulation above includes every other effect.
                </caption>
                <thead>
                  <tr className="text-[13px] text-ink-2">
                    <th className="pb-2 font-medium">Layout</th>
                    <th className="pb-2 text-right font-medium">Stuck time</th>
                    <th className="pb-2 text-right font-medium">Detour time</th>
                    <th className="pb-2 text-right font-medium">Detour distance</th>
                    <th className="pb-2 text-right font-medium">Fuel</th>
                    <th className="pb-2 text-right font-medium">Wrong-side trips</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Today", r.quick.today.breakdown],
                    ...Object.entries(r.quick.goals).map(([g, v]) => [GOAL_LABELS[g], v.breakdown] as const),
                    ["Balanced", r.quick.balanced.breakdown],
                  ].map(([label, b]) => {
                    const t = r.quick.today.breakdown;
                    const bb = b as Breakdown;
                    const cell = (v: number, base: number, unit: string) => (label === "Today" ? `${Math.round(v).toLocaleString("en-IN")} ${unit}` : pct(v, base));
                    return (
                      <tr key={label as string} className={label === "Balanced" ? "font-semibold" : ""}>
                        <th scope="row" className="py-2 font-[inherit]">
                          {label as string}
                        </th>
                        <td className="py-2 text-right num">{cell(bb.stuckHours, t.stuckHours, "veh-h")}</td>
                        <td className="py-2 text-right num">{cell(bb.vehHours, t.vehHours, "veh-h")}</td>
                        <td className="py-2 text-right num">{cell(bb.vehKm, t.vehKm, "veh-km")}</td>
                        <td className="py-2 text-right num">{cell(bb.litres, t.litres, "L")}</td>
                        <td className="py-2 text-right num">{Math.round(bb.wrongSide)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6">
        <h2 className="text-[30px] font-semibold tracking-[-0.02em]">Where the time goes today</h2>
        <p className="mt-4 max-w-[66ch] text-[16.5px] leading-relaxed">
          TomTom&apos;s typical weekday, split into stretches of about 300 m. Towards Tolichowki, the worst stretch is the approach to the Rethibowli junction
          at noon and in the evening. Towards Mehdipatnam, the evening queue sits on the 800 m into Nanal Nagar, and the last 150 m into Mehdipatnam junction is
          slow all day.
        </p>
        <div className="mt-10 grid gap-12">
          <StretchGrid stretches={data.stretches.west} title="Towards Tolichowki (westbound)" />
          <StretchGrid stretches={data.stretches.east} title="Towards Mehdipatnam (eastbound)" />
        </div>
      </section>

      <section className="bg-paper-2">
        <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6">
          <h2 className="text-[30px] font-semibold tracking-[-0.02em]">How sure we are</h2>
          <p className="mt-4 max-w-[66ch] text-[16.5px] leading-relaxed">
            For each hour, the traffic fed into the &quot;today&quot; run was tuned until its end-to-end travel time matched TomTom&apos;s typical time for that
            hour, in each direction. Where TomTom shows free flow, the highest traffic that still flows freely was used.
          </p>
          <div className="mt-10 grid gap-12 lg:grid-cols-2">
            <CalibrationChart rows={calRows(0)} title="Towards Tolichowki" />
            <CalibrationChart rows={calRows(1)} title="Towards Mehdipatnam" />
          </div>
          <h3 className="mt-16 text-[22px] font-semibold tracking-[-0.015em]">Before this goes to GHMC and the Traffic Police</h3>
          <ul className="mt-5 max-w-[68ch] space-y-3 text-[16.5px] leading-relaxed">
            <li>Check every median opening against street imagery and a site walk; OpenStreetMap is the only source for today&apos;s layout.</li>
            <li>Video-count U-turns at each opening and side road for two weekday peaks. The share of side-road traffic that needs to turn back is set at {Math.round((r?.reverseShare ?? 0.18) * 100)}% until then.</li>
            <li>Count turning flows at Nanal Nagar and Rethibowli, so the signals can be retimed and simulated.</li>
            <li>Mark blocked zones on site: metro pillars, shrines, transformers, drains.</li>
          </ul>
          <p className="mt-8 text-[15px]">
            <Link href="/method" className="font-medium text-sign underline">
              Method, data and every assumption
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function gaps(openings: number[], length: number) {
  const pts = [0, ...[...openings].sort((a, b) => a - b), length];
  return pts.slice(1).map((p, i) => p - pts[i]);
}
