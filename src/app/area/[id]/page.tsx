import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AreaWhen, LiveNow, Measured } from "@/components/AreaView";
import { CAUSE_LABELS, FIX_TYPE_LABELS, hourLabel } from "@/lib/flow";
import type { AreaDetail } from "@/lib/types";
import areasData from "@/data/areas.json";

const ids = (areasData as { areas: { id: string }[] }).areas.map((a) => a.id);

function load(id: string): AreaDetail | null {
  if (!ids.includes(id)) return null;
  return JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", "areas", `${id}.json`), "utf8"));
}

export function generateStaticParams() {
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const a = load((await params).id);
  if (!a) return {};
  const d = a.dirs[0];
  return {
    title: `${a.name}: when it jams and the fix`,
    description: `${a.name}, Hyderabad. ${d ? `Worst on weekdays at ${hourLabel(d.peak.hour)} (${d.peak.ratio.toFixed(1)}× free-flow time). ` : ""}Fix: ${a.fix.title}.`,
  };
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  if (!m) return y;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day ? Number(day) + " " : ""}${months[Number(m) - 1]} ${y}`;
}

export default async function AreaPage({ params }: { params: Promise<{ id: string }> }) {
  const a = load((await params).id);
  if (!a) notFound();
  const worst = a.dirs.length ? a.dirs.reduce((x, y) => (y.peak.ratio > x.peak.ratio ? y : x)) : null;
  const cite = (src: string) => {
    const s = a.sources[src];
    return s ? (
      <a href={s.url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-ink-2 underline hover:text-ink">
        {s.publisher}, {fmtDate(s.date)}
      </a>
    ) : null;
  };

  return (
    <main>
      <section className="dark-surface bg-asphalt text-chalk">
        <div className="mx-auto max-w-[1180px] px-4 pt-8 pb-10 sm:px-6">
          <Link href="/" className="text-[14px] text-chalk-2 hover:text-chalk">
            ← City map
          </Link>
          <h1 className="mt-4 text-[34px] leading-[1.05] font-semibold tracking-[-0.025em] text-balance sm:text-[46px]">{a.name}</h1>
          <p className="mt-2 text-[17px] text-chalk-2">
            {a.place}
            {a.snapped.road ? ` · ${a.snapped.road}` : ""} · {a.corporation} · {a.police}
          </p>
          <div className="mt-6">
            <LiveNow id={a.id} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6">
        <h2 className="text-[26px] font-semibold tracking-[-0.02em]">When it jams</h2>
        <p className="mt-2 mb-8 max-w-[64ch] text-[15px] text-ink-2">
          Typical weekday, from TomTom&apos;s historical travel times, split into stretches of about 300 m so you can see where the queue sits at
          each hour.
        </p>
        <AreaWhen area={a} />
      </section>

      <section className="bg-paper-2">
        <div className="mx-auto grid max-w-[1180px] gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em]">Why it jams</h2>
            {a.reported.length > 0 ? (
              <ul className="mt-6 space-y-5">
                {a.reported.map((r, i) => (
                  <li key={i} className="max-w-[62ch] text-[16.5px] leading-relaxed">
                    {r.text} <span className="text-[14px]">{cite(r.src)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 max-w-[62ch] text-[16.5px] leading-relaxed text-ink-2">
                We found no published report naming this spot&apos;s cause. It is on the list because TomTom&apos;s data shows it among the slowest, and
                the causes below come from what is on the ground.
              </p>
            )}
            {a.timeNotes.length > 0 && (
              <>
                <h3 className="mt-10 text-[18px] font-semibold">Why at those hours</h3>
                <ul className="mt-3 space-y-3">
                  {a.timeNotes.map((r, i) => (
                    <li key={i} className="max-w-[62ch] text-[16px] leading-relaxed">
                      {r.text} <span className="text-[14px]">{cite(r.src)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="mt-10 text-[18px] font-semibold">What the road layout shows</h3>
            <p className="mt-1 text-[14px] text-ink-2">From OpenStreetMap, within 250 m of the spot.</p>
            <ul className="mt-3 space-y-2 text-[16px]">
              {a.osmSignals.length ? a.osmSignals.map((s) => <li key={s}>{s}</li>) : <li className="text-ink-2">Nothing unusual is mapped here.</li>}
            </ul>
            <h3 className="mt-10 text-[18px] font-semibold">Causes we weigh</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {a.causes.map((c) => (
                <li key={c} className="rounded-md bg-paper-3 px-2.5 py-1 text-[14px]">
                  {CAUSE_LABELS[c] ?? c}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em]">The fix</h2>
            <p className="mt-6 text-[22px] leading-snug font-semibold tracking-[-0.01em] text-balance">{a.fix.title}</p>
            <p className="mt-4 max-w-[60ch] text-[16.5px] leading-relaxed">{a.fix.detail}</p>
            <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[16px]">
              <dt className="text-ink-2">Type</dt>
              <dd>{FIX_TYPE_LABELS[a.fix.type] ?? a.fix.type}</dd>
              <dt className="text-ink-2">Who builds it</dt>
              <dd>{a.fix.agency}</dd>
              <dt className="text-ink-2">Rough cost</dt>
              <dd className="num">
                ₹{a.fix.costLakh[0]}–{a.fix.costLakh[1]} lakh <span className="text-ink-2">(planning estimate)</span>
              </dd>
              <dt className="text-ink-2">Time to build</dt>
              <dd className="num">About {a.fix.weeks} weeks</dd>
              {worst && (
                <>
                  <dt className="text-ink-2">Hours it targets</dt>
                  <dd className="num">
                    {hourLabel(worst.am.hour)} and {hourLabel(worst.pm.hour)} weekday peaks
                  </dd>
                </>
              )}
            </dl>
            {a.pilot ? (
              <Link
                href="/pilot"
                className="mt-8 inline-block rounded-md bg-sign px-4 py-2.5 font-medium text-white transition-transform duration-150 active:scale-[0.97]"
              >
                See it tested in the simulation
              </Link>
            ) : (
              <p className="mt-8 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-2">
                The savings from this fix have not been simulated yet. The Mehdipatnam pilot shows how each fix is tested before it is recommended.
              </p>
            )}
            <div className="mt-10">
              <Link href={`/report/${a.id}`} className="font-medium text-sign underline">
                Printable report for {a.fix.agency.split(" + ")[0]}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-16 sm:px-6">
        <h2 className="text-[26px] font-semibold tracking-[-0.02em]">Measured by RoadFix</h2>
        <div className="mt-5">
          <Measured id={a.id} typical={(worst?.hours ?? []).map((h) => ({ hour: h.hour, ratio: h.ratio }))} />
        </div>
      </section>
    </main>
  );
}
