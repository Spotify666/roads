// Runs Simulation Lab designs off the main thread, posting each checkpoint as it is reached.
import { runDesign, todayDesign, type Design, type Metrics, type SimCorridor } from "./scenario";

export type LabJob = { id: number; design: Design; hour: number; corridor: SimCorridor & { openings: number[] }; withToday: boolean };
export type LabMessage = { id: number; kind: "checkpoint"; which: "today" | "design"; i: number; m: Metrics } | { id: number; kind: "done" };

self.onmessage = (e: MessageEvent<LabJob>) => {
  const { id, design, hour, corridor, withToday } = e.data;
  const post = (msg: LabMessage) => (self as unknown as Worker).postMessage(msg);
  // with more or less traffic than today, today's layout has to be rerun at that traffic too
  if (withToday) runDesign({ ...todayDesign(corridor), traffic: design.traffic }, hour, corridor, (i, m) => post({ id, kind: "checkpoint", which: "today", i, m }));
  runDesign(design, hour, corridor, (i, m) => post({ id, kind: "checkpoint", which: "design", i, m }));
  post({ id, kind: "done" });
};
