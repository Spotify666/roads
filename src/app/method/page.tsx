import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_ASSUMPTIONS } from "@/sim/engine";
import { COSTS } from "@/sim/pilot";
import sources from "../../../data/sources.json";

export const metadata: Metadata = {
  title: "Method and data",
  description: "How RoadFix Hyderabad measures congestion, finds the bottleneck behind it, and tests low-cost fixes. Data sources, assumptions and limits.",
};

const A = DEFAULT_ASSUMPTIONS;
const typeName: Record<string, string> = { "2w": "Two-wheelers", car: "Cars", auto: "Autos", bus: "Buses", lcv: "Goods vehicles" };

export default function MethodPage() {
  const src = Object.entries(sources as Record<string, { title: string; publisher: string; date: string; url: string }>).sort((a, b) => b[1].date.localeCompare(a[1].date));
  return (
    <main className="mx-auto max-w-[860px] px-4 py-14 sm:px-6">
      <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.025em] sm:text-[42px]">Method and data</h1>
      <p className="mt-4 text-[18px] leading-relaxed text-ink-2">
        What is measured, what is reported, what is estimated, and where each number comes from.
      </p>

      <h2 className="mt-14 text-[24px] font-semibold tracking-[-0.015em]">1. Where Hyderabad jams</h2>
      <div className="mt-4 space-y-4 text-[17px] leading-relaxed">
        <p>
          The 41 spots come from Hyderabad Traffic Police alerts, the Cyberabad and Malkajgiri civic-body reviews of 2026, and news reports, each cited on its
          page. Each spot is snapped onto the nearest main road in OpenStreetMap, preferring the road under a flyover, where U-turns and junction problems sit.
        </p>
        <p>
          <strong className="font-semibold">Live:</strong> a Supabase function asks TomTom&apos;s Traffic Flow service for the current and free-flow speed at each
          spot every 30 minutes (hourly overnight), and reads TomTom&apos;s city-wide incident list. The map&apos;s live layer is TomTom&apos;s own traffic tiles.
        </p>
        <p>
          <strong className="font-semibold">Typical:</strong> for each spot, RoadFix asks TomTom&apos;s routing service for the historical travel time along a
          corridor about 1.6 km long through the spot, departing at 17 hours of a typical weekday. The corridor is split by waypoints into stretches of about
          300 m, so the profile shows where the queue sits at each hour, not just that it exists. Corridors that detour are rejected. A Sunday profile is built
          the same way.
        </p>
        <p>
          <strong className="font-semibold">Measured by RoadFix:</strong> the 30-minute readings build each spot&apos;s own hour-by-hour pattern, which will
          replace the typical profile once a few weeks have accumulated.
        </p>
      </div>

      <h2 className="mt-14 text-[24px] font-semibold tracking-[-0.015em]">2. Why it jams</h2>
      <p className="mt-4 text-[17px] leading-relaxed">
        Causes are taken only from published reports, cited with their date, plus what OpenStreetMap shows within 250 m: bus stops at the junction mouth,
        clusters of signals, lane counts that change, flyovers and crossings. Where no report names a cause, the page says so.
      </p>

      <h2 className="mt-14 text-[24px] font-semibold tracking-[-0.015em]">3. The fix, and how it is tested</h2>
      <div className="mt-4 space-y-4 text-[17px] leading-relaxed">
        <p>
          Every spot gets one low-cost fix from the plan&apos;s list: U-turns and waiting pockets, bus bays, signal timing, parking, free left turns, lanes and
          markings, pedestrian crossings. Costs are planning estimates in ₹ lakh, not quotes.
        </p>
        <p>
          The Mehdipatnam–Tolichowki pilot is simulated in full. The road layout (carriageways, lane counts, the lane drop at Nanal Nagar, 54 side roads, 7 bus
          stops, 5 median openings, 2 signals) comes from OpenStreetMap. Vehicles follow the Intelligent Driver Model, change lanes when blocked, stop at bus
          stops, queue at signals, and can only reverse at a median opening. Riders who face a long detour may ride wrong-side instead.
        </p>
        <p>
          For each hour, the traffic is tuned until the simulated &quot;today&quot; matches TomTom&apos;s typical end-to-end time in each direction. The RoadFix
          layout is then run with exactly the same traffic and random seeds. U-turn openings are placed by an exact dynamic programme over every buildable site,
          once per goal, and the balanced layout is the one closest to the best on all four goals while cutting wrong-side riding.{" "}
          <Link href="/pilot" className="font-medium text-sign underline">
            See the pilot
          </Link>
        </p>
      </div>

      <h2 className="mt-14 text-[24px] font-semibold tracking-[-0.015em]">Assumptions</h2>
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
        <dd>₹104 a litre and ₹150 per vehicle-hour by default, editable on the pilot page</dd>
        <dt className="text-ink-2">Costs</dt>
        <dd className="num">
          New opening with pocket ₹{COSTS.newOpeningWithPocket} lakh, pocket on an existing opening ₹{COSTS.pocketOnExisting} lakh, closing ₹{COSTS.closeOpening}{" "}
          lakh, bus bay ₹{COSTS.busBay} lakh, auto bays ₹{COSTS.autoBays} lakh, kerb clearance ₹{COSTS.kerbClearance} lakh
        </dd>
      </dl>

      <h2 className="mt-14 text-[24px] font-semibold tracking-[-0.015em]">Limits</h2>
      <ul className="mt-4 space-y-3 text-[17px] leading-relaxed">
        <li>TomTom gives speeds and travel times, not vehicle counts. Volumes in the simulation are inferred by calibration, not counted.</li>
        <li>Today&apos;s median openings come from OpenStreetMap and must be checked on site.</li>
        <li>Only the pilot corridor is simulated. Effects on neighbouring roads are not modelled yet; the plan&apos;s city-wide check comes later.</li>
        <li>Accident risk is reported as wrong-side trips, not as a crash forecast.</li>
      </ul>

      <h2 className="mt-14 text-[24px] font-semibold tracking-[-0.015em]">Sources</h2>
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
          <span className="font-medium">TomTom Traffic Flow, Incidents and Routing APIs</span>{" "}
          <span className="text-ink-2">· live speeds, incidents and historical travel times</span>
        </li>
      </ul>
    </main>
  );
}
