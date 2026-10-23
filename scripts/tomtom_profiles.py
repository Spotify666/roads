"""Build hour-by-hour congestion profiles for each hotspot corridor.

For every hotspot:
  1. Ask TomTom Traffic Flow for the road segment at the snapped point; its
     geometry gives on-road points in the direction of travel.
  2. Pick A and B about 800 m either side of the hotspot along that geometry,
     route A->B (and B->A) and reject routes that detour.
  3. Sample waypoints every ~300 m along the accepted route, so each leg is a
     short stretch of road.
  4. For a typical weekday (and later a Sunday), route the waypoint chain at a
     set of departure hours. TomTom returns historic-traffic travel time per
     leg, which tells us when, and on which stretch, the corridor jams.

Results are cached in data/raw/tomtom so the script can resume, and written to
data/profiles.json. Every API call is logged in data/raw/tomtom_calls.log.
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(__file__))
import tt  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW = os.path.join(ROOT, "data", "raw", "tomtom")
os.makedirs(RAW, exist_ok=True)

DAYS = {"weekday": "2026-10-28", "sunday": "2026-11-01"}
HOURS = [0, 3, 6, 7, 8, 9, 10, 11, 12, 14, 16, 17, 18, 19, 20, 21, 22]
HALF = 800      # metres either side of the hotspot
STEP = 300      # waypoint spacing along the route


def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def cached(name, fn):
    path = os.path.join(RAW, name + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    data = fn()
    if "error" not in data:
        json.dump(data, open(path, "w"))
    return data


def bearing(a, b):
    la1, la2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    x = math.sin(dl) * math.cos(la2)
    y = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dl)
    return math.degrees(math.atan2(x, y)) % 360


def offset(p, brg, dist):
    b = math.radians(brg)
    dlat = dist * math.cos(b) / 6371000
    dlon = dist * math.sin(b) / (6371000 * math.cos(math.radians(p[0])))
    return (p[0] + math.degrees(dlat), p[1] + math.degrees(dlon))


def walk(poly, i, dist, step):
    """Walk along poly from vertex i by `dist` metres in direction step (+1/-1)."""
    acc = 0.0
    j = i
    while 0 <= j + step < len(poly):
        d = hav(poly[j], poly[j + step])
        if acc + d >= dist:
            t = (dist - acc) / d if d else 0
            a, b = poly[j], poly[j + step]
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), dist
        acc += d
        j += step
    # segment ended early: carry on in a straight line along its last bearing
    if acc < dist and len(poly) >= 2:
        k = j - step if 0 <= j - step < len(poly) else j
        brg = bearing(poly[k], poly[j]) if k != j else 0
        return offset(poly[j], brg, dist - acc), dist
    return poly[j], acc


def loc(points):
    return ":".join(f"{p[0]:.6f},{p[1]:.6f}" for p in points)


def route(name, points, depart):
    return cached(name, lambda: tt.get(
        f"routing/1/calculateRoute/{loc(points)}/json",
        departAt=depart, traffic="true", computeTravelTimeFor="all",
        routeType="fastest", travelMode="car"))


def route_points(r):
    pts = []
    for leg in r["routes"][0]["legs"]:
        pts += [(p["latitude"], p["longitude"]) for p in leg["points"]]
    return pts


def sample(pts, step):
    out = [pts[0]]
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        acc += hav(a, b)
        if acc >= step:
            out.append(b)
            acc = 0.0
    if hav(out[-1], pts[-1]) > step * 0.4:
        out.append(pts[-1])
    else:
        out[-1] = pts[-1]
    return out


def min_dist(pts, p):
    return min(hav(q, p) for q in pts)


def corridor(h, snap):
    hid = h["id"]
    flow = cached(f"flow_{hid}", lambda: tt.get(
        "traffic/services/4/flowSegmentData/absolute/13/json",
        point=f"{snap['lat']:.6f},{snap['lon']:.6f}", unit="KMPH"))
    if "flowSegmentData" not in flow:
        return {"error": f"flow: {flow}"}
    if flow["flowSegmentData"].get("frc") in ("FRC5", "FRC6", "FRC7"):
        # matched a side lane; ask again at a zoom where only main roads are considered
        flow = cached(f"flow_{hid}_z11", lambda: tt.get(
            "traffic/services/4/flowSegmentData/absolute/11/json",
            point=f"{snap['lat']:.6f},{snap['lon']:.6f}", unit="KMPH"))
    fs = flow["flowSegmentData"]
    poly = [(c["latitude"], c["longitude"]) for c in fs["coordinates"]["coordinate"]]
    i = min(range(len(poly)), key=lambda k: hav(poly[k], (snap["lat"], snap["lon"])))
    A, da = walk(poly, i, HALF, -1)
    B, db = walk(poly, i, HALF, +1)
    if da + db < 400:
        return {"error": "flow segment too short", "flow": fs}
    center = (snap["lat"], snap["lon"])
    dirs = {}
    for tag, (o, d) in {"ab": (A, B), "ba": (B, A)}.items():
        r = route(f"val_{hid}_{tag}", [o, d], f"{DAYS['weekday']}T03:00:00+05:30")
        if "routes" not in r:
            continue
        pts = route_points(r)
        length = r["routes"][0]["summary"]["lengthInMeters"]
        straight = hav(o, d)
        if length > 1.6 * straight + 250 or min_dist(pts, center) > 90:
            dirs[tag] = {"rejected": True, "length": length, "straight": round(straight)}
            continue
        wps = sample(pts, STEP)
        dirs[tag] = {"waypoints": wps, "length": length}
    if "waypoints" not in dirs.get("ba", {}):
        # Divided road: the other direction is a separate carriageway. Probe
        # 15 m either side of the segment for a polyline running the other way.
        brg = bearing(poly[max(i - 1, 0)], poly[min(i + 1, len(poly) - 1)])
        for side, dist in ((90, 15), (-90, 15), (90, 35), (-90, 35)):
            p = offset(center, brg + side, dist)
            f2 = cached(f"flow_{hid}_opp{side}_{dist}", lambda p=p: tt.get(
                "traffic/services/4/flowSegmentData/absolute/13/json",
                point=f"{p[0]:.6f},{p[1]:.6f}", unit="KMPH"))
            if "flowSegmentData" not in f2 or f2["flowSegmentData"].get("frc") != fs.get("frc"):
                continue  # missing, or a different road such as a flyover above
            poly2 = [(c["latitude"], c["longitude"]) for c in f2["flowSegmentData"]["coordinates"]["coordinate"]]
            j = min(range(len(poly2)), key=lambda k: hav(poly2[k], center))
            b2 = bearing(poly2[max(j - 1, 0)], poly2[min(j + 1, len(poly2) - 1)])
            if abs(((b2 - brg + 180) % 360) - 180) < 120:
                continue  # same direction as before
            A2, _ = walk(poly2, j, HALF, -1)
            B2, _ = walk(poly2, j, HALF, +1)
            r = route(f"val_{hid}_ba2", [A2, B2], f"{DAYS['weekday']}T03:00:00+05:30")
            if "routes" not in r:
                continue
            pts = route_points(r)
            length = r["routes"][0]["summary"]["lengthInMeters"]
            if length > 1.6 * hav(A2, B2) + 250 or min_dist(pts, center) > 90:
                continue
            dirs["ba"] = {"waypoints": sample(pts, STEP), "length": length}
            break
    return {
        "frc": fs.get("frc"), "freeFlowSpeed": fs.get("freeFlowSpeed"),
        "segment": poly, "dirs": dirs,
    }


def profile(hid, tag, wps, day):
    rows = []
    for hr in HOURS:
        r = route(f"prof_{hid}_{tag}_{day}_{hr:02d}", wps, f"{DAYS[day]}T{hr:02d}:00:00+05:30")
        if "routes" not in r:
            return {"error": str(r)[:200], "hours": rows}
        legs = r["routes"][0]["legs"]
        rows.append({
            "hour": hr,
            "legs": [[l["summary"]["lengthInMeters"], l["summary"]["noTrafficTravelTimeInSeconds"],
                      l["summary"]["historicTrafficTravelTimeInSeconds"]] for l in legs],
        })
    return {"hours": rows}


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else "weekday"
    only = sys.argv[2:] or None
    hs = json.load(open(os.path.join(ROOT, "data", "hotspots.json")))
    feats = json.load(open(os.path.join(ROOT, "data", "osm_features.json")))
    out_path = os.path.join(ROOT, "data", "profiles.json")
    out = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for h in hs:
        if only and h["id"] not in only:
            continue
        snap = feats[h["id"]]["snapped"]
        c = corridor(h, snap)
        entry = out.get(h["id"], {})
        entry.update({k: v for k, v in c.items() if k != "dirs"})
        entry.setdefault("dirs", {})
        for tag, d in c.get("dirs", {}).items():
            prev = entry["dirs"].get(tag, {})
            e = dict(d)
            if json.dumps(prev.get("waypoints")) == json.dumps(d.get("waypoints")):
                e.update({k: v for k, v in prev.items() if k in DAYS})
            entry["dirs"][tag] = e
            if d.get("rejected"):
                continue
            # check the waypoint chain does not detour
            chk = route(f"prof_{h['id']}_{tag}_{day}_03", d["waypoints"], f"{DAYS[day]}T03:00:00+05:30")
            if "routes" not in chk or chk["routes"][0]["summary"]["lengthInMeters"] > 1.25 * d["length"] + 150:
                e["rejected"] = True
                e["reason"] = "waypoint chain detours"
                continue
            e[day] = profile(h["id"], tag, d["waypoints"], day)
        out[h["id"]] = entry
        ok = [t for t, d in entry["dirs"].items() if day in d]
        print(h["id"], "dirs ok:", ok, "rejected:", [t for t, d in entry["dirs"].items() if d.get("rejected")], flush=True)
        json.dump(out, open(out_path, "w"))


if __name__ == "__main__":
    main()
