import { sbSelect } from "@/lib/supabase";

export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(id)) return new Response("bad id", { status: 400 });
  const since = new Date(Date.now() - 14 * 86400e3).toISOString();
  const [hourly, recent] = await Promise.all([
    sbSelect<unknown[]>(`hourly_measured?hotspot_id=eq.${id}&select=*&order=hour.asc`, 300),
    sbSelect<unknown[]>(
      `flow_readings?hotspot_id=eq.${id}&observed_at=gte.${since}&select=observed_at,current_speed,free_flow_speed,current_travel_time,free_flow_travel_time,confidence&order=observed_at.asc&limit=1000`,
      300,
    ),
  ]);
  return Response.json(
    { hourly: hourly ?? [], recent: recent ?? [] },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } },
  );
}
