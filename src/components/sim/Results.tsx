"use client";

import { useMemo, useState, type ComponentType } from "react";
import { motion } from "motion/react";
import { hourLabel } from "@/lib/flow";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/Reveal";
import { ClockIcon, CrawlIcon, FuelIcon, RouteIcon, WrongIcon } from "@/components/lab/icons";

type Row = { vehHours: number; vehKm: number; fuel: number; slowHours: number; wrongside: number; uturns: number; trips: number; thrW: number; thrE: number };

interface Props {
  hours: Record<string, { today: Row; fix: Row }>;
  daily: { today: Row; fix: Row };
  costLakh: number;
}

const METRICS: { key: keyof Row; label: string; unit: string; icon: ComponentType<{ size?: number }> }[] = [
  { key: "slowHours", label: "Crawling", unit: "veh-h", icon: CrawlIcon },
  { key: "vehHours", label: "Travel time", unit: "veh-h", icon: ClockIcon },
  { key: "vehKm", label: "Distance", unit: "veh-km", icon: RouteIcon },
  { key: "fuel", label: "Fuel", unit: "litres", icon: FuelIcon },
  { key: "wrongside", label: "Wrong-side", unit: "trips", icon: WrongIcon },
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
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-full bg-paper-2 p-1 text-[13px]" role="radiogroup" aria-label="Period">
          {(["day", ...hourKeys] as const).map((k) => (
            <button
              key={String(k)}
              type="button"
              role="radio"
              aria-checked={scope === k}
              onClick={() => setScope(k)}
              className={cn("h-10 rounded-full px-3 font-semibold num transition-colors duration-150 sm:h-8", scope === k ? "bg-white text-ink shadow-[0_1px_3px_#0002]" : "text-ink-2 hover:text-ink")}
            >
              {k === "day" ? "Whole day" : hourLabel(k).replace(" ", "")}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {METRICS.map((m, i) => {
          const t = pair.today[m.key];
          const f = fixVal(m.key);
          const ch = t ? (f - t) / t : 0;
          const tone = ch < -0.005 ? "text-[#1d7a4e]" : ch > 0.005 ? "text-[#b3242f]" : "text-ink-2";
          const Icon = m.icon;
          return (
            <motion.li
              key={m.key}
              layout
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, type: "spring", duration: 0.45, bounce: 0 }}
              className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_#0000000f] transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-strong)] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_#0000001a]"
            >
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                <Icon size={17} />
                {m.label}
              </div>
              <div className={cn("mt-2 text-[32px] leading-none font-medium tracking-[-0.04em]", tone)}>
                <CountUp value={Math.abs(ch) * 100} decimals={Math.abs(ch) < 0.01 ? 1 : 0} prefix={ch > 0 ? "+" : ch < 0 ? "−" : ""} suffix="%" />
              </div>
              <div className="mt-2 text-[12px] text-ink-2 num">
                {fmt(t)} → {fmt(f)} {m.unit}
              </div>
            </motion.li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12.5px] text-ink-2 num">
        Same traffic · 2 seeds · scaled to equal trips (+{fmt(Math.max(0, ((pair.fix.trips - pair.today.trips) / pair.today.trips) * 100), 1)}% more get through)
      </p>

      <div className="mt-8 grid gap-2.5 sm:grid-cols-3">
        {[
          { label: "Saved a weekday", value: <CountUp value={perDay / 1000} prefix="₹" suffix="k" />, sub: `${fmt(dHours, 0)} veh-h · ${fmt(dFuel, 0)} L` },
          { label: "Package cost", value: <CountUp value={costLakh} decimals={1} prefix="₹" suffix=" L" />, sub: "planning estimate" },
          { label: "Pays back in", value: payback ? <CountUp value={payback} suffix=" days" /> : "–", sub: "at the values below" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-ink p-4 text-chalk transition-transform duration-300 ease-[var(--ease-out-strong)] hover:-translate-y-0.5">
            <div className="text-[13px] text-chalk-2">{s.label}</div>
            <div className="mt-1.5 text-[32px] leading-none font-medium tracking-[-0.04em]">{s.value}</div>
            <div className="mt-2 text-[12px] text-chalk-2 num">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {[
          { label: "Fuel ₹/litre", value: fuelPrice, set: setFuelPrice, min: 50, max: 200 },
          { label: "Time ₹/veh-hour", value: vot, set: setVot, min: 0, max: 1000 },
        ].map((f) => (
          <label key={f.label} className="flex h-11 items-center gap-2 rounded-full bg-white pr-1.5 pl-4 text-[13px] text-ink-2 shadow-[0_1px_2px_#0000000f]">
            {f.label}
            <input
              type="number"
              inputMode="numeric"
              min={f.min}
              max={f.max}
              value={f.value}
              onChange={(e) => f.set(Number(e.target.value) || 0)}
              className="h-8 w-20 rounded-full bg-paper px-3 text-[15px] font-semibold text-ink num outline-none focus-visible:shadow-[inset_0_0_0_2px_#2d6cdf]"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
