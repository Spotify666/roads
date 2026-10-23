import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_ASSUMPTIONS } from "@/sim/engine";
import { COSTS } from "@/sim/pilot";
import { CHECKPOINT, LAB_RUN } from "@/sim/scenario";
import { LayoutDiagram } from "@/components/sim/LayoutDiagram";
import { FLOW_COLORS, FLOW_LABELS, hourLabel } from "@/lib/flow";
import sources from "../../../data/sources.json";
import pilotData from "@/data/pilot.json";

export const metadata: Metadata = {
  title: "Info: method and data",
  description: "How RoadFix Hyderabad measures congestion, finds the bottleneck behind it, tests fixes in the Simulation Lab, and where every number comes from.",
};

const A = DEFAULT_ASSUMPTIONS;
const typeName: Record<string, string> = { "2w": "Two-wheelers", car: "Cars", auto: "Autos", bus: "Buses", lcv: "Goods vehicles" };

type Row = { vehHours: number; slowHours: number; trips: number; thrE: number };
type Score = { slow: number; vehH: number; vehKm: number; fuel: number; wrong: number };
type Breakdown = { vehKm: number; vehHours: number; stuckHours: number; litres: number; wrongSide: number };
interface PilotData {
  length: number;
  results: {
    quick: {
      today: { openings: number[]; breakdown: Breakdown };
      goals: Record<string, { openings: number[]; breakdown: Breakdown }>;
      balanced: { openings: number[]; regret: number; breakdown: Breakdown };
    };
    layout: { openings: number[]; busBays: number[] };
    hours: Record<string, { today: Row; fix: Row }>;
    attribution: { hour: number; today: Row; parts: Record<string, Row> };
    reverseShare: number;
    selection?: { hours: number[]; today: Score; candidates: Record<string, { openings: number[]; score: Score }>; pick: string; regret: number };
  };
  sumo?: { hours: { hour: number; tomtom: number[]; roadfix: number[]; sumo: number[] }[] } | null;
}
const pilot = pilotData as unknown as PilotData;
const r = pilot.results;

const PLACES = [
  { s: 0, name: "Mehdipatnam" },
  { s: 986, name: "Rethibowli" },
  { s: 1371, name: "Nanal Nagar" },
  { s: 2696, name: "Tolichowki" },
];
const GOAL_LABELS: Record<string, string> = { congestion: "Least traffic", time: "Least travel time", distance: "Least travel distance", fuel: "Least fuel" };
const pct = (a: number, b: number) => {
  const c = ((a - b) / b) * 100;
  const v = Math.abs(c) < 1 ? Math.abs(c).toFixed(1) : Math.abs(Math.round(c)).toString();
  return `${c > 0 ? "+" : "−"}${v}%`;
};
const fewerMore = (saved: number) => (Math.abs(saved) < 0.5 ? "no change" : `${Math.abs(Math.round(saved))} veh-h ${saved > 0 ? "fewer" : "more"}`);
const gaps = (openings: number[], length: number) => {
  const pts = [0, ...[...openings].sort((a, b) => a - b), length];
  return pts.slice(1).map((p, i) => p - pts[i]);
};

const SECTIONS = [
  ["colours", "Reading the map"],
  ["data", "Data"],
  ["pilot", "The pilot"],
  ["lab", "Simulation Lab"],
  ["assumptions", "Assumptions"],
  ["street-logic", "Street Logic"],
  ["sources", "Sources"],
] as const;

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="mt-16 scroll-mt-28 text-[26px] font-semibold tracking-[-0.02em]">
    {children}
  </h2>
);
const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="mt-10 text-[19px] font-semibold tracking-[-0.01em]">{children}</h3>;
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-[17px] leading-relaxed">{children}</p>;

export default function InfoPage() {
  const src = Object.entries(sources as Record<string, { title: string; publisher: string; date: string; url: string }>).sort((a, b) => b[1].date.localeCompare(a[1].date));
  return (
    <main className="mx-auto max-w-[860px] px-4 pt-10 pb-20 sm:px-6">
      <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.025em] sm:text-[42px]">How RoadFix works</h1>
      <p className="mt-3 text-[18px] leading-relaxed text-ink-2">What is measured, what is reported, what is estimated, and where each number comes from.</p>

      <nav aria-label="On this page" className="sticky top-[calc(env(safe-area-inset-top)+8px)] z-10 -mx-4 mt-6 overflow-x-auto bg-paper/95 px-4 py-2 backdrop-blur-sm [scrollbar-width:none] sm:top-[64px]">
        <ul className="flex w-max gap-1.5 text-[13.5px] font-medium">
          {SECTIONS.map(([id, l]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-full bg-paper-2 px-3.5 py-1.5 no-underline transition-colors duration-150 hover:bg-paper-3">
                {l}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <H2 id="colours">Reading the map</H2>
      <P>Every colour is a ratio: how long a stretch takes now, or typically at that hour, divided by how long it takes on an empty road.</P>
      <dl className="mt-6 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 text-[15.5px]">
        {FLOW_LABELS.map((l, i) => (
          <div key={l} className="contents">
            <dt className="size-3.5 rounded-sm" style={{ background: FLOW_COLORS[i] }} />
            <dd className="font-medium">{l}</dd>
            <dd className="text-ink-2 num">{["under 1.15×", "1.15–1.5×", "1.5–2×", "2–3×", "3× or more"][i]}</dd>
          </div>
        ))}
      </dl>
      <P>
        Spots that are jammed (2× or more) pulse on the map. Tap a spot for its card: the slowdown now or at the chosen hour, its weekday peak, a 24-hour strip
        (each cell an hour, the dot marking the worst one), the reported causes and the fix. The bottom sheet lists every spot, worst first; drag it up for the
        full list. In Typical mode, the strip in the sheet picks the hour.
      </P>
      <P>
        Speeds and travel times are measured by TomTom, and RoadFix records them every 30 minutes. Causes come from traffic police alerts, civic-body reviews
        and news reports, each cited, plus what OpenStreetMap shows at the spot. Fix costs and savings are planning estimates until a field survey confirms
        them.
      </P>

      <H2 id="data">Where the data comes from</H2>
      <H3>1. Where Hyderabad jams</H3>
      <P>
        The 41 spots come from Hyderabad Traffic Police alerts, the Cyberabad and Malkajgiri civic-body reviews of 2026, and news reports, each cited on its
        page. Each spot is snapped onto the nearest main road in OpenStreetMap, preferring the road under a flyover, where U-turns and junction problems sit.
      </P>
      <P>
        <strong className="font-semibold">Live:</strong> a Supabase function asks TomTom&apos;s Traffic Flow service for the current and free-flow speed at each
        spot every 30 minutes (hourly overnight), and reads TomTom&apos;s city-wide incident list. The map&apos;s live layer is TomTom&apos;s own traffic tiles.
      </P>
      <P>
        <strong className="font-semibold">Typical:</strong> for each spot, RoadFix asks TomTom&apos;s routing service for the historical travel time along a
        corridor about 1.6 km long through the spot, departing at 17 hours of a typical weekday. The corridor is split by waypoints into stretches of about 300
        m, so the profile shows where the queue sits at each hour, not just that it exists. Corridors that detour are rejected. Weekend profiles come next;
        until then, weekend patterns come only from RoadFix&apos;s own readings.
      </P>
      <P>
        <strong className="font-semibold">Measured by RoadFix:</strong> the 30-minute readings build each spot&apos;s own hour-by-hour pattern, which will
        replace the typical profile once a few weeks have accumulated.
      </P>
      <H3>2. Why it jams</H3>
      <P>
        Causes are taken only from published reports, cited with their date, plus what OpenStreetMap shows within 250 m: bus stops at the junction mouth,
        clusters of signals, lane counts that change, flyovers and crossings. Where no report names a cause, the page says so.
      </P>
      <H3>3. The fix</H3>
      <P>
        Every spot gets one low-cost fix from the plan&apos;s list: U-turns and waiting pockets, bus bays, signal timing, parking, free left turns, lanes and
        markings, pedestrian crossings. Costs are planning estimates in ₹ lakh, not quotes.
      </P>

      <H2 id="pilot">The Mehdipatnam–Tolichowki pilot</H2>
      <P>
        2.7 km of Golconda Road and the Old Bombay Highway, carrying 80,000 to 1,00,000 vehicles a day, is simulated in full. The road layout (carriageways,
        lane counts, the lane drop at Nanal Nagar, 54 side roads, 7 bus stops, 5 median openings, 2 signals) comes from OpenStreetMap. Vehicles follow the
        Intelligent Driver Model, change lanes when blocked, stop at bus stops, queue at signals, and can only reverse at a median opening. Riders who face a
        long detour may ride wrong-side instead.
      </P>
      <P>
        For each hour, the traffic is tuned until the simulated &quot;today&quot; matches TomTom&apos;s typical end-to-end time in each direction. Where TomTom
        shows free flow, the highest traffic that still flows freely is used. The RoadFix layout is then run with exactly the same traffic and random seeds.
      </P>

      <H3>What the RoadFix plan changes</H3>
      <ul className="mt-4 space-y-4 text-[17px] leading-relaxed">
        <li>
          <strong className="font-semibold">U-turn openings re-spaced, each with a waiting pocket.</strong> Today&apos;s five openings, as mapped in OpenStreetMap,
          sit at {r.quick.today.openings.join(", ")} m from Mehdipatnam, leaving a {Math.max(...gaps(r.quick.today.openings, pilot.length))} m gap that pushes riders
          to go wrong-side. The recommended five sit at {r.layout.openings.join(", ")} m, so no rider is more than {Math.max(...gaps(r.layout.openings, pilot.length))} m
          from the next one.
        </li>
        <li>
          <strong className="font-semibold">Bus bays at the Mehdipatnam and Tolichowki stops</strong> ({r.layout.busBays.length} stops), so buses stop out of the
          running lane.
        </li>
        <li>
          <strong className="font-semibold">Marked shared-auto bays</strong> at the same stops, off the carriageway.
        </li>
        <li>
          <strong className="font-semibold">A no-stopping zone and off-road vending area</strong> on the last 300 m into Tolichowki.
        </li>
        <li className="text-ink-2">
          Not counted in the plan: retiming the Nanal Nagar and Rethibowli signals. They also serve side streets that are not simulated, so any gain claimed
          would be a guess. The Lab lets you try it anyway, flagged.
        </li>
      </ul>
      <div className="mt-8">
        <LayoutDiagram
          length={pilot.length}
          places={PLACES}
          layouts={[
            { label: "Today", openings: r.quick.today.openings, note: "as mapped, to be checked on site" },
            { label: "With RoadFix", openings: r.layout.openings, note: "each with a waiting pocket", highlight: true },
          ]}
        />
        <p className="mt-2 text-[13.5px] text-ink-2">Openings are blocked within 30 m of bus stops, at junction mouths, at the lane drop and on the flyover ramps.</p>
      </div>

      <H3>What the plan does not fix</H3>
      <P>
        The evening queue towards Mehdipatnam builds at the Nanal Nagar signal, where two lanes from Tolichowki meet a red light. U-turn spacing and bus bays
        barely touch it: at {hourLabel(16)} the end-to-end trip towards Mehdipatnam is {Math.round(r.hours["16"].today.thrE)} s today and{" "}
        {Math.round(r.hours["16"].fix.thrE)} s with the package. That queue needs the signal retimed or the junction widened, and the first step is a turning
        count at Nanal Nagar. Both can be tried in the Lab.
      </P>

      <H3>Which change does what, at {hourLabel(r.attribution.hour)}</H3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[15.5px]">
          <thead>
            <tr className="text-[13px] text-ink-2">
              <th className="pb-2 font-medium">Change on its own</th>
              <th className="pb-2 text-right font-medium">Time on the corridor</th>
              <th className="pb-2 text-right font-medium">Time crawling</th>
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
                  <td className="py-2.5 text-right num">{fewerMore(t.vehHours - p.vehHours * s)}</td>
                  <td className="py-2.5 text-right num">{fewerMore(t.slowHours - p.slowHours * s)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <H3>How the U-turn layout was chosen</H3>
      <P>
        First, a quick model finds the best layout for each goal exactly, with a dynamic programme over every buildable site at 50 m spacing. In that model the
        goals pull apart: the least-traffic layout wants few openings, because each one is a conflict point, while the least-distance layout wants many, and
        the balanced layout is within {Math.round(r.quick.balanced.regret * 100)}% of the best on every goal.
      </P>
      {r.selection && (
        <P>
          Then every candidate runs through the full simulation, with queues, signals and bus stops, at {r.selection.hours.map((h) => hourLabel(h)).join(", ")}.
          There the balanced layout comes out within {Math.max(0.1, Math.round(r.selection.regret * 1000) / 10)}% of the best on all four goals, and it cuts
          wrong-side trips the most. It is the one recommended.
        </P>
      )}
      <div className="mt-8">
        <LayoutDiagram
          length={pilot.length}
          places={PLACES}
          layouts={[
            ...Object.entries(r.quick.goals).map(([g, v]) => ({ label: GOAL_LABELS[g], openings: v.openings, note: `${v.openings.length} openings` })),
            { label: "Balanced: recommended", openings: r.quick.balanced.openings, note: `${r.quick.balanced.openings.length} openings`, highlight: true },
          ]}
        />
      </div>
      {r.selection && (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[15px]">
            <caption className="mb-3 text-left text-[13.5px] text-ink-2">
              Full simulation with the whole package, per trip, against today, summed over {r.selection.hours.map((h) => hourLabel(h)).join(", ")}.
            </caption>
            <thead>
              <tr className="text-[13px] text-ink-2">
                <th className="pb-2 font-medium">U-turn layout</th>
                <th className="pb-2 text-right font-medium">Crawling</th>
                <th className="pb-2 text-right font-medium">Travel time</th>
                <th className="pb-2 text-right font-medium">Distance</th>
                <th className="pb-2 text-right font-medium">Fuel</th>
                <th className="pb-2 text-right font-medium">Wrong-side</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(r.selection.candidates).map(([name, c]) => {
                const t = r.selection!.today;
                const picked = name === r.selection!.pick;
                return (
                  <tr key={name} className={picked ? "font-semibold" : ""}>
                    <th scope="row" className="py-2 pr-4 font-[inherit]">
                      {name
                        .replace("(quick model)", "")
                        .replace("Quick-model balanced", "Balanced (recommended)")
                        .replace("congestion", "least traffic")
                        .replace("distance", "least distance")
                        .replace("time", "least time")
                        .replace("fuel", "least fuel")}
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

      {pilot.sumo && pilot.sumo.hours.length > 0 && (
        <>
          <H3>Checked in SUMO</H3>
          <P>
            The same corridor and traffic were run in SUMO, the open-source simulator used by transport researchers, with two-wheelers free to filter between
            lanes, as an independent check of the layout and demand.
          </P>
        </>
      )}

      <H3>Before this goes to GHMC and the Traffic Police</H3>
      <ul className="mt-4 space-y-3 text-[17px] leading-relaxed">
        <li>Check every median opening against street imagery and a site walk; OpenStreetMap is the only source for today&apos;s layout.</li>
        <li>
          Video-count U-turns at each opening and side road for two weekday peaks. The share of side-road traffic that needs to turn back is set at{" "}
          {Math.round(r.reverseShare * 100)}% until then.
        </li>
        <li>Count turning flows at Nanal Nagar and Rethibowli, so the signals can be retimed and simulated with their side streets.</li>
        <li>Mark blocked zones on site: metro pillars, shrines, transformers, drains.</li>
      </ul>

      <H2 id="lab">How the Simulation Lab tests a design</H2>
      <P>
        Every test runs your design and today&apos;s layout through the same simulation with the same traffic and the same random seed, in your browser. Each
        run warms up for {LAB_RUN.warmup / 60} minutes so the road fills, then measures {LAB_RUN.measure / 60} minutes of traffic, the same length used to match
        TomTom, with results refreshed every {CHECKPOINT / 60} simulated minutes. Today&apos;s runs are computed in advance for every hour; with more or less
        traffic than today, both are run.
      </P>
      <P>
        One run of one hour has noise: a change of less than 3% either way is shown as &quot;same&quot;. Trip times are end-to-end along the whole corridor;
        crawling, fuel and distance are per trip and include U-turn detours. &quot;Throughput&quot; counts trips completed an hour; &quot;still queued&quot;
        counts vehicles on the road or waiting to enter at the end, which is how a design that chokes the road shows up even when the few trips that finish are
        quick.
      </P>
      <H3>What each change models</H3>
      <dl className="mt-4 grid gap-x-8 gap-y-4 text-[16px] leading-relaxed sm:grid-cols-[200px_1fr]">
        <dt className="font-semibold">U-turns and pockets</dt>
        <dd>
          Openings anywhere outside junction mouths, the lane drop, the flyover ramps and 30 m around bus stops. A pocket holds five vehicles out of the fast
          lane while they wait for a gap; without one they wait in the lane. Gaps longer than {A.wrongSideThreshold} m push two-wheelers and autos to ride
          wrong-side, rising to {Math.round(A.wrongSideMax * 100)}% of them.
        </dd>
        <dt className="font-semibold">One-way</dt>
        <dd>
          Both carriageways run one way. Through traffic in the other direction, and side-road traffic that needs it, is counted as diverted: it goes to
          other roads, which are not simulated. Some two-wheelers and autos ride against the one-way.
        </dd>
        <dt className="font-semibold">Bus + auto lane</dt>
        <dd>The kerb lane is kept for buses and autos; other vehicles use it only to stop or to turn off.</dd>
        <dt className="font-semibold">No lane drop</dt>
        <dd>Three lanes each way all the way to Tolichowki. That means widening past Nanal Nagar, which needs land, so it is not costed.</dd>
        <dt className="font-semibold">Bus and auto bays</dt>
        <dd>Buses at the Mehdipatnam and Tolichowki stops, and stopping autos, pull out of the running lane.</dd>
        <dt className="font-semibold">Clear kerb</dt>
        <dd>Removes the parking and vending that slow the kerb lane on the last 300 m into Tolichowki.</dd>
        <dt className="font-semibold">Stop wrong-side</dt>
        <dd>Railings and cameras cut wrong-side riding to a fifth of what the detours would otherwise cause.</dd>
        <dt className="font-semibold">Signal green</dt>
        <dd>The main road&apos;s share of each cycle at Nanal Nagar and Rethibowli. More green for the main road means longer waits on side streets, which are not simulated, so these results are flagged.</dd>
        <dt className="font-semibold">Traffic</dt>
        <dd>Scales every flow, through and side-road, to test growth or a fall in demand.</dd>
      </dl>
      <P>
        Costs for new changes are planning estimates: bus lane ₹{COSTS.busLane} lakh, one-way signs and barricades ₹{COSTS.oneWay} lakh, wrong-side railings and
        cameras ₹{COSTS.enforcement} lakh, signal study and retiming ₹{COSTS.signalRetime} lakh per signal.
      </P>

      <H2 id="assumptions">Assumptions</H2>
      <p className="mt-3 text-[15px] text-ink-2">Every one of these is editable in the model and listed here so it can be challenged.</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[15.5px]">
          <thead>
            <tr className="text-[13px] text-ink-2">
              <th className="pb-2 font-medium">Vehicle</th>
              <th className="pb-2 text-right font-medium">Share of traffic</th>
              <th className="pb-2 text-right font-medium">Fuel, litres per km</th>
              <th className="pb-2 text-right font-medium">Idling, litres per hour</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(A.mix).map((k) => (
              <tr key={k}>
                <th scope="row" className="py-2 font-normal">
                  {typeName[k]}
                </th>
                <td className="py-2 text-right num">{Math.round(A.mix[k as keyof typeof A.mix] * 1000) / 10}%</td>
                <td className="py-2 text-right num">{A.fuelPerKm[k as keyof typeof A.fuelPerKm]}</td>
                <td className="py-2 text-right num">{A.idleLitresPerHour[k as keyof typeof A.idleLitresPerHour]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-3 text-[15.5px] sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-2">Wrong-side riding</dt>
        <dd>Starts once a U-turn detour passes {A.wrongSideThreshold} m, rising to {Math.round(A.wrongSideMax * 100)}% of two-wheelers and autos</dd>
        <dt className="text-ink-2">Bus dwell</dt>
        <dd className="num">
          {A.busDwell[0]}–{A.busDwell[1]} s; shared autos {A.autoDwell[0]}–{A.autoDwell[1]} s, {Math.round(A.autoStopShare * 100)}% of autos stop
        </dd>
        <dt className="text-ink-2">Free speed</dt>
        <dd className="num">{A.freeSpeed} km/h for cars, varied per driver</dd>
        <dt className="text-ink-2">Side-road traffic turning back</dt>
        <dd>18% of vehicles joining from side roads, until U-turn counts replace it</dd>
        <dt className="text-ink-2">Fuel price and value of time</dt>
        <dd>₹104 a litre and ₹150 per vehicle-hour by default, editable on the Lab page</dd>
        <dt className="text-ink-2">Costs</dt>
        <dd className="num">
          New opening with pocket ₹{COSTS.newOpeningWithPocket} lakh, pocket on an existing opening ₹{COSTS.pocketOnExisting} lakh, closing ₹{COSTS.closeOpening}{" "}
          lakh, bus bay ₹{COSTS.busBay} lakh, auto bays ₹{COSTS.autoBays} lakh, kerb clearance ₹{COSTS.kerbClearance} lakh
        </dd>
      </dl>

      <H3>Limits</H3>
      <ul className="mt-4 space-y-3 text-[17px] leading-relaxed">
        <li>TomTom gives speeds and travel times, not vehicle counts. Volumes in the simulation are inferred by calibration, not counted.</li>
        <li>Today&apos;s median openings come from OpenStreetMap and must be checked on site.</li>
        <li>Only the pilot corridor is simulated. Effects on neighbouring roads are not modelled yet; the plan&apos;s city-wide check comes later.</li>
        <li>Accident risk is reported as wrong-side trips, not as a crash forecast.</li>
      </ul>

      <H2 id="street-logic">Ideas shared with Street Logic</H2>
      <P>
        Street Logic, the Instagram page of Gurgaon urban-planning enthusiast Prince Kushwah, argues for the same kind of fixes, as described in{" "}
        <a href="https://swarajyamag.com/infrastructure/why-indias-chaotic-streets-fail-us-and-the-teen-trying-to-fix-them" target="_blank" rel="noopener noreferrer" className="underline">
          Swarajya&apos;s profile of the page
        </a>
        . Where his principles apply in Hyderabad:
      </P>
      <ul className="mt-5 space-y-4 text-[17px] leading-relaxed">
        <li>
          <strong className="font-semibold">Keep the lane count steady through a junction.</strong> Roads that go from two lanes to three and back create
          bottlenecks. Here: the drop from three lanes to two at Nanal Nagar, where the pilot&apos;s evening queue builds (try &quot;No lane drop&quot; in the
          Lab), and the Raidurg funnel.
        </li>
        <li>
          <strong className="font-semibold">Separate who uses the road.</strong> Footpaths for walking, bays for buses, the rest for traffic. Here: the bus and
          auto bays at Mehdipatnam, Dilsukhnagar and KPHB, and footpath clearance at Tolichowki.
        </li>
        <li>
          <strong className="font-semibold">Pull entries and exits apart.</strong> Ramps and slip roads placed too close together cause weaving. Here: the NMDC
          entry to the PVNR Expressway, the Biodiversity flyover landings and the Shilpa Layout flyover approach to IKEA.
        </li>
        <li>
          <strong className="font-semibold">Count before you redesign.</strong> He redesigned Gurgaon&apos;s Rajiv Chowk after counting each approach on site,
          which is the same first step RoadFix asks for at every junction.
        </li>
        <li>
          <strong className="font-semibold">Widening is not the default answer.</strong> More road space attracts more traffic, which is why RoadFix favours
          bays, pockets, markings and timings over new lanes.
        </li>
      </ul>

      <H2 id="sources">Sources</H2>
      <ul className="mt-4 space-y-3 text-[15.5px] leading-relaxed">
        {src.map(([k, s]) => (
          <li key={k}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              {s.title}
            </a>
            <span className="text-ink-2">
              {" "}
              · {s.publisher}, {s.date}
            </span>
          </li>
        ))}
        <li>
          <span className="font-medium">OpenStreetMap</span> <span className="text-ink-2">· road network, bus stops, signals, median openings (ODbL)</span>
        </li>
        <li>
          <span className="font-medium">TomTom Traffic Flow, Incidents and Routing APIs</span> <span className="text-ink-2">· live speeds, incidents and historical travel times</span>
        </li>
      </ul>
      <p className="mt-12 text-[13.5px] leading-relaxed text-ink-2">
        Traffic data © TomTom. Map data © OpenStreetMap contributors (ODbL), basemap by OpenFreeMap. RoadFix Hyderabad is an independent project and not an
        official GHMC, HMDA or Traffic Police site.{" "}
        <Link href="/pilot" className="font-medium text-sign underline">
          Open the Simulation Lab
        </Link>
      </p>
    </main>
  );
}
