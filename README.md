# RoadFix Hyderabad

Where Hyderabad jams, when, why, and the cheap fix for each junction, with a
before-and-after traffic simulation of the Mehdipatnam–Tolichowki corridor.

**Live site:** https://roadfix-hyderabad.vercel.app

## What is in here

| Path | What it does |
| --- | --- |
| `data/hotspots.json`, `data/sources.json` | 41 hotspots with cited causes and a recommended low-cost fix each |
| `scripts/osm_features.py` | Snaps each hotspot to its main road in OpenStreetMap and derives layout signals (bus stops, signals, lane changes) |
| `scripts/tomtom_profiles.py` | Hour-by-hour TomTom historical travel times per ~300 m stretch for every hotspot |
| `scripts/corridor.py`, `scripts/pilot_profile.py` | The pilot corridor's layout from OSM, and its TomTom profile in both directions |
| `src/sim/engine.ts` | Microscopic traffic simulation (IDM car-following, lane changes, bus stops, signals, U-turns, wrong-side riding) |
| `src/sim/optimize.ts` | Exact dynamic programme for U-turn opening placement, per goal |
| `src/sim/scenario.ts`, `src/sim/lab.worker.ts` | Simulation Lab: a visitor's road design (U-turns, one-way, bus lane, lane drop, signals, enforcement), its cost, and the in-browser test run |
| `scripts/sim/*.ts` | Calibration to TomTom, optimiser, simulation-based layout selection |
| `scripts/sumo/validate.py` | Independent cross-check of the pilot in SUMO |
| `supabase/functions/poll-traffic` | Edge function that records live TomTom speeds and incidents every 30 minutes |
| `src/app` | The Next.js site: full-screen city map, area pages, Simulation Lab, info page, printable reports |

## Running it

```bash
npm install
npm run dev            # needs TOMTOM_API_KEY, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY in .env.local
```

Rebuilding the data (each step caches API responses in `data/raw/`, which is not committed):

```bash
python3 scripts/osm_features.py
TOMTOM_API_KEY=... python3 scripts/tomtom_profiles.py weekday
python3 scripts/corridor.py
TOMTOM_API_KEY=... python3 scripts/pilot_profile.py weekday
npx tsx scripts/sim/calibrate.ts && npx tsx scripts/sim/calibrate-night.ts
npx tsx scripts/sim/optimise-pilot.ts
npx tsx scripts/sim/select-layout.ts
FORCE_OPENINGS=$(cat data/raw/chosen.txt) npx tsx scripts/sim/optimise-pilot.ts
python3 scripts/build_site_data.py
npx tsx scripts/sim/lab-baselines.ts   # today and plan reference runs for the Lab
```

TomTom's free tier allows 2,500 calls a day; a full weekday profile build uses about 1,600.

## Data and credits

Traffic data © TomTom. Map data © OpenStreetMap contributors (ODbL), basemap by OpenFreeMap.
UI components `sliding-number` and `animated-background` from Motion Primitives (MIT).
