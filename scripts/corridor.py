"""Extract the Mehdipatnam–Tolichowki pilot corridor from OpenStreetMap.

Builds a 1-D model of the corridor for the simulation: the chainage (metres
from Mehdipatnam) of every side road, bus stop, signal, crossing and median
opening, plus the corridor polyline for drawing. Output: data/corridor.json.
"""
import json, math, os, sys, time, urllib.request
import xml.etree.ElementTree as ET

UA = {"User-Agent": "RoadFixHyderabad/1.0 (niteshm98m@gmail.com)"}
ROOT = os.path.join(os.path.dirname(__file__), "..")
CACHE = os.path.join(ROOT, "data", "raw", "osm")
os.makedirs(CACHE, exist_ok=True)

START = (17.39538, 78.44066)   # Mehdipatnam bus stop
END = (17.39867, 78.41579)     # Tolichowki
TILES = [(78.4085, 17.3905, 78.4215, 17.4030), (78.4205, 17.3905, 78.4335, 17.4030), (78.4325, 17.3905, 78.4470, 17.4030)]
MAIN_NAMES = {"Golkonda Road", "Tolichowki Road", "Old Bombay Highway"}


def fetch(b):
    path = os.path.join(CACHE, "corridor_%.4f_%.4f_%.4f_%.4f.xml" % b)
    if os.path.exists(path):
        return open(path, "rb").read()
    url = "https://api.openstreetmap.org/api/0.6/map?bbox=%.4f,%.4f,%.4f,%.4f" % b
    raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
    open(path, "wb").write(raw)
    time.sleep(1)
    return raw


def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def load():
    nodes, ntags, ways = {}, {}, {}
    for b in TILES:
        root = ET.fromstring(fetch(b))
        for n in root.iter("node"):
            nodes[n.get("id")] = (float(n.get("lat")), float(n.get("lon")))
            t = {x.get("k"): x.get("v") for x in n.findall("tag")}
            if t:
                ntags[n.get("id")] = t
        for w in root.iter("way"):
            t = {x.get("k"): x.get("v") for x in w.findall("tag")}
            if "highway" in t:
                ways[w.get("id")] = (t, [nd.get("ref") for nd in w.findall("nd")])
    return nodes, ntags, ways


def main():
    nodes, ntags, ways = load()
    main_ways = {wid: (t, r) for wid, (t, r) in ways.items()
                 if t["highway"] in ("trunk", "primary")
                 and t.get("bridge") != "yes" and (t.get("name") in MAIN_NAMES or "NH163" in (t.get("ref") or ""))}
    # graph over main-road nodes, then shortest path START->END for each direction
    import heapq
    adj = {}
    for wid, (t, refs) in main_ways.items():
        refs = [r for r in refs if r in nodes]
        oneway = t.get("oneway") == "yes"
        for a, b in zip(refs, refs[1:]):
            d = hav(nodes[a], nodes[b])
            adj.setdefault(a, []).append((b, d, wid))
            if not oneway:
                adj.setdefault(b, []).append((a, d, wid))

    def nearest(p):
        return min(adj, key=lambda n: hav(nodes[n], p))

    def dijkstra(s):
        dist, prev = {s: 0}, {}
        pq = [(0, s)]
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]:
                continue
            for v, w, _ in adj.get(u, []):
                if d + w < dist.get(v, 1e18):
                    dist[v] = d + w
                    prev[v] = u
                    heapq.heappush(pq, (d + w, v))
        return dist, prev

    def path(sp, ep):
        """Shortest drivable path from near sp to near ep (each carriageway is one-way)."""
        best = None
        for s in [n for n in adj if hav(nodes[n], sp) < 80]:
            dist, prev = dijkstra(s)
            e = min(dist, key=lambda n: hav(nodes[n], ep))
            score = (round(hav(nodes[e], ep) / 20), dist[e])
            if best is None or score < best[0]:
                out = [e]
                while out[-1] != s:
                    out.append(prev[out[-1]])
                best = (score, out[::-1])
        return best[1]

    west = path(START, END)   # Mehdipatnam -> Tolichowki (westbound)
    east = path(END, START)   # Tolichowki -> Mehdipatnam (eastbound)

    def chain(seq):
        c, acc = {}, 0.0
        for i, n in enumerate(seq):
            if i:
                acc += hav(nodes[seq[i - 1]], nodes[n])
            c[n] = acc
        return c

    cw, ce = chain(west), chain(east)
    L = max(cw.values())

    def project(p):
        """chainage (from Mehdipatnam) of the westbound polyline point nearest to p"""
        best = min(west, key=lambda n: hav(nodes[n], p))
        return cw[best], hav(nodes[best], p)

    west_set, east_set = set(west), set(east)
    features = []
    # side roads: non-main highways touching a main-road node on our path
    main_node_ways = {}
    for wid, (t, refs) in ways.items():
        for r in refs:
            main_node_ways.setdefault(r, []).append(wid)
    seen = set()
    for n in west + east:
        for wid in main_node_ways.get(n, []):
            if wid in main_ways:
                continue
            t, refs = ways[wid]
            hw = t["highway"]
            if hw in ("footway", "path", "steps", "cycleway", "pedestrian", "corridor", "elevator"):
                continue
            key = (wid, n)
            if key in seen:
                continue
            seen.add(key)
            other = [r for r in refs if r in nodes and r != n]
            touches_both = any(r in west_set for r in refs) and any(r in east_set for r in refs)
            length = sum(hav(nodes[a], nodes[b]) for a, b in zip(refs, refs[1:]) if a in nodes and b in nodes)
            side = "north" if n in east_set and n not in west_set else "south" if n in west_set and n not in east_set else "both"
            ch, _ = project(nodes[n])
            if touches_both and length < 60:
                kind = "median_opening"
            else:
                kind = "side_road"
            features.append({"kind": kind, "chainage": round(ch), "highway": hw, "name": t.get("name"),
                             "side": side, "way": wid, "len": round(length)})
    for nid, t in ntags.items():
        p = nodes[nid]
        ch, off = project(p)
        if off > 40 or ch <= 1 or ch >= L - 1:
            continue
        if t.get("highway") == "bus_stop" or (t.get("public_transport") == "platform" and t.get("bus") == "yes"):
            dw = min(hav(nodes[n], p) for n in west)
            de = min(hav(nodes[n], p) for n in east)
            features.append({"kind": "bus_stop", "chainage": round(ch), "name": t.get("name"), "offset": round(off),
                             "carriageway": "west" if dw <= de else "east"})
        elif t.get("highway") == "traffic_signals":
            features.append({"kind": "signal", "chainage": round(ch), "name": t.get("name")})
        elif t.get("highway") == "crossing":
            features.append({"kind": "crossing", "chainage": round(ch)})
        elif t.get("highway") == "turning_circle" or t.get("highway") == "turning_loop":
            features.append({"kind": "median_opening", "chainage": round(ch), "name": t.get("name"), "source": "node"})

    # de-duplicate features of the same kind within 25 m
    features.sort(key=lambda f: (f["kind"], f["chainage"]))
    dedup = []
    for f in features:
        if dedup and dedup[-1]["kind"] == f["kind"] and abs(dedup[-1]["chainage"] - f["chainage"]) < 25 and f["kind"] != "side_road":
            continue
        dedup.append(f)
    dedup.sort(key=lambda f: f["chainage"])

    lanes = []
    for wid, (t, refs) in main_ways.items():
        refs = [r for r in refs if r in nodes]
        if not refs or not (set(refs) & west_set):
            continue
        a, b = project(nodes[refs[0]])[0], project(nodes[refs[-1]])[0]
        lanes.append({"from": round(min(a, b)), "to": round(max(a, b)), "lanes": t.get("lanes"), "oneway": t.get("oneway"), "name": t.get("name"), "maxspeed": t.get("maxspeed")})
    lanes.sort(key=lambda x: x["from"])

    out = {
        "name": "Mehdipatnam – Tolichowki",
        "length_m": round(L),
        "length_east_m": round(max(ce.values())),
        "west": [[round(nodes[n][0], 6), round(nodes[n][1], 6), round(cw[n])] for n in west],
        "east": [[round(nodes[n][0], 6), round(nodes[n][1], 6)] for n in east],
        "features": dedup,
        "lanes": lanes,
        "source": "OpenStreetMap contributors (ODbL), extracted " + time.strftime("%Y-%m-%d"),
    }
    json.dump(out, open(os.path.join(ROOT, "data", "corridor.json"), "w"), indent=1)
    print("length", round(L), "east", round(max(ce.values())), "nodes", len(west), len(east))
    from collections import Counter
    print(Counter(f["kind"] for f in dedup))
    for f in dedup:
        if f["kind"] != "crossing":
            print(f)
    for l in lanes:
        print(l)


if __name__ == "__main__":
    main()
