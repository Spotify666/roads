"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useDragControls, useMotionValue, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

export type Snap = "peek" | "half" | "full";
const ORDER: Snap[] = ["full", "half", "peek"];
const SPRING = { type: "spring" as const, stiffness: 420, damping: 42, mass: 0.9 };

interface Props {
  snap: Snap;
  onSnap: (s: Snap) => void;
  /** visible height when collapsed, in px; by default exactly the header, so no row is cut in half */
  peek?: number;
  header: ReactNode;
  children: ReactNode;
  /** visible height once the sheet settles, so the map can keep its centre clear */
  onSettle?: (visible: number) => void;
  label: string;
  /** gap left above the sheet when fully open, e.g. for a search bar */
  top?: number;
}

/** A phone-map style sheet: drag the header (or the list while collapsed) between three heights. */
export function BottomSheet({ snap, onSnap, peek, header, children, onSettle, label, top = 8 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [H, setH] = useState(0);
  const [headH, setHeadH] = useState(0);
  const y = useMotionValue(10000);
  const controls = useDragControls();

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      setH(box.current?.clientHeight ?? 0);
      setHeadH(head.current?.offsetHeight ?? 0);
    });
    if (box.current) ro.observe(box.current);
    if (head.current) ro.observe(head.current);
    return () => ro.disconnect();
  }, []);

  const peekPx = peek ?? headH;
  const points: Record<Snap, number> = { full: top, half: Math.round(H * 0.5), peek: Math.max(0, H - peekPx) };
  const contentH = useTransform(y, (v) => Math.max(0, H - v - headH));

  const settle = (s: Snap) => {
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    animate(y, points[s], reduce ? { duration: 0 } : SPRING);
    onSettle?.(H - points[s]);
  };

  useEffect(() => {
    if (H) settle(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, H, peekPx]);

  const onDragEnd = (_: unknown, info: { velocity: { y: number } }) => {
    // project the release a little way along its velocity, then pick the nearest height
    const target = y.get() + info.velocity.y * 0.18;
    const next = ORDER.reduce((a, b) => (Math.abs(points[b] - target) < Math.abs(points[a] - target) ? b : a));
    if (next === snap) settle(next);
    else onSnap(next);
  };

  const step = () => onSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");

  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <motion.section
        aria-label={label}
        style={{ y }}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: points.full, bottom: points.peek }}
        dragElastic={0.05}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        className="pointer-events-auto absolute inset-x-0 top-0 h-full rounded-t-[22px] bg-asphalt-2 shadow-[0_-8px_30px_#0009]"
      >
        <div
          ref={head}
          onPointerDown={(e) => {
            // sliders and other controls in the header keep their own gestures
            if (!(e.target as HTMLElement).closest("input, [data-no-drag]")) controls.start(e);
          }}
          className="cursor-grab touch-none select-none active:cursor-grabbing"
        >
          <button type="button" onClick={step} className="flex h-6 w-full items-center justify-center" aria-label={snap === "full" ? "Collapse" : "Expand"}>
            <span className="h-[5px] w-10 rounded-full bg-chalk-2/40" />
          </button>
          {header}
        </div>
        <motion.div
          style={{ height: contentH }}
          onPointerDown={(e) => {
            if (snap !== "full") controls.start(e);
          }}
          className={cn("overscroll-contain pb-[env(safe-area-inset-bottom)]", snap === "full" ? "overflow-y-auto touch-pan-y" : "touch-none overflow-hidden")}
        >
          {children}
        </motion.div>
      </motion.section>
    </div>
  );
}
