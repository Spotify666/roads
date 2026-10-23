// Proxies TomTom live traffic-flow tiles so the API key stays on the server.
// Only tiles covering the Hyderabad metro area are served.
export const runtime = "edge";

const BOUNDS = { west: 78.1, east: 78.8, south: 17.15, north: 17.7 };

function tileBounds(z: number, x: number, y: number) {
  const n = 2 ** z;
  const lon = (t: number) => (t / n) * 360 - 180;
  const lat = (t: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) * 180) / Math.PI;
  return { west: lon(x), east: lon(x + 1), north: lat(y), south: lat(y + 1) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z: zs, x: xs, y: ys } = await params;
  const z = Number(zs), x = Number(xs), y = Number(ys.replace(/\.png$/, ""));
  if (![z, x, y].every(Number.isInteger) || z < 9 || z > 18) return new Response("bad tile", { status: 400 });
  const b = tileBounds(z, x, y);
  if (b.east < BOUNDS.west || b.west > BOUNDS.east || b.north < BOUNDS.south || b.south > BOUNDS.north) {
    return new Response(null, { status: 204 });
  }
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return new Response("not configured", { status: 503 });
  const url = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/${z}/${x}/${y}.png?key=${key}&tileSize=256`;
  // an unreachable TomTom leaves the map without the live layer rather than failing it
  const r = await fetch(url).catch(() => null);
  if (!r?.ok) return new Response(null, { status: r?.status === 403 ? 503 : 204 });
  return new Response(r.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=120, s-maxage=180, stale-while-revalidate=600",
    },
  });
}
