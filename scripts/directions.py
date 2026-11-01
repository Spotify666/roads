"""Name each spot's directions by where they lead: "Towards Secunderabad, via Boiguda" alongside "northbound".

For each direction of a spot's TomTom corridor:
- "toward" is the well-known destination the road heads for: the hub, from a list of places people
  navigate by, that lies most squarely ahead of the corridor's far end within 9 km;
- "via" is the next locality, looked up (Nominatim, OpenStreetMap) a little beyond the far end.
The spot's own locality is never used, so a direction does not point at the place you are already in.

Writes data/directions.json: {spot id: {"here": locality, "dirs": {tag: {"toward", "via"}}}}.
"""
import json, math, os, re, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from tomtom_profiles import bearing, hav  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
CACHE = os.path.join(ROOT, "data", "raw", "nominatim.json")
UA = {"User-Agent": "RoadFixHyderabad/1.0 (niteshm98m@gmail.com)"}
# localities named after a whole zone or the city are no help as a direction
TOO_BROAD = {"Hyderabad", "Secunderabad Cantonment", "Greater Hyderabad Municipal Corporation", "Telangana", "Rangareddy", "Medchal"}

# places people give directions by in Hyderabad
HUBS = [
    "Secunderabad", "Abids", "Koti", "Charminar", "Mehdipatnam", "Tolichowki", "Masab Tank", "Lakdikapul", "Khairatabad",
    "Nampally", "Panjagutta", "Ameerpet", "Begumpet", "Banjara Hills", "Jubilee Hills", "Madhapur", "HITEC City",
    "Gachibowli", "Kondapur", "Kukatpally", "Miyapur", "Balanagar", "Bowenpally", "Alwal", "Kompally", "Tarnaka",
    "Habsiguda", "Uppal", "LB Nagar", "Dilsukhnagar", "Malakpet", "Saroornagar", "Vanasthalipuram", "Santosh Nagar",
    "Chandrayangutta", "Aramghar", "Attapur", "Rajendranagar", "Shamshabad", "Narsingi", "Financial District", "Raidurg",
    "Manikonda", "Musheerabad", "Himayatnagar", "Somajiguda", "Erragadda", "Sanathnagar", "ECIL", "Malkajgiri", "Nagole",
    "Falaknuma", "Bahadurpura", "Langar Houz", "Golconda", "Shaikpet", "Lingampally", "Chandanagar", "Moosapet",
    "Jeedimetla", "Kothapet", "Chikkadpally", "Amberpet", "Nallakunta", "Ramanthapur", "Narayanguda",
]

cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def clean(name):
    """'Ward 106 Serilingampally' -> 'Serilingampally'; 'Marredpally mandal' -> 'Marredpally'."""
    name = re.sub(r"^Ward \d+\s+", "", name)
    name = re.sub(r"\s+(mandal|Mandal)$", "", name)
    return name.strip()


def locate(place):
    key = f"search:{place}"
    if key not in cache:
        q = urllib.parse.urlencode(
            {"format": "jsonv2", "q": f"{place}, Hyderabad", "limit": 1, "viewbox": "78.20,17.65,78.75,17.20", "bounded": 1, "accept-language": "en"}
        )
        with urllib.request.urlopen(urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{q}", headers=UA), timeout=60) as r:
            hit = json.load(r)
        cache[key] = [float(hit[0]["lat"]), float(hit[0]["lon"])] if hit else None
        json.dump(cache, open(CACHE, "w"))
        time.sleep(1.1)
    return cache[key]


def reverse(lat, lon):
    key = f"{lat:.4f},{lon:.4f}"
    if key not in cache:
        q = urllib.parse.urlencode({"format": "jsonv2", "lat": f"{lat:.5f}", "lon": f"{lon:.5f}", "zoom": 15, "accept-language": "en"})
        with urllib.request.urlopen(urllib.request.Request(f"https://nominatim.openstreetmap.org/reverse?{q}", headers=UA), timeout=60) as r:
            cache[key] = json.load(r).get("address", {})
        json.dump(cache, open(CACHE, "w"))
        time.sleep(1.1)  # Nominatim's limit is one request a second
    return cache[key]


def localities(addr):
    """Candidate names from most to least local, skipping zone-wide names."""
    out = []
    for k in ("neighbourhood", "quarter", "suburb", "village", "town"):
        v = addr.get(k)
        v = clean(v) if v else v
        if v and v not in TOO_BROAD and not any(b in v for b in TOO_BROAD) and v not in out:
            out.append(v)
    return out


def ahead(p, brg, metres):
    lat, lon = p
    d = metres / 6371000
    b = math.radians(brg)
    la1, lo1 = math.radians(lat), math.radians(lon)
    la2 = math.asin(math.sin(la1) * math.cos(d) + math.cos(la1) * math.sin(d) * math.cos(b))
    lo2 = lo1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(la1), math.cos(d) - math.sin(la1) * math.sin(la2))
    return math.degrees(la2), math.degrees(lo2)


def main():
    areas = json.load(open(os.path.join(ROOT, "src", "data", "areas.json")))["areas"]
    hubs = {h: locate(h) for h in HUBS}
    hubs = {h: p for h, p in hubs.items() if p}
    out = {}
    for a in areas:
        d = json.load(open(os.path.join(ROOT, "public", "data", "areas", f"{a['id']}.json")))
        here_addr = reverse(d["snapped"]["lat"], d["snapped"]["lon"])
        here = localities(here_addr)
        names = {}
        for dr in d["dirs"]:
            pts = [(p[1], p[0]) for leg in dr["legs"] for p in leg["geom"]]
            end = pts[-1]
            # heading over the last ~300 m, carried on 1.2 km beyond the corridor
            back = next((p for p in reversed(pts) if hav(p, end) > 300), pts[0])
            beyond = ahead(end, bearing(back, end), 1200)
            choice = None
            for addr in (reverse(*beyond), reverse(*end)):
                for name in reversed(localities(addr)):  # prefer the broader, better-known locality
                    if name not in here and name not in a["name"] and all(name != v["via"] for v in names.values()):
                        choice = name
                        break
                if choice:
                    break
            via = choice or (localities(reverse(*end)) or [None])[0]
            # the hub most squarely ahead: angle off the final heading weighs against distance
            heading = bearing(back, end)
            spot = (d["snapped"]["lat"], d["snapped"]["lon"])
            best, score = None, 1e18
            for h, p in hubs.items():
                # never point a spot at itself: its own locality, or a hub its name already carries
                if h in here or h.lower() in a["name"].lower():
                    continue
                dist = hav(end, p)
                if hav(spot, p) < 900 or dist > 9000:
                    continue
                off = abs((bearing(end, p) - heading + 540) % 360 - 180)
                if off > 40:
                    continue
                sc = dist * (1 + off / 25)
                if sc < score:
                    best, score = h, sc
            toward = best or via
            names[dr["tag"]] = {"toward": toward, "via": via if via and via != toward else None}
        # two directions that name the same hub get their localities instead
        if len(names) == 2:
            a1, a2 = names.values()
            if a1["toward"] == a2["toward"]:
                for v in names.values():
                    v["toward"], v["via"] = v["via"] or v["toward"], None
        out[a["id"]] = {"here": (here or [None])[-1], "dirs": names}
        print(f"{a['name']:34s} {out[a['id']]['here'] or '-':18s} " + "  ".join(f"{dr['heading']}→{names[dr['tag']]['toward']} (via {names[dr['tag']]['via']})" for dr in d["dirs"]))
    json.dump(out, open(os.path.join(ROOT, "data", "directions.json"), "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
