import { Simulation } from "../../src/sim/engine";
import { PILOT_MODEL, TODAY, demandFor } from "../../src/sim/pilot";

for (const q of [200, 800, 1400, 2000, 2600]) {
  const t0 = Date.now();
  const sim = new Simulation(PILOT_MODEL, TODAY, demandFor(q, q), undefined, 7, 300);
  sim.run(3600 + 300);
  const st = sim.stats();
  console.log(
    `q=${q} trips=${st.trips} vehH=${st.vehHours.toFixed(0)} thrW=${st.avgThroughTime[0].toFixed(0)}s (${st.throughTimes[0].length}) thrE=${st.avgThroughTime[1].toFixed(0)}s (${st.throughTimes[1].length}) uturns=${st.uturns} wrong=${st.wrongside} onroad=${sim.vehicles.length} ${(Date.now() - t0) / 1000}s`,
  );
}
