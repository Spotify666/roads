"""City-wide road features for the map: traffic signals, U-turn openings and bus stops.

From OpenStreetMap through Overpass. A U-turn opening is a short link (under 70 m) that joins
two one-way carriageways running in opposite directions and touches nothing else at either end,
which is how median gaps on Hyderabad's divided roads are mapped. Nodes tagged
highway=turning_loop are U-turns too.

Writes:
  public/data/road-cues.json   GeoJSON points for the map (kind: signal | uturn | bus)
  data/road_cues_counts.json   per hotspot, how many of each lie within 300 m
"""
import json, math, os, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from tomtom_profiles import hav  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW = os.path.join(ROOT, "data", "raw", "osm_city")
BBOX = "17.25,78.25,17.60,78.70"  # south, west, north, east: GHMC and the Cyberabad IT belt
ENDPOINT = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
MAIN = "motorway|trunk|primary|secondary|tertiary"
LINKABLE = MAIN + "|unclassified|residential|service|road|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"

QUERIES = {
    "points": f"""[out:json][timeout:180];
(node["highway"="traffic_signals"]({BBOX});
 node["highway"="turning_loop"]({BBOX});
 node["highway"="bus_stop"]({BBOX});
 node["public_transport"="platform"]["bus"="yes"]({BBOX}););
out;""",
    "roads": f"""[out:json][timeout:300];
way["highway"~"^({MAIN})$"]["oneway"~"^(yes|1|-1)$"]({BBOX})->.m;
node(w.m)->.mn;
way(bn.mn)["highway"]->.t;
way.t["highway"~"^({LINKABLE})$"](if: length() < 70)->.s;
.m out body geom;
.s out body geom;
.t out skel;""",
}


def overpass(name):
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, f"{name}.json")
    if os.path.exists(path):
        return json.load(open(path))
    body = urllib.parse.urlencode({"data": QUERIES[name]}).encode()
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(ENDPOINT, data=body), timeout=400) as r:
                data = json.load(r)
            json.dump(data, open(path, "w"))
            return data
        except Exception as e:  # rate limits and timeouts: back off and retry
            print(f"  {name}: {e}; retrying", file=sys.stderr)
            time.sleep(20 * (attempt + 1))
    raise SystemExit(f"Overpass query {name} failed")


def bearing(a, b):
    """Initial bearing from a to b, both (lat, lon), in degrees."""
    la1, la2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    y = math.sin(dl) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def turn(a, b):
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def main():
    pts = overpass("points")["elements"]
    roads = overpass("roads")["elements"]

    geo = {}  # way id -> (tags, node ids, [(lat, lon)])
    touching = {}  # node id -> ids of every highway way through it
    for e in roads:
        if e["type"] != "way":
            continue
        if "geometry" in e:
            geo[e["id"]] = (e.get("tags", {}), e["nodes"], [(g["lat"], g["lon"]) for g in e["geometry"]])
        for n in e["nodes"]:
            touching.setdefault(n, set()).add(e["id"])

    main_ways = {w for w, (t, _, _) in geo.items() if t.get("oneway") in ("yes", "1", "-1") and t.get("highway") in MAIN.split("|")}

    def travel_bearing(w, node):
        """Direction of travel along one-way way w at one of its nodes."""
        t, nodes, g = geo[w]
        i = nodes.index(node)
        a, b = (g[i], g[i + 1]) if i + 1 < len(g) else (g[i - 1], g[i])
        brg = bearing(a, b)
        return (brg + 180) % 360 if t.get("oneway") == "-1" else brg

    uturns = []
    for w, (t, nodes, g) in geo.items():
        length = sum(hav(a, b) for a, b in zip(g, g[1:]))
        if length >= 70 or length < 4 or w in main_ways and len(nodes) > 3:
            continue
        e1, e2 = nodes[0], nodes[-1]
        ends = []
        for e in (e1, e2):
            others = touching.get(e, set()) - {w}
            # a median gap touches only its own carriageway at each end; a side road through the median does not
            if not others or not others <= main_ways:
                break
            brgs = [travel_bearing(o, e) for o in others]
            if any(turn(brgs[0], b) > 45 for b in brgs[1:]):
                break
            ends.append((others, brgs[0]))
        if len(ends) != 2 or ends[0][0] & ends[1][0]:
            continue
        if turn(ends[0][1], ends[1][1]) < 140:
            continue  # the two carriageways must run in opposite directions
        mid = g[len(g) // 2] if len(g) > 2 else ((g[0][0] + g[-1][0]) / 2, (g[0][1] + g[-1][1]) / 2)
        uturns.append(mid)

    for e in pts:
        if e.get("tags", {}).get("highway") == "turning_loop":
            uturns.append((e["lat"], e["lon"]))

    def dedupe(points, within):
        out = []
        for p in points:
            if all(hav(p, q) > within for q in out):
                out.append(p)
        return out

    # one icon per junction, though each carriageway's signal is mapped separately
    signals = dedupe([(e["lat"], e["lon"]) for e in pts if e.get("tags", {}).get("highway") == "traffic_signals"], 40)
    buses = dedupe(
        [(e["lat"], e["lon"]) for e in pts if e.get("tags", {}).get("highway") == "bus_stop" or e.get("tags", {}).get("bus") == "yes"], 25
    )
    # a gap at a signalled junction is the junction itself, which its signal already marks
    uturns = [u for u in dedupe(uturns, 25) if all(hav(u, s) > 35 for s in signals)]

    feats = [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(p[1], 6), round(p[0], 6)]}, "properties": {"k": k}}
        for k, ps in (("signal", signals), ("uturn", uturns), ("bus", buses))
        for p in ps
    ]
    json.dump(
        {"type": "FeatureCollection", "source": "OpenStreetMap contributors (ODbL)", "features": feats},
        open(os.path.join(ROOT, "public", "data", "road-cues.json"), "w"),
        separators=(",", ":"),
    )

    areas = json.load(open(os.path.join(ROOT, "data", "osm_features.json")))
    counts = {}
    for hid, f in areas.items():
        c = (f["snapped"]["lat"], f["snapped"]["lon"])
        counts[hid] = {k: sum(1 for p in ps if hav(c, p) <= 300) for k, ps in (("signals", signals), ("uturns", uturns), ("bus", buses))}
    json.dump(counts, open(os.path.join(ROOT, "data", "road_cues_counts.json"), "w"), indent=1)
    print(f"signals {len(signals)}, U-turn openings {len(uturns)}, bus stops {len(buses)}")


if __name__ == "__main__":
    main()
