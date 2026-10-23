import Link from "next/link";
import { CityExplorer } from "@/components/CityExplorer";
import { FLOW_COLORS, FLOW_LABELS, hourLabel } from "@/lib/flow";
import areasData from "@/data/areas.json";
import type { AreaWithStretches } from "@/components/CityMap";

const data = areasData as unknown as { generated: string; hours: number[]; areas: AreaWithStretches[] };

export default function Home() {
  const worst = data.areas.slice(0, 5);
  const pmPeak = data.areas.filter((a) => a.profile && a.profile.peak.hour >= 16).length;
  return (
    <main>
      <CityExplorer data={data} />

      <section className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <div>
            <h2 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[34px]">
              Most of the city&apos;s worst hours are in the evening
            </h2>
            <p className="mt-4 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">
              On a typical weekday, {pmPeak} of the 41 spots hit their worst between 4 pm and 9 pm. The five slowest, measured as travel time
              against free flow at each spot&apos;s worst hour:
            </p>
            <ol className="mt-8">
              {worst.map((a) => (
                <li key={a.id} className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-3">
                  <Link href={`/area/${a.id}`} className="text-[17px] font-medium hover:underline">
                    {a.name}
                  </Link>
                  <span className="text-[15px] text-ink-2 num">
                    <strong className="font-semibold text-ink">{a.profile!.peak.ratio.toFixed(1)}×</strong> at {hourLabel(a.profile!.peak.hour)},{" "}
                    {a.profile!.heading}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="lg:pt-2">
            <h2 className="text-[22px] leading-snug font-semibold tracking-[-0.015em]">What the colours mean</h2>
            <p className="mt-3 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
              Every colour is a ratio: how long a stretch takes now, or typically at that hour, divided by how long it takes on an empty road.
            </p>
            <dl className="mt-6 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 text-[15px]">
              {FLOW_LABELS.map((l, i) => (
                <div key={l} className="contents">
                  <dt className="size-3.5 rounded-sm" style={{ background: FLOW_COLORS[i] }} />
                  <dd className="font-medium">{l}</dd>
                  <dd className="text-ink-2 num">{["under 1.15×", "1.15–1.5×", "1.5–2×", "2–3×", "3× or more"][i]}</dd>
                </div>
              ))}
            </dl>
            <h2 className="mt-14 text-[22px] leading-snug font-semibold tracking-[-0.015em]">Measured, reported, or estimated</h2>
            <p className="mt-3 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
              Speeds and travel times are measured by TomTom, and RoadFix records them every 30 minutes. Causes come from traffic police alerts,
              civic-body reviews and news reports, each cited, plus what OpenStreetMap shows at the spot. Fix costs and savings are planning
              estimates until a field survey confirms them.{" "}
              <Link href="/method" className="font-medium text-sign underline">
                How it works
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="dark-surface bg-asphalt text-chalk">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end lg:py-24">
          <div>
            <h2 className="max-w-[22ch] text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[34px]">
              See the Mehdipatnam–Tolichowki fix play out, minute by minute
            </h2>
            <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-chalk-2">
              The same traffic runs twice on the real 2.7 km corridor: once as it is today, calibrated to TomTom&apos;s typical times, and once with
              RoadFix&apos;s changes in place.
            </p>
          </div>
          <Link
            href="/pilot"
            className="justify-self-start rounded-md bg-sign px-5 py-3 text-[16px] font-medium text-white transition-transform duration-150 active:scale-[0.97] lg:justify-self-end"
          >
            Open the simulation
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-[1180px] px-4 py-10 text-[13.5px] leading-relaxed text-ink-2 sm:px-6">
        Traffic data © TomTom. Map data © OpenStreetMap contributors (ODbL), basemap by OpenFreeMap. Profiles generated {data.generated}. RoadFix
        Hyderabad is an independent project and not an official GHMC, HMDA or Traffic Police site.
      </footer>
    </main>
  );
}
