"use client";

import { useRef } from "react";
import { motion } from "motion/react";
import { FLOW_COLORS, hourLabel } from "@/lib/flow";
import { cn } from "@/lib/utils";

interface Props {
  /** per hour 0–23: how many spots are slow, heavy, jammed and at a standstill on a typical weekday */
  levels: [number, number, number, number][];
  nowHour: number;
  /** the hour being shown in Typical mode */
  hour: number | null;
  /** live count of spots slow or worse, drawn on the current hour */
  liveCount: number | null;
  onPick: (h: number) => void;
}

const H = 58;

/** A day of the city's congestion as stacked bars, worst at the base; tap or drag to pick an hour. */
export function CityPulse({ levels, nowHour, hour, liveCount, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const totals = levels.map((l) => l[0] + l[1] + l[2] + l[3]);
  const max = Math.max(1, ...totals, liveCount ?? 0);
  // the worst hour weighs a jam above a slow spot, so the label lands on the real rush
  const severity = levels.map((l) => l[0] + 2 * l[1] + 3 * l[2] + 4 * l[3]);
  const peak = severity.indexOf(Math.max(...severity));
  const pickAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    onPick(Math.max(0, Math.min(23, Math.floor(((clientX - r.left) / r.width) * 24))));
  };
  return (
    <div data-no-drag>
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label="Hour of a typical weekday"
        aria-valuemin={0}
        aria-valuemax={23}
        aria-valuenow={hour ?? nowHour}
        aria-valuetext={`${hourLabel(hour ?? nowHour)}: ${totals[hour ?? nowHour]} of the spots slow or worse on a typical weekday`}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          onPick(((hour ?? nowHour) + d + 24) % 24);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pickAt(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pickAt(e.clientX);
        }}
        className="relative flex cursor-pointer touch-none items-end gap-[3px] select-none"
        style={{ height: H + 18 }}
      >
        {levels.map((l, h) => {
          const picked = hour === h;
          const now = h === nowHour;
          return (
            <div key={h} className="relative flex h-full flex-1 flex-col justify-end">
              {h === peak && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold whitespace-nowrap text-chalk-2 num">
                  {hourLabel(h).replace(" ", "")}
                </span>
              )}
              <motion.div
                className={cn("flex flex-col-reverse overflow-hidden rounded-[3px]", !picked && hour !== null && "opacity-55")}
                initial={{ height: 0 }}
                animate={{ height: Math.max(3, (totals[h] / max) * H) }}
                transition={{ type: "spring", duration: 0.6, bounce: 0.1, delay: h * 0.015 }}
                style={{ background: totals[h] ? undefined : FLOW_COLORS[0] }}
              >
                {[3, 2, 1, 0].map((k) =>
                  l[k] ? <span key={k} style={{ flexGrow: l[k], background: FLOW_COLORS[k + 1] }} className="block min-h-[1px]" /> : null,
                )}
              </motion.div>
              {(picked || (hour === null && now)) && <span className="absolute -bottom-[1px] left-0 h-[2px] w-full rounded-full bg-chalk" />}
              {now && liveCount != null && (
                <motion.span
                  className="absolute left-1/2 size-[9px] -translate-x-1/2 rounded-full border-2 border-chalk bg-asphalt-2"
                  initial={false}
                  animate={{ bottom: Math.max(3, (liveCount / max) * H) - 4 }}
                  transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-4 text-[10.5px] text-chalk-2 num" aria-hidden="true">
        {[0, 6, 12, 18].map((h) => (
          <span key={h}>{hourLabel(h).replace(" ", "")}</span>
        ))}
      </div>
    </div>
  );
}
