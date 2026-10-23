"use client";

import { useRef } from "react";
import { flowColor, flowLabel, hourLabel } from "@/lib/flow";
import { cn } from "@/lib/utils";

interface Props {
  /** typical slowdown for each hour 0-23 */
  values: number[];
  hour: number;
  onChange: (h: number) => void;
  active: boolean;
  label: string;
}

/** A 24-hour strip: each cell is an hour, coloured by how slow the city typically is then. */
export function HourStrip({ values, hour, onChange, active, label }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const h = (hour + d + 24) % 24;
    onChange(h);
    refs.current[h]?.focus();
  };
  return (
    <div>
      <div role="radiogroup" aria-label={label} className="pointer-events-none grid gap-[3px] sm:pointer-events-auto" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }} onKeyDown={onKey}>
        {values.map((v, h) => {
          const selected = active && h === hour;
          return (
            <button
              key={h}
              ref={(n) => {
                refs.current[h] = n;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${hourLabel(h)}: typically ${flowLabel(v).toLowerCase()}, ${v.toFixed(2)} times free-flow time`}
              tabIndex={selected || (!active && h === hour) ? 0 : -1}
              data-strip
              onClick={() => onChange(h)}
              className={cn(
                "relative h-9 rounded-[3px] transition-[transform,opacity] duration-150 ease-[var(--ease-out-strong)] active:scale-[0.94]",
                active ? (selected ? "opacity-100" : "opacity-70 hover:opacity-100") : "opacity-45 hover:opacity-80",
              )}
              style={{ background: flowColor(v) }}
            >
              {selected && <span className="absolute inset-x-0 -bottom-[7px] mx-auto h-[3px] w-full rounded-full bg-chalk" />}
            </button>
          );
        })}
      </div>
      <input
        type="range"
        min={0}
        max={23}
        step={1}
        value={hour}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label}: ${hourLabel(hour)}`}
        aria-valuetext={`${hourLabel(hour)}, typically ${flowLabel(values[hour]).toLowerCase()}`}
        className="hour-range mt-3 w-full sm:hidden"
      />
      <div className="mt-3 flex justify-between text-xs text-chalk-2 num" aria-hidden="true">
        <span>12 am</span>
        <span>6 am</span>
        <span>12 pm</span>
        <span>6 pm</span>
        <span>11 pm</span>
      </div>
    </div>
  );
}
