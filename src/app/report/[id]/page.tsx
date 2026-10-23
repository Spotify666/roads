import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintButton } from "@/components/PrintButton";
import { CAUSE_LABELS, FIX_TYPE_LABELS, flowColor, flowLabel, hourLabel, minutes } from "@/lib/flow";
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
  return a ? { title: `Report: ${a.name}`, robots: { index: false } } : {};
}

export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const a = load((await params).id);
  if (!a) notFound();
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  return (
    <main className="mx-auto max-w-[800px] bg-white px-8 py-10 text-ink print:max-w-none print:px-0 print:py-0">
      <div className="no-print mb-8 flex items-center justify-between">
        <Link href={`/area/${a.id}`} className="text-[14px] text-ink-2 hover:text-ink">
          ← Back to {a.name}
        </Link>
        <PrintButton />
      </div>
      <p className="text-[13px] text-ink-2">RoadFix Hyderabad · corridor note · {today}</p>
      <h1 className="mt-2 text-[32px] leading-tight font-semibold tracking-[-0.02em]">{a.name}</h1>
      <p className="mt-1 text-[15px] text-ink-2">
        {a.place}
        {a.snapped.road ? ` · ${a.snapped.road}` : ""} · {a.corporation} · {a.police}
      </p>

      <h2 className="mt-8 text-[19px] font-semibold">Recommended fix</h2>
      <p className="mt-2 text-[17px] font-semibold">{a.fix.title}</p>
      <p className="mt-2 text-[15px] leading-relaxed">{a.fix.detail}</p>
      <table className="mt-4 text-[14.5px]">
        <tbody>
          <tr>
            <th className="pr-6 py-1 text-left font-normal text-ink-2">Type</th>
            <td>{FIX_TYPE_LABELS[a.fix.type] ?? a.fix.type}</td>
          </tr>
          <tr>
            <th className="pr-6 py-1 text-left font-normal text-ink-2">Agency</th>
            <td>{a.fix.agency}</td>
          </tr>
          <tr>
            <th className="pr-6 py-1 text-left font-normal text-ink-2">Rough cost</th>
            <td className="num">
              ₹{a.fix.costLakh[0]}–{a.fix.costLakh[1]} lakh (planning estimate)
            </td>
          </tr>
          <tr>
            <th className="pr-6 py-1 text-left font-normal text-ink-2">Time to build</th>
            <td className="num">About {a.fix.weeks} weeks</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-8 text-[19px] font-semibold">When it jams (TomTom, typical weekday)</h2>
      <table className="mt-3 w-full text-left text-[14.5px]">
        <thead>
          <tr className="text-[12.5px] text-ink-2">
            <th className="pb-1 font-medium">Direction</th>
            <th className="pb-1 font-medium">Length</th>
            <th className="pb-1 font-medium">Empty road</th>
            <th className="pb-1 font-medium">Morning peak</th>
            <th className="pb-1 font-medium">Evening peak</th>
          </tr>
        </thead>
        <tbody>
          {a.dirs.map((d) => (
            <tr key={d.tag}>
              <td className="py-1 capitalize">{d.heading}</td>
              <td className="py-1 num">{(d.lengthM / 1000).toFixed(1)} km</td>
              <td className="py-1 num">{minutes(d.freeFlowS)} min</td>
              <td className="py-1 num">
                <span className="mr-1 inline-block size-2 rounded-full" style={{ background: flowColor(d.am.ratio) }} />
                {hourLabel(d.am.hour)}: {minutes(d.freeFlowS + d.am.delay)} min ({d.am.ratio.toFixed(1)}×, {flowLabel(d.am.ratio).toLowerCase()})
              </td>
              <td className="py-1 num">
                <span className="mr-1 inline-block size-2 rounded-full" style={{ background: flowColor(d.pm.ratio) }} />
                {hourLabel(d.pm.hour)}: {minutes(d.freeFlowS + d.pm.delay)} min ({d.pm.ratio.toFixed(1)}×, {flowLabel(d.pm.ratio).toLowerCase()})
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 text-[19px] font-semibold">Why it jams</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed">
        {a.reported.map((r, i) => (
          <li key={i}>
            {r.text} <span className="text-ink-2">({a.sources[r.src]?.publisher}, {a.sources[r.src]?.date})</span>
          </li>
        ))}
        {a.timeNotes.map((r, i) => (
          <li key={`t${i}`}>
            {r.text} <span className="text-ink-2">({a.sources[r.src]?.publisher}, {a.sources[r.src]?.date})</span>
          </li>
        ))}
        {a.osmSignals.map((s) => (
          <li key={s}>
            {s} <span className="text-ink-2">(OpenStreetMap)</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[14px] text-ink-2">Causes weighed: {a.causes.map((c) => CAUSE_LABELS[c] ?? c).join("; ")}.</p>

      <h2 className="mt-8 text-[19px] font-semibold">Before building</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed">
        <li>Site walk to confirm the layout and mark blocked zones (pillars, shrines, transformers, drains).</li>
        <li>Video counts at the junction for two weekday peaks.</li>
        <li>Travel-time check against the figures above, then a simulation of the fix like the Mehdipatnam pilot.</li>
      </ul>

      <h2 className="mt-8 text-[19px] font-semibold">Sources</h2>
      <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-ink-2">
        {Object.values(a.sources).map((s) => (
          <li key={s.url}>
            {s.publisher}, {s.date}: {s.title}. {s.url}
          </li>
        ))}
        <li>TomTom Traffic Flow and Routing APIs (historical travel times); OpenStreetMap contributors (ODbL).</li>
      </ul>
      <p className="mt-8 text-[12.5px] text-ink-2">
        RoadFix Hyderabad is an independent project, not an official GHMC, HMDA or Traffic Police document. Costs are planning estimates, not quotes.
      </p>
    </main>
  );
}
