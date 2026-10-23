"use client";

import { useMemo, useState } from "react";
import { hourLabel } from "@/lib/flow";
import { cn } from "@/lib/utils";

type Row = { vehHours: number; vehKm: number; fuel: number; slowHours: number; wrongside: number; uturns: number; trips: number; thrW: number; thrE: number };

interface Props {
  hours: Record<string, { today: Row; fix: Row }>;
  daily: { today: Row; fix: Row };
  costLakh: number;
}

const METRICS: { key: keyof Row; goal: string; measure: string; unit: string; digits: number }[] = [
  { key: "slowHours", goal: "Least traffic", measure: "Vehicle-hours stuck or crawling under 10 km/h", unit: "veh-h", digits: 0 },
  { key: "vehHours", goal: "Least travel time", measure: "Vehicle-hours spent on the corridor", unit: "veh-h", digits: 0 },
  { key: "vehKm", goal: "Least travel distance", measure: "Vehicle-km driven, U-turn detours included", unit: "veh-km", digits: 0 },
  { key: "fuel", goal: "Least fuel", measure: "Litres burned, idling included", unit: "litres", digits: 0 },
  { key: "wrongside", goal: "Safety rule", measure: "Trips ridden on the wrong side", unit: "trips", digits: 0 },
];

const fmt = (v: number, d = 0) => v.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });

export function Results({ hours, daily, costLakh }: Props) {
  const hourKeys = useMemo(() => Object.keys(hours).map(Number).filter((h) => h >= 7).sort((a, b) => a - b), [hours]);
  const [scope, setScope] = useState<"day" | number>("day");
  const [fuelPrice, setFuelPrice] = useState(104);
  const [vot, setVot] = useState(150);

  const pair = scope === "day" ? daily : hours[String(scope)];
  // compare for the same number of trips: the fixed road also lets a few more vehicles through
  const scale = pair.today.trips / Math.max(1, pair.fix.trips);
  const fixVal = (k: keyof Row) => (k === "trips" ? pair.fix.trips : pair.fix[k] * scale);

  const dHours = daily.today.vehHours - daily.fix.vehHours * (daily.today.trips / daily.fix.trips);
  const dFuel = daily.today.fuel - daily.fix.fuel * (daily.today.trips / daily.fix.trips);
  const perDay = dHours * vot + dFuel * fuelPrice;
  const payback = perDay > 0 ? (costLakh * 1e5) / perDay : null;

  return (
    <div>
      <div className="flex flex-wrap gap-1 rounded-lg bg-paper-2 p-1 text-[13.5px]" role="radiogroup" aria-label="Period">
        {(["day", ...hourKeys] as const).map((k) => (
          <button
            key={String(k)}
            type="button"
            role="radio"
            aria-checked={scope === k}
            onClick={() => setScope(k)}
            className={cn("rounded-md px-2.5 py-1.5 font-medium num transition-colors duration-150", scope === k ? "bg-white text-ink shadow-[0_1px_3px_#0002]" : "text-ink-2 hover:text-ink")}
          >
            {k === "day" ? "Whole weekday" : hourLabel(k)}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[15px]">
          <thead>
            <tr className="text-[13px] text-ink-2">
              <th scope="col" className="pb-3 font-medium">
                Goal
              </th>
              <th scope="col" className="pb-3 font-medium">
                Measured as
              </th>
              <th scope="col" className="pb-3 text-right font-medium">
                Today
              </th>
              <th scope="col" className="pb-3 text-right font-medium">
                With RoadFix
              </th>
              <th scope="col" className="pb-3 text-right font-medium">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const t = pair.today[m.key];
              const f = fixVal(m.key);
              const ch = t ? (f - t) / t : 0;
              return (
                <tr key={m.key} className="align-baseline">
                  <th scope="row" className="py-3 pr-4 font-semibold whitespace-nowrap">
                    {m.goal}
                  </th>
                  <td className="py-3 pr-4 text-ink-2">{m.measure}</td>
                  <td className="py-3 text-right num">{fmt(t, m.digits)}</td>
                  <td className="py-3 text-right num">{fmt(f, m.digits)}</td>
                  <td className={cn("py-3 text-right font-semibold num", ch < -0.005 ? "text-[#1d7a4e]" : ch > 0.005 ? "text-[#b3242f]" : "text-ink-2")}>
                    {ch > 0 ? "+" : ch < 0 ? "−" : ""}
                    {fmt(Math.abs(ch) * 100, 0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-2">
        Same traffic in both runs, averaged over two random seeds. The fixed road also lets{" "}
        {fmt(Math.max(0, ((pair.fix.trips - pair.today.trips) / pair.today.trips) * 100), 1)}% more trips through, so its totals are scaled to the same number of
        trips as today. {scope === "day" ? "Hours not simulated are interpolated between their neighbours." : ""}
      </p>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1fr]">
        <div>
          <h3 className="text-[19px] font-semibold">What a weekday saves</h3>
          <p className="mt-3 text-[40px] leading-none font-semibold tracking-[-0.03em] num">₹{fmt(perDay / 1000, 0)}k</p>
          <p className="mt-2 text-[15px] text-ink-2 num">
            {fmt(dHours, 0)} vehicle-hours and {fmt(dFuel, 0)} litres a day, valued with the assumptions on the right.
          </p>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[15.5px]">
            <dt className="text-ink-2">Cost of the package</dt>
            <dd className="num">₹{fmt(costLakh, 1)} lakh (planning estimate)</dd>
            <dt className="text-ink-2">Pays back in</dt>
            <dd className="num">{payback ? `about ${fmt(payback, 0)} days` : "–"}</dd>
          </dl>
        </div>
        <div>
          <h3 className="text-[19px] font-semibold">Assumptions you can change</h3>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-[14px] text-ink-2">Fuel price, ₹ a litre (petrol and diesel mix)</span>
              <input
                type="number"
                min={50}
                max={200}
                value={fuelPrice}
                onChange={(e) => setFuelPrice(Number(e.target.value) || 0)}
                className="h-11 w-40 rounded-md bg-white px-3 text-[16px] num shadow-[inset_0_0_0_1px_#0002] focus-visible:shadow-[inset_0_0_0_2px_#2d6cdf]"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[14px] text-ink-2">Value of time, ₹ per vehicle-hour (all vehicle types, occupants included)</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={vot}
                onChange={(e) => setVot(Number(e.target.value) || 0)}
                className="h-11 w-40 rounded-md bg-white px-3 text-[16px] num shadow-[inset_0_0_0_1px_#0002] focus-visible:shadow-[inset_0_0_0_2px_#2d6cdf]"
              />
            </label>
            <p className="max-w-[56ch] text-[13.5px] leading-relaxed text-ink-2">
              The vehicle mix (55% two-wheelers, 25% cars, 12% autos, 2.5% buses, 5.5% goods), fuel use per km and the 18% of side-road traffic that needs to
              turn back are set out on the method page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
