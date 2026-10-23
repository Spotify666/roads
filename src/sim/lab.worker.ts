// Runs Simulation Lab designs off the main thread, posting each checkpoint as it is reached.
import { TODAY_DESIGN, runDesign, type Calibration, type Design } from "./scenario";

export type LabJob = { id: number; design: Design; hour: number; cal: Calibration; reverseShare: number; withToday: boolean };
export type LabMessage =
  | { id: number; kind: "checkpoint"; which: "today" | "design"; i: number; m: import("./scenario").Metrics }
  | { id: number; kind: "done" };

self.onmessage = (e: MessageEvent<LabJob>) => {
  const { id, design, hour, cal, reverseShare, withToday } = e.data;
  const post = (msg: LabMessage) => (self as unknown as Worker).postMessage(msg);
  // with more or less traffic than today, today's layout has to be rerun at that traffic too
  if (withToday) runDesign({ ...TODAY_DESIGN, traffic: design.traffic }, hour, cal, (i, m) => post({ id, kind: "checkpoint", which: "today", i, m }), reverseShare);
  runDesign(design, hour, cal, (i, m) => post({ id, kind: "checkpoint", which: "design", i, m }), reverseShare);
  post({ id, kind: "done" });
};
