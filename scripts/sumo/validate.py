"""Cross-check the RoadFix pilot model in SUMO, an established open-source traffic simulator.

Builds nothing by hand: the network comes from the same OpenStreetMap extract
(netconvert, left-hand traffic), and each hour gets the same calibrated
demand as the RoadFix simulation. SUMO's end-to-end slowdown is then compared
with TomTom's typical slowdown and with the RoadFix model.

Usage: python validate.py <workdir>   (needs eclipse-sumo installed; SUMO_HOME is found automatically)
Writes data/sumo_validation.json in the repository.
"""
import json, math, os, subprocess, sys, xml.etree.ElementTree as ET

import sumo  # eclipse-sumo wheel

os.environ.setdefault("SUMO_HOME", sumo.SUMO_HOME)
sys.path.append(os.path.join(os.environ["SUMO_HOME"], "tools"))
import sumolib  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
WORK = sys.argv[1] if len(sys.argv) > 1 else "."
NET = os.path.join(WORK, "corridor.net.xml")
BIN = os.path.join(os.path.dirname(sys.executable), "sumo")

START = (17.39538, 78.44066)  # Mehdipatnam
END = (17.39867, 78.41579)    # Tolichowki
MID = [(17.3962, 78.4335), (17.3978, 78.4225)]  # where side traffic joins: near Rethibowli and Salarjung Colony

net = sumolib.net.readNet(NET, withInternal=False)


def edges_near(lat, lon, r=60):
    x, y = net.convertLonLat2XY(lon, lat)
    out = []
    for e, d in net.getNeighboringEdges(x, y, r):
        if e.allows("passenger") and e.getFunction() != "internal":
            out.append((d, e))
    return [e for d, e in sorted(out, key=lambda t: t[0])]


def best_path(a, b, target_len):
    best = None
    for ea in edges_near(*a)[:6]:
        for eb in edges_near(*b)[:6]:
            path, cost = net.getShortestPath(ea, eb)
            if not path:
                continue
            length = sum(e.getLength() for e in path)
            score = abs(length - target_len)
            if best is None or score < best[0]:
                best = (score, path, length)
    return best


corr = json.load(open(os.path.join(ROOT, "data", "corridor.json")))
west = best_path(START, END, corr["length_m"])
east = best_path(END, START, corr["length_east_m"])
for tag, p in (("west", west), ("east", east)):
    print(tag, "route length", round(p[2]), "m over", len(p[1]), "edges")


def side_path(pt, dest, direction_path):
    """A route that joins the corridor mid-way: from an edge near pt that lies on the corridor path to its end."""
    ids = [e.getID() for e in direction_path]
    for e in edges_near(*pt, r=80):
        if e.getID() in ids:
            return [x for x in direction_path[ids.index(e.getID()):]]
    return None


VTYPES = """
  <vTypeDistribution id="mix">
    <vType id="2w" vClass="motorcycle" length="2.0" minGap="0.8" maxSpeed="16.5" accel="2.2" decel="4.5" sigma="0.6" latAlignment="arbitrary" minGapLat="0.3" probability="0.55"/>
    <vType id="car" vClass="passenger" length="4.5" minGap="1.6" maxSpeed="16.0" accel="1.6" decel="4.5" sigma="0.5" probability="0.25"/>
    <vType id="auto" vClass="passenger" length="3.0" width="1.4" minGap="1.2" maxSpeed="11.0" accel="1.3" decel="4.0" sigma="0.6" latAlignment="arbitrary" probability="0.12"/>
    <vType id="bus" vClass="bus" length="11.5" minGap="2.5" maxSpeed="13.0" accel="0.9" decel="3.5" sigma="0.4" probability="0.025"/>
    <vType id="lcv" vClass="delivery" length="6.5" minGap="2.0" maxSpeed="13.0" accel="1.0" decel="3.8" sigma="0.5" probability="0.055"/>
  </vTypeDistribution>"""


def write_routes(path, qW, qE):
    sideW = side_path(MID[0], END, west[1])
    sideE = side_path(MID[1], START, east[1])
    lines = ["<routes>", VTYPES]
    lines.append(f'  <route id="rW" edges="{" ".join(e.getID() for e in west[1])}"/>')
    lines.append(f'  <route id="rE" edges="{" ".join(e.getID() for e in east[1])}"/>')
    if sideW:
        lines.append(f'  <route id="sW" edges="{" ".join(e.getID() for e in sideW)}"/>')
    if sideE:
        lines.append(f'  <route id="sE" edges="{" ".join(e.getID() for e in sideE)}"/>')
    lines.append(f'  <flow id="thrW" type="mix" route="rW" begin="0" end="3900" vehsPerHour="{qW:.0f}" departLane="best" departSpeed="max"/>')
    lines.append(f'  <flow id="thrE" type="mix" route="rE" begin="0" end="3900" vehsPerHour="{qE:.0f}" departLane="best" departSpeed="max"/>')
    if sideW:
        lines.append(f'  <flow id="sideW" type="mix" route="sW" begin="0" end="3900" vehsPerHour="{qW * 0.32 * 0.5:.0f}" departLane="best"/>')
    if sideE:
        lines.append(f'  <flow id="sideE" type="mix" route="sE" begin="0" end="3900" vehsPerHour="{qE * 0.32 * 0.5:.0f}" departLane="best"/>')
    lines.append("</routes>")
    open(path, "w").write("\n".join(lines))


def run(qW, qE, seed=1):
    rou = os.path.join(WORK, f"r_{int(qW)}_{int(qE)}.rou.xml")
    out = os.path.join(WORK, f"t_{int(qW)}_{int(qE)}.xml")
    write_routes(rou, qW, qE)
    cmd = [BIN, "-n", NET, "-r", rou, "--begin", "0", "--end", "4500", "--tripinfo-output", out,
           "--lateral-resolution", "0.8", "--seed", str(seed), "--no-step-log", "true", "--no-warnings", "true",
           "--time-to-teleport", "300"]
    subprocess.run(cmd, check=True, capture_output=True)
    times = {"thrW": [], "thrE": []}
    for t in ET.parse(out).getroot().iter("tripinfo"):
        fid = t.get("id").split(".")[0]
        if fid in times and float(t.get("depart")) > 300:
            times[fid].append(float(t.get("duration")) + float(t.get("departDelay", 0)))
    return [sum(v) / max(1, len(v)) for v in (times["thrW"], times["thrE"])], [len(times["thrW"]), len(times["thrE"])]


def main():
    cal = json.load(open(os.path.join(ROOT, "data", "pilot_calibration.json")))
    base, _ = run(150, 150)
    print("free-flow through times", [round(b) for b in base])
    rows = []
    for h in sorted(int(k) for k in cal["hours"]):
        c = cal["hours"][str(h)]
        if max(c["target"]) < 1.08:
            continue
        t, n = run(c["qW"], c["qE"])
        row = {
            "hour": h, "qW": c["qW"], "qE": c["qE"],
            "tomtom": [round(x, 3) for x in c["target"]],
            "roadfix": [round(x, 3) for x in c["got"]],
            "sumo": [round(t[0] / base[0], 3), round(t[1] / base[1], 3)],
            "trips": n,
        }
        rows.append(row)
        print(h, row)
    json.dump({"base": base, "routes": {"west": round(west[2]), "east": round(east[2])}, "hours": rows},
              open(os.path.join(ROOT, "data", "sumo_validation.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
