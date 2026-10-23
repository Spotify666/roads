# RoadFix Hyderabad — build decisions (agreed 23 Oct 2026)

Scope: Hyderabad, Telangana, India only (GHMC / HMDA area). Fixes are addressed to the
agency that would build them: GHMC, HMDA, TGSRTC, Hyderabad / Cyberabad / Rachakonda traffic police.

## Infrastructure
- Supabase project `roadfix-hyderabad` (ref `vykolxofwjlllfrsohil`, ap-south-1 Mumbai, free tier).
- Vercel project `roadfix-hyderabad` on the spotify666 Hobby account, public, production deployed
  from branch `claude/focused-davinci-jejrwi` (no push to `main`).
- Secrets (TomTom key) live only in Vercel env vars and Supabase function secrets — never in git.

## Data sources
- OpenStreetMap (official API / extracts): road geometry, dual carriageways, median crossovers,
  signals, bus stops, crossings.
- TomTom Traffic Flow Segment Data + Traffic Incidents (live), polled by a Supabase edge function
  every 30 min (hourly overnight) for ~40 hotspots → history of when each road jams.
  Budget: ~1,900 of the 2,500 free calls/day.
- Published sources (Traffic Police, GHMC, news) for the chronic congestion points, each cited.

## Product
- City map: hotspots ranked by live + historical congestion, each with the bottleneck and a concrete fix.
- Mehdipatnam–Tolichowki pilot: before/after browser simulation + SUMO validation table.
- Results: congestion, travel time, distance, fuel, cost, payback. Every coefficient editable.
- Report export per area.
- Labelling: measured data vs model estimates are visibly distinguished.

## Design
Skills applied: Impeccable, Taste Skill, UI UX Pro Max, Emil Kowalski design engineering,
Motion (Framer Motion), 21st.dev components.
