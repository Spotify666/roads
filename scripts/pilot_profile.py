"""Hour-by-hour TomTom historic travel times along the pilot corridor itself.

Uses the OSM carriageway geometry from data/corridor.json (westbound
Mehdipatnam -> Tolichowki, eastbound back) with waypoints every ~300 m, so the
simulation's "today" scenario can be calibrated against real typical times.
Output: data/pilot_profile.json.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
import tt  # noqa: E402
from tomtom_profiles import DAYS, HOURS, cached, hav, route  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")


def sample(pts, step=300):
    out, acc = [pts[0]], 0.0
    for a, b in zip(pts, pts[1:]):
        acc += hav(a, b)
        if acc >= step:
            out.append(b)
            acc = 0.0
    if out[-1] != pts[-1]:
        if hav(out[-1], pts[-1]) < step * 0.4:
            out[-1] = pts[-1]
        else:
            out.append(pts[-1])
    return out


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else "weekday"
    c = json.load(open(os.path.join(ROOT, "data", "corridor.json")))
    out_path = os.path.join(ROOT, "data", "pilot_profile.json")
    out = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for tag, poly in (("west", [(p[0], p[1]) for p in c["west"]]), ("east", [(p[0], p[1]) for p in c["east"]])):
        wps = sample(poly)
        # Drop waypoints that make a leg detour (a point TomTom can only reach the long way round).
        for attempt in range(6):
            name = f"pilot_{tag}_check{attempt}"
            r = route(name, wps, f"{DAYS[day]}T03:00:00+05:30")
            legs = r["routes"][0]["legs"]
            bad = [i for i, l in enumerate(legs) if l["summary"]["lengthInMeters"] > 1.5 * hav(wps[i], wps[i + 1]) + 80]
            if not bad:
                break
            i = bad[0]
            del wps[i + 1 if i + 1 < len(wps) - 1 else i]
        entry = out.setdefault(tag, {})
        if entry.get("waypoints") != [list(w) for w in wps]:
            entry.clear()
        entry["waypoints"] = wps
        rows = []
        for hr in HOURS:
            r = route(f"pilot_{tag}_{len(wps)}_{day}_{hr:02d}", wps, f"{DAYS[day]}T{hr:02d}:00:00+05:30")
            if "routes" not in r:
                print(tag, hr, "error", str(r)[:200])
                break
            legs = r["routes"][0]["legs"]
            rows.append({"hour": hr, "legs": [[l["summary"]["lengthInMeters"], l["summary"]["noTrafficTravelTimeInSeconds"],
                                               l["summary"]["historicTrafficTravelTimeInSeconds"]] for l in legs]})
        entry[day] = rows
        L = sum(l[0] for l in rows[0]["legs"]) if rows else 0
        print(tag, "length", L, "corridor", c["length_m"] if tag == "west" else c["length_east_m"])
        for row in rows:
            ff = sum(l[1] for l in row["legs"]); hi = sum(l[2] for l in row["legs"])
            print("  %02d:00 free %4ds  typical %4ds  x%.2f" % (row["hour"], ff, hi, hi / ff))
    json.dump(out, open(out_path, "w"))


if __name__ == "__main__":
    main()
