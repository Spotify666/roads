"""Package research, OSM and TomTom data for the website.

Writes:
  src/data/areas.json          summary per hotspot (for the city map and ranking)
  public/data/areas/<id>.json  full detail per hotspot (time-of-day profile per stretch)
  src/data/pilot.json          pilot corridor profile, calibration and geometry
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from tomtom_profiles import HOURS, bearing, hav  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW = os.path.join(ROOT, "data", "raw", "tomtom")


def load(name):
    return json.load(open(os.path.join(ROOT, "data", name)))


def compass(b):
    return ["northbound", "north-eastbound", "eastbound", "south-eastbound", "southbound", "south-westbound", "westbound", "north-westbound"][int(((b + 22.5) % 360) // 45)]


def simplify(pts, tol=6.0):
    """Douglas-Peucker in metres."""
    if len(pts) < 3:
        return pts
    lat0 = pts[0][0]
    xy = [((p[1] - pts[0][1]) * 111320 * math.cos(math.radians(lat0)), (p[0] - lat0) * 110540) for p in pts]

    def rec(i, j):
        ax, ay = xy[i]; bx, by = xy[j]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, idx = 0, None
        for k in range(i + 1, j):
            px, py = xy[k]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L
            if d > best:
                best, idx = d, k
        if best > tol and idx is not None:
            return rec(i, idx)[:-1] + rec(idx, j)
        return [i, j]

    return [pts[k] for k in rec(0, len(pts) - 1)]


def leg_geometry(hid, tag):
    path = os.path.join(RAW, f"prof_{hid}_{tag}_weekday_03.json")
    r = json.load(open(path))
    out = []
    for leg in r["routes"][0]["legs"]:
        pts = [(p["latitude"], p["longitude"]) for p in leg["points"]]
        out.append([[round(p[1], 6), round(p[0], 6)] for p in simplify(pts)])
    return out


def summarise_dir(hid, tag, d):
    rows = d["weekday"]["hours"]
    legs_len = [l[0] for l in rows[0]["legs"]]
    ff = [l[1] for l in rows[0]["legs"]]
    total_len = sum(legs_len)
    geom = leg_geometry(hid, tag)
    first, last = geom[0][0], geom[-1][-1]
    brg = bearing((first[1], first[0]), (last[1], last[0]))
    hours = []
    for row in rows:
        hist = [l[2] for l in row["legs"]]
        hours.append({
            "hour": row["hour"],
            "ratio": round(sum(hist) / max(1, sum(ff)), 3),
            "delay": sum(hist) - sum(ff),
            "legs": [round(h / max(1, f), 3) for h, f in zip(hist, ff)],
            "legDelay": [h - f for h, f in zip(hist, ff)],
        })
    peak = max(hours, key=lambda h: h["ratio"])
    am = max((h for h in hours if 7 <= h["hour"] <= 12), key=lambda h: h["ratio"])
    pm = max((h for h in hours if 16 <= h["hour"] <= 21), key=lambda h: h["ratio"])
    worst_leg = max(range(len(ff)), key=lambda i: peak["legDelay"][i])
    return {
        "tag": tag,
        "heading": compass(brg),
        "lengthM": total_len,
        "freeFlowS": sum(ff),
        "legs": [{"len": l, "ff": f, "geom": g} for l, f, g in zip(legs_len, ff, geom)],
        "hours": hours,
        "peak": {"hour": peak["hour"], "ratio": peak["ratio"], "delay": peak["delay"]},
        "am": {"hour": am["hour"], "ratio": am["ratio"], "delay": am["delay"]},
        "pm": {"hour": pm["hour"], "ratio": pm["ratio"], "delay": pm["delay"]},
        "worstLeg": worst_leg,
        "peakDelayPerKm": round(peak["delay"] / max(0.1, total_len / 1000)),
    }


def signals_from_osm(f):
    out = []
    n = f.get("nearest_bus_stop_m")
    if n is not None and n <= 60:
        out.append(f"Bus stop {n} m from the junction point")
    if f.get("bus_stops_250m", 0) >= 3:
        out.append(f"{f['bus_stops_250m']} bus stops within 250 m")
    if f.get("signals_250m", 0) >= 3:
        out.append(f"{f['signals_250m']} traffic signals within 250 m")
    lo, hi = f.get("lanes_min"), f.get("lanes_max")
    if lo and hi and hi > lo:
        out.append(f"Lane count changes between {lo} and {hi} within 250 m")
    if f.get("flyover"):
        out.append("Flyover above or beside the junction (ramps and U-turns below)")
    if f.get("crossings_250m", 0) >= 4:
        out.append(f"{f['crossings_250m']} mapped pedestrian crossings within 250 m")
    return out


def main():
    hs = load("hotspots.json")
    sources = load("sources.json")
    feats = load("osm_features.json")
    prof = load("profiles.json")
    os.makedirs(os.path.join(ROOT, "public", "data", "areas"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "src", "data"), exist_ok=True)
    summary = []
    for h in hs:
        f = feats[h["id"]]
        p = prof.get(h["id"], {})
        dirs = []
        for tag, d in sorted(p.get("dirs", {}).items()):
            if "weekday" in d and "hours" in d["weekday"] and len(d["weekday"]["hours"]) == len(HOURS):
                dirs.append(summarise_dir(h["id"], tag, d))
        worst = max(dirs, key=lambda d: d["peak"]["ratio"]) if dirs else None
        cites = sorted({r["src"] for r in h["reported"]} | {r["src"] for r in h["timeNotes"]})
        detail = {
            **h,
            "snapped": f["snapped"],
            "osm": {k: f.get(k) for k in ("signals_250m", "bus_stops_250m", "nearest_bus_stop_m", "crossings_250m", "lanes_min", "lanes_max", "flyover")},
            "osmSignals": signals_from_osm(f),
            "dirs": dirs,
            "sources": {k: sources[k] for k in cites},
            "freeFlowSpeed": p.get("freeFlowSpeed"),
            "frc": p.get("frc"),
        }
        json.dump(detail, open(os.path.join(ROOT, "public", "data", "areas", f"{h['id']}.json"), "w"), separators=(",", ":"))
        summary.append({
            "id": h["id"], "name": h["name"], "place": h["place"],
            "lat": f["snapped"]["lat"], "lon": f["snapped"]["lon"],
            "corporation": h["corporation"], "police": h["police"], "pilot": h.get("pilot", False),
            "causes": h["causes"], "fix": {k: h["fix"][k] for k in ("type", "title", "costLakh", "weeks", "agency")},
            "reportedCount": len(h["reported"]),
            "profile": None if not worst else {
                "heading": worst["heading"],
                "peak": worst["peak"], "am": worst["am"], "pm": worst["pm"],
                "peakDelayPerKm": worst["peakDelayPerKm"],
                "hours": [[x["hour"], x["ratio"]] for x in worst["hours"]],
                "dirs": len(dirs),
            },
            # every stretch of every direction, with its slowdown at each profile hour, for the city map
            "stretches": [
                {"g": leg["geom"], "r": [hr["legs"][i] for hr in d["hours"]]}
                for d in dirs for i, leg in enumerate(d["legs"])
            ],
        })
    summary.sort(key=lambda s: -(s["profile"]["peak"]["ratio"] if s["profile"] else 0))
    json.dump({"generated": __import__("time").strftime("%Y-%m-%d"), "hours": HOURS, "areas": summary},
              open(os.path.join(ROOT, "src", "data", "areas.json"), "w"), separators=(",", ":"))
    print("areas", len(summary))
    for s in summary[:12]:
        pr = s["profile"]
        print(f"  {s['name']:32s} peak x{pr['peak']['ratio']:.2f} at {pr['peak']['hour']:02d}:00  +{pr['peakDelayPerKm']}s/km  {pr['heading']}")

    # pilot corridor package
    corridor = load("corridor.json")
    pp = load("pilot_profile.json")
    cal = load("pilot_calibration.json") if os.path.exists(os.path.join(ROOT, "data", "pilot_calibration.json")) else None

    def pdir(rows):
        out = []
        for r in rows:
            ff = sum(l[1] for l in r["legs"]); hi = sum(l[2] for l in r["legs"])
            out.append({"hour": r["hour"], "free": ff, "typical": hi, "ratio": round(hi / ff, 3)})
        return out

    res_path = os.path.join(ROOT, "data", "pilot_results.json")
    results = json.load(open(res_path)) if os.path.exists(res_path) else None
    sel_path = os.path.join(ROOT, "data", "pilot_selection.json")
    if results and os.path.exists(sel_path):
        results["selection"] = json.load(open(sel_path))
    if results:
        hrs = sorted(int(h) for h in results["hours"])
        keys = ["vehHours", "vehKm", "fuel", "slowHours", "wrongside", "uturns", "trips"]

        def at(h, scen, k):
            if h in hrs:
                return results["hours"][str(h)][scen][k]
            lo = max([x for x in hrs if x < h], default=hrs[-1])
            hi = min([x for x in hrs if x > h], default=hrs[0])
            span = ((hi - lo) % 24) or 24
            t = ((h - lo) % 24) / span
            a_, b_ = results["hours"][str(lo)][scen][k], results["hours"][str(hi)][scen][k]
            return a_ + (b_ - a_) * t

        results["daily"] = {scen: {k: round(sum(at(h, scen, k) for h in range(24)), 1) for k in keys} for scen in ("today", "fix")}
    west_pts = [(p[0], p[1], p[2]) for p in corridor["west"]]

    def chain(pt):
        return min(west_pts, key=lambda w: hav((w[0], w[1]), pt))[2]

    def pstretches(tag):
        w = pp[tag]["waypoints"]
        rows = pp[tag]["weekday"]
        out = []
        for i in range(len(w) - 1):
            out.append({
                "from": round(chain(w[i])), "to": round(chain(w[i + 1])),
                "ff": rows[0]["legs"][i][1],
                "hours": [[r["hour"], round(r["legs"][i][2] / r["legs"][i][1], 3), r["legs"][i][2] - r["legs"][i][1]] for r in rows],
            })
        return out

    pilot = {
        "length": corridor["length_m"],
        "geometry": [[p[1], p[0]] for p in corridor["west"]],
        "east": [[p[1], p[0]] for p in corridor["east"]],
        "features": [f for f in corridor["features"] if f["kind"] != "crossing"],
        "lanes": corridor["lanes"],
        "tomtom": {"west": pdir(pp["west"]["weekday"]), "east": pdir(pp["east"]["weekday"])},
        "stretches": {tag: pstretches(tag) for tag in ("west", "east")},
        "calibration": cal,
        "results": results,
        "sumo": json.load(open(os.path.join(ROOT, "data", "sumo_validation.json"))) if os.path.exists(os.path.join(ROOT, "data", "sumo_validation.json")) else None,
        "source": corridor["source"],
    }
    json.dump(pilot, open(os.path.join(ROOT, "src", "data", "pilot.json"), "w"), separators=(",", ":"))


if __name__ == "__main__":
    main()
