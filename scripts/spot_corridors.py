"""A simulation corridor for every spot on the map, from TomTom's measured route and OpenStreetMap.

For each spot, the road TomTom measures through it (about 1.6 km) becomes a two-direction corridor:
chainage s runs along TomTom's first direction ("A"), so carriageway 0 travels towards the far end and
carriageway 1 back. Along it, from OpenStreetMap:
- lanes in each direction, and where a median divides the road;
- traffic signals, named after the cross street or the spot;
- U-turn openings in the median (the same detection as the map's road symbols); where there is no
  median, vehicles can turn back at side roads, so openings are placed there and cannot be edited;
- bus stops, on the side of the road they serve (traffic keeps left);
- side roads, weighted by their class, that feed and drain traffic;
- kerb friction near the spot where the reports name shared autos, buses or parking.

Writes data/corridors/<id>.json, the input to scripts/sim/calibrate-spots.ts. The Mehdipatnam pilot keeps
its hand-checked corridor (data/corridor.json).
"""
import json, math, os, sys, time, urllib.request
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(__file__))
from tomtom_profiles import bearing, hav  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW = os.path.join(ROOT, "data", "raw", "osm")
OUT = os.path.join(ROOT, "data", "corridors")
UA = {"User-Agent": "RoadFixHyderabad/1.0 (niteshm98m@gmail.com)"}
MAIN = {"motorway", "trunk", "primary", "secondary", "tertiary", "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
MOTOR = MAIN | {"unclassified", "residential", "service", "living_street", "road"}
WEIGHT = {"trunk": 5, "primary": 5, "secondary": 4, "tertiary": 3, "trunk_link": 2, "primary_link": 2, "secondary_link": 2, "residential": 1, "unclassified": 1, "living_street": 0.5, "service": 0.5}
# lanes per direction where OpenStreetMap has no count: divided roads carry more
DEFAULT_LANES = {"motorway": (3, 3), "trunk": (3, 2), "primary": (3, 2), "secondary": (2, 2), "tertiary": (2, 1)}
BIN = 25


def fetch_bbox(spot, b):
    path = os.path.join(RAW, f"spot_{spot}.xml")
    if os.path.exists(path):
        return open(path, "rb").read()
    url = "https://api.openstreetmap.org/api/0.6/map?bbox=%.5f,%.5f,%.5f,%.5f" % b
    for attempt in range(4):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()
            open(path, "wb").write(raw)
            time.sleep(1)
            return raw
        except Exception as e:
            print(f"  {spot}: {e}; retrying", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    raise SystemExit(f"OSM download failed for {spot}")


def polyline(d):
    pts = []
    for leg in d["legs"]:
        for lon, lat in leg["geom"]:
            if not pts or hav(pts[-1], (lat, lon)) > 0.5:
                pts.append((lat, lon))
    return pts


class Line:
    """A polyline with chainage, for projecting points onto it."""

    def __init__(self, pts):
        self.pts = pts
        self.ch = [0.0]
        for a, b in zip(pts, pts[1:]):
            self.ch.append(self.ch[-1] + hav(a, b))
        self.length = self.ch[-1]
        lat0 = pts[0][0]
        self.kx = 111320 * math.cos(math.radians(lat0))
        self.ky = 110540

    def xy(self, p):
        return ((p[1] - self.pts[0][1]) * self.kx, (p[0] - self.pts[0][0]) * self.ky)

    def project(self, p):
        """(chainage, distance, side) of p: side +1 is left of the direction of travel."""
        px, py = self.xy(p)
        best = (1e18, 0.0, 1)
        for i in range(len(self.pts) - 1):
            ax, ay = self.xy(self.pts[i])
            bx, by = self.xy(self.pts[i + 1])
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy or 1e-9
            t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
            qx, qy = ax + t * dx, ay + t * dy
            dist = math.hypot(px - qx, py - qy)
            if dist < best[0]:
                side = 1 if dx * (py - ay) - dy * (px - ax) > 0 else -1
                best = (dist, self.ch[i] + t * math.sqrt(L2), side)
        return best[1], best[0], best[2]

    def bearing_at(self, s):
        for i in range(len(self.pts) - 1):
            if self.ch[i + 1] >= s:
                return bearing(self.pts[i], self.pts[i + 1])
        return bearing(self.pts[-2], self.pts[-1])


def turn(a, b):
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def load_osm(raw):
    root = ET.fromstring(raw)
    nodes, ntags, ways = {}, {}, {}
    for n in root.iter("node"):
        nodes[n.get("id")] = (float(n.get("lat")), float(n.get("lon")))
        t = {x.get("k"): x.get("v") for x in n.findall("tag")}
        if t:
            ntags[n.get("id")] = t
    for w in root.iter("way"):
        t = {x.get("k"): x.get("v") for x in w.findall("tag")}
        if t.get("highway") in MOTOR:
            ways[w.get("id")] = (t, [nd.get("ref") for nd in w.findall("nd") if nd.get("ref") in nodes])
    return nodes, ntags, ways


def lanes_of(t, divided):
    try:
        n = int(float(t.get("lanes", "").split(";")[0]))
    except ValueError:
        n = 0
    one = t.get("oneway") in ("yes", "1", "-1")
    if n:
        return max(1, n) if one else max(1, round(n / 2))
    hw = t["highway"].replace("_link", "")
    d1, d2 = DEFAULT_LANES.get(hw, (2, 1))
    return d1 if one or divided else d2


def segments(values, L, minlen=150):
    """Run-length segments over 25 m bins, with runs shorter than minlen folded into a neighbour."""
    segs = []
    for i, v in enumerate(values):
        if segs and segs[-1][2] == v:
            segs[-1][1] = (i + 1) * BIN
        else:
            segs.append([i * BIN, (i + 1) * BIN, v])
    changed = True
    while changed and len(segs) > 1:
        changed = False
        for i, sg in enumerate(segs):
            if sg[1] - sg[0] < minlen:
                j = i - 1 if i > 0 and (i == len(segs) - 1 or segs[i - 1][1] - segs[i - 1][0] >= segs[i + 1][1] - segs[i + 1][0]) else i + 1
                lo, hi = min(segs[i][0], segs[j][0]), max(segs[i][1], segs[j][1])
                segs[j] = [lo, hi, segs[j][2]]
                del segs[i]
                changed = True
                break
    merged = []
    for sg in segs:
        if merged and merged[-1][2] == sg[2]:
            merged[-1][1] = sg[1]
        else:
            merged.append(sg)
    merged[-1][1] = round(L) + 1
    return merged


def build(area, cues, names):
    dirs = area["dirs"]
    A = Line(polyline(dirs[0]))
    B = Line(polyline(dirs[1])) if len(dirs) > 1 else None
    L = A.length
    allpts = A.pts + (B.pts if B else [])
    lats, lons = [p[0] for p in allpts], [p[1] for p in allpts]
    m = 0.0007
    nodes, ntags, ways = load_osm(fetch_bbox(area["id"], (min(lons) - m, min(lats) - m, max(lons) + m, max(lats) + m)))
    nbins = int(math.ceil(L / BIN))

    # ways that run along the corridor: close to it and parallel, in the A direction, the B direction or both
    along = {}  # way id -> "A" | "B" | "both"
    for wid, (t, refs) in ways.items():
        if t["highway"] not in MAIN or len(refs) < 2:
            continue
        good, votes = 0, {"A": 0, "B": 0}
        for a, b in zip(refs, refs[1:]):
            mid = ((nodes[a][0] + nodes[b][0]) / 2, (nodes[a][1] + nodes[b][1]) / 2)
            s, dist, _ = A.project(mid)
            if dist > 28 or s <= 0 or s >= L:
                continue
            seg_brg = bearing(nodes[a], nodes[b])
            off = turn(seg_brg, A.bearing_at(s))
            if off < 35:
                votes["A"] += 1
            elif off > 145:
                votes["B"] += 1
            else:
                continue
            good += 1
        if good < max(1, (len(refs) - 1) // 2):
            continue
        one = t.get("oneway") in ("yes", "1", "-1")
        if not one:
            along[wid] = "both"
        else:
            d = "A" if votes["A"] >= votes["B"] else "B"
            if t.get("oneway") == "-1":
                d = "B" if d == "A" else "A"
            along[wid] = d

    lanesA, lanesB, divided = [0] * nbins, [0] * nbins, [False] * nbins
    covA, covB = [None] * nbins, [None] * nbins
    for wid, d in along.items():
        t, refs = ways[wid]
        for a, b in zip(refs, refs[1:]):
            s1, s2 = A.project(nodes[a])[0], A.project(nodes[b])[0]
            for i in range(int(min(s1, s2) // BIN), int(max(s1, s2) // BIN) + 1):
                if 0 <= i < nbins:
                    if d in ("A", "both"):
                        covA[i] = (t, d)
                    if d in ("B", "both"):
                        covB[i] = (t, d)
    for i in range(nbins):
        divided[i] = bool(covA[i] and covB[i] and covA[i][1] == "A" and covB[i][1] == "B")
    # fill gaps from the nearest covered bin
    def filled(cov):
        out = list(cov)
        for i in range(nbins):
            if out[i] is None:
                near = [j for j in range(nbins) if cov[j] is not None]
                if near:
                    out[i] = cov[min(near, key=lambda j: abs(j - i))]
        return out
    fa, fb = filled(covA), filled(covB)
    for i in range(nbins):
        lanesA[i] = lanes_of(fa[i][0], divided[i]) if fa[i] else 2
        lanesB[i] = lanes_of(fb[i][0], divided[i]) if fb[i] else lanesA[i]
    lane_segs = segments(list(zip(lanesA, lanesB)), L)
    median_segs = segments(divided, L)

    def divided_at(s):
        return any(sg[2] and sg[0] <= s < sg[1] for sg in median_segs)

    spot_s = A.project((area["snapped"]["lat"], area["snapped"]["lon"]))[0]
    main_nodes = {n for wid in along for n in ways[wid][1]}

    def near(p, dmax):
        s, dist, side = A.project(p)
        return (s, side) if dist <= dmax and 15 < s < L - 15 else None

    # signals, one per junction, named by the cross street
    sigs = []
    for nid, t in ntags.items():
        if t.get("highway") != "traffic_signals":
            continue
        hit = near(nodes[nid], 40)
        # a junction's signals are often mapped once per approach: one control per junction
        if not hit or any(abs(hit[0] - s["s"]) < 90 for s in sigs):
            continue
        cross = None
        for wid, (wt, refs) in ways.items():
            if wid not in along and wt.get("name") and any(hav(nodes[r], nodes[nid]) < 40 for r in refs):
                cross = wt["name"]
                break
        at_spot = abs(hit[0] - spot_s) < 120 and not any(sg["name"] == area["name"] for sg in sigs)
        name = area["name"] if at_spot else (f"{cross} junction" if cross else f"Signal at {round(hit[0])} m")
        sigs.append({"s": round(hit[0]), "name": name})
    # TomTom's delay sits at the spot, so the spot needs something that meters traffic. Where no signal is
    # mapped near it, the junction is modelled as signal-controlled and the Lab says it is assumed.
    if not any(abs(sg["s"] - spot_s) < 150 for sg in sigs) and 60 < spot_s < L - 60:
        sigs.append({"s": round(spot_s), "name": area["name"], "assumed": True})
    sigs.sort(key=lambda x: x["s"])
    # one signal name per corridor: two signals on the same cross street are told apart by distance
    seen = {}
    for sg in sigs:
        if sg["name"] in seen:
            sg["name"] = f"{sg['name']} ({sg['s']} m)"
        seen[sg["name"]] = True
    signals = [{"s": sg["s"], "cycle": 120, "offset": i * 37, "name": sg["name"] + (" (assumed)" if sg.get("assumed") else "")} for i, sg in enumerate(sigs)]

    # bus stops on the side of the road they serve: left of A serves carriageway 0
    stops = []
    for nid, t in ntags.items():
        if not (t.get("highway") == "bus_stop" or (t.get("public_transport") == "platform" and t.get("bus") == "yes")):
            continue
        hit = near(nodes[nid], 35)
        if not hit:
            continue
        cw = 0 if hit[1] > 0 else 1
        if any(abs(hit[0] - b["s"]) < 30 and b["cw"] == cw for b in stops):
            continue
        stops.append({"s": round(hit[0]), "cw": cw, "name": t.get("name") or "Bus stop", "major": abs(hit[0] - spot_s) < 250})
    stops.sort(key=lambda x: x["s"])

    # side roads where a non-corridor road meets a corridor way
    sides = []
    for wid, (t, refs) in ways.items():
        if wid in along or t["highway"] in ("service", "living_street") and t.get("service") in ("parking_aisle", "driveway"):
            continue
        for end in {refs[0], refs[-1]} if refs else set():
            if end not in main_nodes:
                continue
            hit = near(nodes[end], 30)
            if not hit:
                continue
            other = refs[1] if end == refs[0] else refs[-2]
            side = A.project(nodes[other])[2]
            w = WEIGHT.get(t["highway"], 1)
            if divided_at(hit[0]):
                cws = [0] if side > 0 else [1]
            else:
                cws = [0, 1]
            for cw in cws:
                sides.append({"s": round(hit[0]), "cw": cw, "weight": w})
    sides.sort(key=lambda x: (x["s"], x["cw"]))

    # U-turn openings: detected median gaps where there is a median; elsewhere turning back is possible at side roads
    openings = sorted({round(near(c, 40)[0]) for c in cues if near(c, 40) and divided_at(near(c, 40)[0])})
    openings = [o for i, o in enumerate(openings) if i == 0 or o - openings[i - 1] > 30 and all(abs(o - s["s"]) > 35 for s in signals)]
    fixed = sorted({sd["s"] for sd in sides if not divided_at(sd["s"]) and sd["weight"] >= 1 and 60 < sd["s"] < L - 60})
    fixed = [f for i, f in enumerate(fixed) if i == 0 or f - fixed[i - 1] > 60]

    # kerb friction where the reports name it, around the spot
    friction = []
    causes = set(area["causes"])
    if causes & {"shared-autos", "bus-stop-in-lane", "private-buses"}:
        for cw in (0, 1):
            friction.append({"from": round(max(0, spot_s - 120)), "to": round(min(L, spot_s + 120)), "cw": cw, "speed": 14, "cause": "autos"})
    if causes & {"parking", "vendors", "encroachment"}:
        for cw in (0, 1):
            friction.append({"from": round(max(0, spot_s - 180)), "to": round(min(L, spot_s + 180)), "cw": cw, "speed": 18, "cause": "parking"})

    blocked = [{"from": 0, "to": 60, "why": "Corridor end"}, {"from": round(L) - 60, "to": round(L) + 1, "why": "Corridor end"}]
    blocked += [{"from": s["s"] - 60, "to": s["s"] + 60, "why": s["name"]} for s in signals]
    blocked += [{"from": b["s"] - 30, "to": b["s"] + 30, "why": "Bus stop"} for b in stops]
    blocked += [{"from": sg[0], "to": sg[1], "why": "No median here: U-turns at side roads"} for sg in median_segs if not sg[2]]

    nd = names.get(area["id"], {}).get("dirs", {})
    toward = [nd.get(d["tag"], {}).get("toward") or d["heading"] for d in dirs]
    hours = sorted({h["hour"] for h in dirs[0]["hours"]})
    targets = {}
    for h in hours:
        ra = next(x["ratio"] for x in dirs[0]["hours"] if x["hour"] == h)
        rb = next((x["ratio"] for x in dirs[1]["hours"] if x["hour"] == h), None) if len(dirs) > 1 else None
        targets[str(h)] = [ra, rb]

    return {
        "id": area["id"],
        "name": area["name"],
        "place": area["place"],
        "length": round(L),
        "spotS": round(spot_s),
        # carriageway 0 heads for the far end (TomTom's first direction), carriageway 1 back to the start
        "toward": [toward[0], toward[1] if len(toward) > 1 else f"back from {toward[0]}"],
        "heading": [dirs[0]["heading"], dirs[1]["heading"] if len(dirs) > 1 else None],
        "model": {
            "length": round(L),
            "lanes": [{"from": round(f), "to": round(t), "w": v[0], "e": v[1]} for f, t, v in lane_segs],
            "busStops": stops,
            "sideRoads": sides,
            "signals": signals,
            "kerbFriction": friction,
        },
        "medians": [{"from": round(f), "to": round(t)} for f, t, v in median_segs if v],
        "openings": openings,
        "fixedOpenings": fixed,
        "blocked": blocked,
        "targets": targets,
        "fix": {k: area["fix"][k] for k in ("type", "title")},
        "causes": area["causes"],
        "source": "TomTom route geometry; OpenStreetMap contributors (ODbL), extracted " + time.strftime("%Y-%m-%d"),
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    names = json.load(open(os.path.join(ROOT, "data", "directions.json")))
    cues = [(f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0]) for f in json.load(open(os.path.join(ROOT, "public", "data", "road-cues.json")))["features"] if f["properties"]["k"] == "uturn"]
    ids = [a["id"] for a in json.load(open(os.path.join(ROOT, "src", "data", "areas.json")))["areas"] if not a.get("pilot")]
    only = sys.argv[1:]
    for hid in ids:
        if only and hid not in only:
            continue
        area = json.load(open(os.path.join(ROOT, "public", "data", "areas", f"{hid}.json")))
        c = build(area, cues, names)
        json.dump(c, open(os.path.join(OUT, f"{hid}.json"), "w"), indent=1)
        m = c["model"]
        print(
            f"{c['name'][:30]:30s} {c['length']:5d} m  lanes {[(l['w'], l['e']) for l in m['lanes']]}  median {sum(x['to'] - x['from'] for x in c['medians'])} m  "
            f"sig {len(m['signals'])}  uturn {len(c['openings'])}+{len(c['fixedOpenings'])}  bus {len(m['busStops'])}  side {len(m['sideRoads'])}"
        )


if __name__ == "__main__":
    main()
