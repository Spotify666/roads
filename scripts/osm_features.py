"""Pull OpenStreetMap data around each hotspot and derive bottleneck signals.

Snaps each hotspot onto the nearest trunk/primary/secondary road, then counts
signals, bus stops, crossings and lane changes within 250 m. Output:
data/osm_features.json. Uses the official OSM API (map call, small bbox).
"""
import json, math, sys, time, urllib.request
import xml.etree.ElementTree as ET

UA = {"User-Agent": "RoadFixHyderabad/1.0 (niteshm98m@gmail.com)"}
MAJOR = {"motorway", "trunk", "primary", "secondary"}
R = 6371000.0


def xy(lat, lon, lat0, lon0):
    return (math.radians(lon - lon0) * R * math.cos(math.radians(lat0)), math.radians(lat - lat0) * R)


def seg_nearest(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    q = (ax + t * dx, ay + t * dy)
    return math.hypot(px - q[0], py - q[1]), q


def fetch(lat, lon, d=0.0035):
    import os, hashlib
    os.makedirs("data/raw/osm", exist_ok=True)
    cache = f"data/raw/osm/{lat:.5f}_{lon:.5f}_{d:.4f}.xml"
    if os.path.exists(cache):
        return open(cache, "rb").read()
    url = f"https://api.openstreetmap.org/api/0.6/map?bbox={lon-d},{lat-d},{lon+d},{lat+d}"
    for attempt in range(3):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
            open(cache, "wb").write(raw)
            return raw
        except Exception as e:
            if attempt == 2 and d > 0.002:
                return fetch(lat, lon, d * 0.7)
            time.sleep(3)
    raise RuntimeError("osm fetch failed")


def analyse(h):
    lat0, lon0 = h["lat"], h["lon"]
    root = ET.fromstring(fetch(lat0, lon0))
    nodes = {}
    ntags = {}
    for n in root.iter("node"):
        nid = n.get("id")
        nodes[nid] = (float(n.get("lat")), float(n.get("lon")))
        t = {x.get("k"): x.get("v") for x in n.findall("tag")}
        if t:
            ntags[nid] = t
    ways = []
    for w in root.iter("way"):
        t = {x.get("k"): x.get("v") for x in w.findall("tag")}
        if "highway" not in t:
            continue
        refs = [nd.get("ref") for nd in w.findall("nd") if nd.get("ref") in nodes]
        if len(refs) >= 2:
            ways.append((t, refs))
    P = (0.0, 0.0)
    best = None
    for t, refs in ways:
        if t["highway"] not in MAJOR:
            continue
        pts = [xy(*nodes[r], lat0, lon0) for r in refs]
        for a, b in zip(pts, pts[1:]):
            d, q = seg_nearest(P, a, b)
            if t.get("bridge") == "yes" or t.get("layer") in ("1", "2", "3"):
                d += 60  # problems sit on the at-grade road under a flyover
            if best is None or d < best[0]:
                best = (d, q, t)
    snapped = None
    if best:
        qx, qy = best[1]
        snapped = {"lat": lat0 + math.degrees(qy / R), "lon": lon0 + math.degrees(qx / (R * math.cos(math.radians(lat0)))),
                   "offset_m": round(best[0]), "on_bridge": best[2].get("bridge") == "yes", "road": best[2].get("name") or best[2].get("ref"), "highway": best[2]["highway"]}
    c = xy(snapped["lat"], snapped["lon"], lat0, lon0) if snapped else P

    def within(nid, r=250):
        x, y = xy(*nodes[nid], lat0, lon0)
        return math.hypot(x - c[0], y - c[1]) <= r

    def dist(nid):
        x, y = xy(*nodes[nid], lat0, lon0)
        return math.hypot(x - c[0], y - c[1])

    signals = [n for n, t in ntags.items() if t.get("highway") == "traffic_signals" and within(n)]
    stops = [n for n, t in ntags.items() if (t.get("highway") == "bus_stop" or t.get("public_transport") == "platform" and t.get("bus") == "yes") and within(n)]
    crossings = [n for n, t in ntags.items() if t.get("highway") == "crossing" and within(n)]
    uturn_like = 0
    lanes = []
    flyover = False
    dual = False
    for t, refs in ways:
        if not any(within(r) for r in refs):
            continue
        hw = t["highway"]
        if hw in MAJOR:
            if t.get("lanes", "").isdigit():
                lanes.append(int(t["lanes"]))
            if t.get("bridge") == "yes" or t.get("layer") in ("1", "2"):
                flyover = True
            if t.get("oneway") == "yes":
                dual = True
        if hw in ("trunk_link", "primary_link", "secondary_link", "tertiary_link") and len(refs) <= 4:
            uturn_like += 1
    signal_d = sorted(round(dist(n)) for n in signals)
    stop_d = sorted(round(dist(n)) for n in stops)
    return {
        "snapped": snapped,
        "signals_250m": len(signals), "signal_dist_m": signal_d[:6],
        "bus_stops_250m": len(stops), "bus_stop_dist_m": stop_d[:6],
        "nearest_bus_stop_m": stop_d[0] if stop_d else None,
        "crossings_250m": len(crossings),
        "lanes_min": min(lanes) if lanes else None, "lanes_max": max(lanes) if lanes else None,
        "flyover": flyover, "dual_carriageway": dual, "short_links": uturn_like,
        "osm_ways": len(ways),
    }


def main():
    hs = json.load(open("data/hotspots.json"))
    out = {}
    try:
        out = json.load(open("data/osm_features.json"))
    except FileNotFoundError:
        pass
    for h in hs:
        if h["id"] in out and "--force" not in sys.argv:
            continue
        try:
            out[h["id"]] = analyse(h)
        except Exception as e:
            out[h["id"]] = {"error": str(e)}
        f = out[h["id"]]
        print(h["id"], json.dumps({k: f.get(k) for k in ("snapped", "signals_250m", "bus_stops_250m", "nearest_bus_stop_m", "lanes_min", "lanes_max", "flyover", "error")}), flush=True)
        json.dump(out, open("data/osm_features.json", "w"), indent=1)
        time.sleep(1)


if __name__ == "__main__":
    main()
