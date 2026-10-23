// Polls TomTom every 30 minutes (hourly overnight) for live speeds at each
// hotspot and the city-wide incident list, and stores them so the site can
// show measured time-of-day patterns. Triggered by pg_cron with a shared secret.
import { createClient } from "jsr:@supabase/supabase-js@2";

const DAILY_CAP = 2350; // TomTom free tier is 2,500 non-tile calls a day
const BBOX = "78.25,17.25,78.70,17.60"; // Hyderabad metro area
const INCIDENT_FIELDS =
  "{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,from,to,length,delay,roadNumbers}}}";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: cronSecret } = await db.rpc("app_secret", { secret_name: "cron_secret" });
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "forbidden" }, 403);

  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600e3);
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && ist.getUTCHours() < 6 && ist.getUTCMinutes() >= 25) {
    return json({ skipped: "overnight runs are hourly" });
  }

  const [{ data: key }, { data: hotspots, error: hsErr }, { data: usage }] = await Promise.all([
    db.rpc("app_secret", { secret_name: "tomtom_api_key" }),
    db.from("hotspots").select("id, lat, lon"),
    db.from("api_usage").select("calls").eq("day", now.toISOString().slice(0, 10)).maybeSingle(),
  ]);
  if (!key || hsErr || !hotspots) return json({ error: "setup", detail: hsErr?.message }, 500);

  const used = usage?.calls ?? 0;
  if (used + hotspots.length + 1 > DAILY_CAP) return json({ skipped: "daily budget reached", used });

  let calls = 0;
  const rows: Record<string, unknown>[] = [];
  const failures: string[] = [];
  for (let i = 0; i < hotspots.length; i += 5) {
    await Promise.all(
      hotspots.slice(i, i + 5).map(async (h) => {
        calls++;
        const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/13/json?point=${h.lat},${h.lon}&unit=KMPH&key=${key}`;
        try {
          const r = await fetch(url);
          if (!r.ok) return failures.push(`${h.id}:${r.status}`);
          const f = (await r.json()).flowSegmentData;
          rows.push({
            hotspot_id: h.id,
            observed_at: now.toISOString(),
            current_speed: f.currentSpeed,
            free_flow_speed: f.freeFlowSpeed,
            current_travel_time: f.currentTravelTime,
            free_flow_travel_time: f.freeFlowTravelTime,
            confidence: f.confidence,
            road_closure: f.roadClosure,
            frc: f.frc,
          });
        } catch (e) {
          failures.push(`${h.id}:${(e as Error).message}`);
        }
      }),
    );
  }

  calls++;
  let incidentCount = 0;
  let jamCount = 0;
  try {
    const r = await fetch(
      `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${key}&bbox=${BBOX}&fields=${encodeURIComponent(INCIDENT_FIELDS)}&language=en-GB&timeValidityFilter=present`,
    );
    if (r.ok) {
      const incidents = (await r.json()).incidents ?? [];
      incidentCount = incidents.length;
      // Keep jams, accidents, closures and works; drop the geometry of long-standing closures to save space.
      const kept = incidents
        .filter((x: any) => [1, 6, 7, 8, 9, 11, 14].includes(x.properties.iconCategory))
        .map((x: any) => ({ g: x.geometry, p: x.properties }));
      jamCount = kept.filter((x: any) => x.p.iconCategory === 6).length;
      await db.from("incident_snapshots").insert({ observed_at: now.toISOString(), incident_count: incidentCount, jam_count: jamCount, data: kept });
      // Only the latest 3 days of incident snapshots are needed.
      await db.from("incident_snapshots").delete().lt("observed_at", new Date(now.getTime() - 3 * 86400e3).toISOString());
    } else failures.push(`incidents:${r.status}`);
  } catch (e) {
    failures.push(`incidents:${(e as Error).message}`);
  }

  if (rows.length) {
    const { error } = await db.from("flow_readings").insert(rows);
    if (error) failures.push(`insert:${error.message}`);
  }
  await db.rpc("bump_usage", { n: calls });

  return json({ readings: rows.length, incidents: incidentCount, jams: jamCount, calls, failures });
});
