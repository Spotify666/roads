"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHECKPOINTS, type Calibration, type Design, type Metrics } from "@/sim/scenario";
import type { LabJob, LabMessage } from "@/sim/lab.worker";

export interface RunState {
  status: "idle" | "running" | "done";
  progress: number; // 0–1
  today: Metrics[];
  design: Metrics[];
  hour: number | null;
  designKey: string | null;
}

const IDLE: RunState = { status: "idle", progress: 0, today: [], design: [], hour: null, designKey: null };

export function useLabRunner() {
  const worker = useRef<Worker | null>(null);
  const job = useRef(0);
  const [state, setState] = useState<RunState>(IDLE);

  const kill = () => {
    worker.current?.terminate();
    worker.current = null;
  };
  useEffect(() => kill, []);

  const run = useCallback((design: Design, hour: number, cal: Calibration, reverseShare: number, baseline: Metrics[] | null) => {
    kill();
    const w = new Worker(new URL("../../sim/lab.worker.ts", import.meta.url));
    worker.current = w;
    const id = ++job.current;
    const withToday = !baseline;
    const total = CHECKPOINTS * (withToday ? 2 : 1);
    let done = 0;
    setState({ status: "running", progress: 0, today: baseline ?? [], design: [], hour, designKey: JSON.stringify(design) });
    w.onmessage = (e: MessageEvent<LabMessage>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.kind === "checkpoint") {
        done++;
        setState((s) => ({
          ...s,
          progress: done / total,
          today: msg.which === "today" ? [...s.today, msg.m] : s.today,
          design: msg.which === "design" ? [...s.design, msg.m] : s.design,
        }));
      } else {
        setState((s) => ({ ...s, status: "done", progress: 1 }));
        kill();
      }
    };
    const payload: LabJob = { id, design, hour, cal, reverseShare, withToday };
    w.postMessage(payload);
  }, []);

  const reset = useCallback(() => {
    kill();
    setState(IDLE);
  }, []);

  return { state, run, reset };
}
