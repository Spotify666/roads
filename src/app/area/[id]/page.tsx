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

function Disclosure({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl bg-white/70 ring-1 ring-black/[0.05] open:bg-white">
      <summary className="flex h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14.5px] font-medium [&::-webkit-details-marker]:hidden">
        <span>
          {label}
          {count != null && <span className="ml-1.5 text-ink-2 num">{count}</span>}
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" className="text-ink-2 transition-transform duration-200 ease-[var(--ease-out-strong)] group-open:rotate-180" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
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
        <div className="mx-auto max-w-[1180px] px-4 pt-6 pb-8 sm:px-6">
          <Link href="/" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-asphalt-3 px-3.5 text-[13.5px] font-medium text-chalk transition-transform duration-150 active:scale-[0.96]">
            <span aria-hidden="true">←</span> Map
          </Link>
          <h1 className="mt-5 text-[32px] leading-[1.05] font-semibold tracking-[-0.025em] text-balance sm:text-[44px]">{a.name}</h1>
          <ul className="mt-3 flex flex-wrap gap-1.5 text-[12.5px] text-chalk-2">
            {[a.place, a.snapped.road, a.corporation, a.police].filter(Boolean).map((t) => (
              <li key={t} className="rounded-full bg-asphalt-3 px-2.5 py-1">
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <LiveNow id={a.id} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-[24px] font-semibold tracking-[-0.02em]">When it jams</h2>
        <p className="mt-1 mb-6 text-[13.5px] text-ink-2">Typical weekday · TomTom · ~300 m stretches</p>
        <AreaWhen area={a} />
      </section>

      <section className="bg-paper-2">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="text-[24px] font-semibold tracking-[-0.02em]">Why</h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {a.causes.map((c) => (
                <li key={c} className="rounded-full bg-ink px-3.5 py-1.5 text-[14px] font-medium text-chalk">
                  {CAUSE_LABELS[c] ?? c}
                </li>
              ))}
            </ul>
            {a.osmSignals.length > 0 && (
              <>
                <div className="mt-6 text-[12px] font-semibold tracking-wide text-ink-2">ON THE MAP · 250 M</div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {a.osmSignals.map((s) => (
                    <li key={s} className="rounded-full bg-white px-3 py-1 text-[13px] shadow-[0_1px_2px_#0000000f]">
                      {s}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-6 space-y-2">
              {a.reported.length > 0 ? (
                <Disclosure label="Reports" count={a.reported.length}>
                  <ul className="space-y-3">
                    {a.reported.map((r, i) => (
                      <li key={i} className="text-[15px] leading-relaxed">
                        {r.text} <span className="text-[13px]">{cite(r.src)}</span>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              ) : (
                <p className="rounded-2xl bg-white/70 px-4 py-3 text-[13.5px] text-ink-2">No published report names a cause · listed from TomTom data</p>
              )}
              {a.timeNotes.length > 0 && (
                <Disclosure label="Why at those hours" count={a.timeNotes.length}>
                  <ul className="space-y-3">
                    {a.timeNotes.map((r, i) => (
                      <li key={i} className="text-[15px] leading-relaxed">
                        {r.text} <span className="text-[13px]">{cite(r.src)}</span>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-[24px] font-semibold tracking-[-0.02em]">The fix</h2>
            <div className="mt-5 rounded-3xl bg-ink p-5 text-chalk sm:p-6">
              <div className="text-[12px] font-semibold tracking-wide text-sign-bright">{(FIX_TYPE_LABELS[a.fix.type] ?? a.fix.type).toUpperCase()}</div>
              <p className="mt-2 text-[21px] leading-snug font-semibold tracking-[-0.01em] text-balance">{a.fix.title}</p>
              <ul className="mt-5 grid grid-cols-2 gap-2">
                {[
                  { k: "Cost", v: `₹${a.fix.costLakh[0]}–${a.fix.costLakh[1]} L` },
                  { k: "Build time", v: `~${a.fix.weeks} weeks` },
                  ...(worst ? [{ k: "Targets", v: `${hourLabel(worst.am.hour)} · ${hourLabel(worst.pm.hour)}` }] : []),
                  { k: "Who", v: a.fix.agency.split(" + ")[0] },
                ].map((t) => (
                  <li key={t.k} className="rounded-2xl bg-asphalt-3 p-3">
                    <div className="text-[12px] text-chalk-2">{t.k}</div>
                    <div className="mt-1 text-[16px] font-semibold num">{t.v}</div>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                {a.pilot && (
                  <Link href="/pilot" className="flex h-11 items-center rounded-full bg-sign px-5 text-[14.5px] font-semibold text-white transition-transform duration-150 active:scale-[0.97]">
                    Test it in the Lab
                  </Link>
                )}
                <Link
                  href={`/report/${a.id}`}
                  className="flex h-11 items-center rounded-full bg-asphalt-3 px-5 text-[14.5px] font-semibold text-chalk transition-transform duration-150 active:scale-[0.97]"
                >
                  Report for {a.fix.agency.split(" + ")[0]}
                </Link>
              </div>
            </div>
            <div className="mt-3">
              <Disclosure label="How it works">
                <p className="text-[15px] leading-relaxed">{a.fix.detail}</p>
                <p className="mt-3 text-[13px] text-ink-2">Agencies: {a.fix.agency} · cost is a planning estimate</p>
              </Disclosure>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-[24px] font-semibold tracking-[-0.02em]">Measured by RoadFix</h2>
        <div className="mt-4">
          <Measured id={a.id} typical={(worst?.hours ?? []).map((h) => ({ hour: h.hour, ratio: h.ratio }))} />
        </div>
      </section>
    </main>
  );
}
