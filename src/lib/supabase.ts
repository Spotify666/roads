// Read-only access to the RoadFix Supabase project (public tables and views only).
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

export async function sbSelect<T>(path: string, revalidate = 60): Promise<T | null> {
  if (!URL || !KEY) return null;
  try {
    const r = await fetch(`${URL}/rest/v1/${path}`, {
      headers: { apikey: KEY, Accept: "application/json" },
      next: { revalidate },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
