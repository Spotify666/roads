import { sbSelect } from "@/lib/supabase";
import type { LiveIncident, LiveReading } from "@/lib/types";

// read from the database on every request; Vercel's CDN may share one response for up to a minute
export const dynamic = "force-dynamic";

export async function GET() {
  const [readings, snaps] = await Promise.all([
    sbSelect<LiveReading[]>("latest_readings?select=*", 0),
    sbSelect<{ observed_at: string; incident_count: number; jam_count: number; data: LiveIncident[] }[]>(
      "incident_snapshots?select=observed_at,incident_count,jam_count,data&order=observed_at.desc&limit=1",
      0,
    ),
  ]);
  const snap = snaps?.[0];
  // keep jams, accidents, lane closures and works with a real delay; drop long-standing closures
  const incidents = (snap?.data ?? []).filter((i) => [1, 6, 7, 9, 14].includes(i.p.iconCategory));
  return Response.json(
    {
      readings: readings ?? [],
      incidents: { observedAt: snap?.observed_at ?? null, total: snap?.incident_count ?? 0, jams: snap?.jam_count ?? 0, items: incidents },
    },
    { headers: { "Cache-Control": "public, s-maxage=60" } },
  );
}
