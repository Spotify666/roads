"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BLOCKED_ZONES, PILOT_MODEL, blockedReason } from "@/sim/pilot";
import { SIGNALS, type Design } from "@/sim/scenario";
import { MARK } from "@/components/sim/SimCanvas";
import { cn } from "@/lib/utils";

const L = PILOT_MODEL.length;
const LANE = 7;
const TOP = 26;
const PLACES = [
  { s: 0, name: "Mehdipatnam" },
  { s: L, name: "Tolichowki" },
];
const LONG_GAP = 600; // beyond this, riders start going wrong-side rather than detour
const SNAP = 10;
const HIT_PX = 18;

export type EditMode = "uturn" | "pocket";

interface Props {
  design: Design;
  onChange: (d: Design) => void;
  baseOpenings: number[];
  mode: EditMode;
}

const snap = (s: number) => Math.round(s / SNAP) * SNAP;

export function CorridorEditor({ design, onChange, baseOpenings, mode }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [drag, setDrag] = useState<{ index: number; s: number; ok: boolean; moved: boolean; x0: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const sx = (s: number) => ((L - s) / L) * W;
  const sOfX = (x: number) => Math.min(L, Math.max(0, L - (x / W) * L));
  const say = (text: string) => setToast({ text, key: Date.now() });

  const openings = useMemo(() => [...design.openings].sort((a, b) => a.s - b.s), [design.openings]);
  const shown = openings.map((o, i) => (drag && drag.index === i && drag.moved ? { ...o, s: drag.s } : o));

  const lanes = (side: 0 | 1, s: number) => {
    if (design.fullLanes) return 3;
    const seg = PILOT_MODEL.lanes.find((l) => s >= l.from && s < l.to) ?? PILOT_MODEL.lanes[PILOT_MODEL.lanes.length - 1];
    return side === 0 ? seg.w : seg.e;
  };
  const medianY = TOP + 3 * LANE;
  const MED = 6;
  const lowerY = medianY + MED;
  const bottomY = lowerY + 3 * LANE;

  const setOpenings = (list: { s: number; pocket: boolean }[]) => onChange({ ...design, openings: list.sort((a, b) => a.s - b.s) });

  const nearest = (x: number) => {
    let best = -1;
    let bd = HIT_PX;
    shown.forEach((o, i) => {
      const d = Math.abs(sx(o.s) - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  const localX = (e: React.PointerEvent) => e.clientX - (host.current?.getBoundingClientRect().left ?? 0);

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const x = localX(e);
    const i = nearest(x);
    if (i >= 0 && mode === "uturn") {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ index: i, s: openings[i].s, ok: true, moved: false, x0: x });
    } else setDrag({ index: i, s: snap(sOfX(x)), ok: true, moved: false, x0: x });
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || drag.index < 0 || mode !== "uturn") return;
    const x = localX(e);
    if (!drag.moved && Math.abs(x - drag.x0) < 5) return;
    const s = snap(sOfX(x));
    const clash = openings.some((o, j) => j !== drag.index && Math.abs(o.s - s) < 60);
    setDrag({ ...drag, s, moved: true, ok: !blockedReason(s) && !clash });
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.moved && d.index >= 0) {
      if (d.ok) setOpenings(openings.map((o, j) => (j === d.index ? { ...o, s: d.s } : { ...o })));
      else say(blockedReason(d.s) ? `Can't build here: ${blockedReason(d.s)}` : "Too close to another U-turn");
      return;
    }
    const x = localX(e);
    const i = nearest(x);
    if (mode === "pocket") {
      if (i < 0) return say("Tap a U-turn to add or remove its waiting pocket");
      setOpenings(openings.map((o, j) => (j === i ? { ...o, pocket: !o.pocket } : { ...o })));
      return;
    }
    if (i >= 0) {
      setOpenings(openings.filter((_, j) => j !== i).map((o) => ({ ...o })));
      return;
    }
    const s = snap(sOfX(x));
    const why = blockedReason(s);
    if (why) return say(`Can't build here: ${why}`);
    if (openings.some((o) => Math.abs(o.s - s) < 60)) return say("Too close to another U-turn");
    setOpenings([...openings.map((o) => ({ ...o })), { s, pocket: true }]);
  };

  // keyboard: arrows move the focused U-turn, Delete removes it, P toggles its pocket
  const onKey = (i: number) => (e: React.KeyboardEvent) => {
    const o = openings[i];
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setOpenings(openings.filter((_, j) => j !== i).map((x) => ({ ...x })));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const s = Math.min(L, Math.max(0, o.s + (e.key === "ArrowLeft" ? SNAP : -SNAP) * (e.shiftKey ? 5 : 1)));
      if (!blockedReason(s)) setOpenings(openings.map((x, j) => (j === i ? { ...x, s } : { ...x })));
      else say(`Can't build here: ${blockedReason(s)}`);
    } else if (e.key.toLowerCase() === "p") {
      setOpenings(openings.map((x, j) => (j === i ? { ...x, pocket: !x.pocket } : { ...x })));
    }
  };

  const gaps = useMemo(() => {
    const pts = [0, ...shown.map((o) => o.s), L];
    return pts.slice(1).map((p, i) => ({ from: pts[i], to: p, len: p - pts[i] }));
  }, [shown]);

  const ow = design.oneWay;
  const arrows = [];
  for (let s = 150; s < L; s += 300) {
    for (const side of [0, 1] as const) {
      const right = ow === null ? side === 1 : ow === 1;
      const y = side === 1 ? medianY - (lanes(1, s) * LANE) / 2 : lowerY + (lanes(0, s) * LANE) / 2;
      const x = sx(s);
      const d = right ? 1 : -1;
      arrows.push(<path key={`${s}-${side}`} d={`M${x + 5 * d} ${y}L${x - 2 * d} ${y - 3.2}L${x - 2 * d} ${y + 3.2}Z`} fill="#ffffff40" />);
    }
  }

  const H = bottomY + 52;
  const labelFor = (sig: string) => (sig === SIGNALS.nanal ? design.greenNanal : sig === SIGNALS.rethibowli ? design.greenRethibowli : null);

  return (
    <div ref={host} className="relative select-none">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className={cn("block touch-pan-y", mode === "uturn" ? "cursor-crosshair" : "cursor-pointer")}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
        role="group"
        aria-label="Corridor editor. Tap the road to add a U-turn, tap a U-turn to remove it, drag to move it."
      >
        {/* carriageways, stepped where lanes drop */}
        {[0, 1].map((side) => {
          const pts: string[] = [];
          for (let s = 0; s <= L; s += 20) {
            const n = lanes(side as 0 | 1, s);
            const y = side === 1 ? medianY - n * LANE : lowerY + n * LANE;
            pts.push(`${sx(s)},${y}`);
          }
          const base = side === 1 ? medianY : lowerY;
          return <polygon key={side} points={`${sx(0)},${base} ${pts.join(" ")} ${sx(L)},${base}`} fill="#262c31" />;
        })}
        {design.busLane &&
          [0, 1].map((side) => {
            if (ow !== null && side !== ow) return null;
            const pts: string[] = [];
            for (let s = 0; s <= L; s += 20) {
              const n = lanes(side as 0 | 1, s);
              pts.push(`${sx(s)},${side === 1 ? medianY - n * LANE : lowerY + n * LANE}`);
            }
            const inner: string[] = [];
            for (let s = L; s >= 0; s -= 20) {
              const n = lanes(side as 0 | 1, s);
              inner.push(`${sx(s)},${side === 1 ? medianY - (n - 1) * LANE : lowerY + (n - 1) * LANE}`);
            }
            return <polygon key={`bl${side}`} points={[...pts, ...inner].join(" ")} fill={MARK.busLane} />;
          })}
        {arrows}
        {design.enforcement && (
          <g stroke={MARK.rail} strokeWidth="1.2" strokeDasharray="1.5 3">
            <path d={`M0 ${TOP - 3}H${W}`} />
            <path d={`M0 ${bottomY + 3}H${W}`} />
          </g>
        )}

        {/* median, with blocked zones hatched */}
        <rect x={0} y={medianY + 1.5} width={W} height={MED - 3} fill={MARK.median} opacity={0.85} />
        {BLOCKED_ZONES.map((z, i) => (
          <rect key={i} x={sx(Math.min(L, z.to))} y={medianY + 1.5} width={Math.max(1.5, sx(z.from) - sx(Math.min(L, z.to)))} height={MED - 3} fill="url(#blocked)" />
        ))}
        <defs>
          <pattern id="blocked" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#3a2226" />
            <path d="M0 0v4" stroke="#cf2f3d" strokeWidth="1.6" />
          </pattern>
        </defs>

        {/* bus stops */}
        {PILOT_MODEL.busStops.map((b, i) => {
          const side = (ow ?? b.cw) as 0 | 1;
          const n = lanes(side, b.s);
          const y = side === 1 ? medianY - n * LANE - 5 : lowerY + n * LANE + 1;
          return <rect key={i} x={sx(b.s) - (design.busBays && b.major ? 6 : 2)} y={y} width={design.busBays && b.major ? 12 : 4} height={4} rx={1} fill="#f39228" />;
        })}

        {/* signals and their green share */}
        {PILOT_MODEL.signals
          .filter((sig) => sig.cw === undefined)
          .map((sig) => {
            const g = labelFor(sig.name ?? "");
            const x = sx(sig.s);
            return (
              <g key={sig.s}>
                <rect x={x - 1.2} y={TOP} width={2.4} height={bottomY - TOP} fill="#29a36a" />
                {g !== null && (
                  // Nanal Nagar sits west of Rethibowli: anchor the two labels away from each other
                  <text x={sig.name === SIGNALS.nanal ? x - 4 : x + 4} y={TOP - 8} textAnchor={sig.name === SIGNALS.nanal ? "end" : "start"} className="fill-chalk-2 text-[10.5px] font-medium num">
                    {sig.name === SIGNALS.nanal ? "Nanal Nagar" : "Rethibowli"} <tspan className={cn(Math.abs(g - 0.45) > 0.01 ? "fill-sign-bright" : "fill-chalk")}>{Math.round(g * 100)}%</tspan>
                  </text>
                )}
              </g>
            );
          })}
        {!design.fullLanes && (
          <g>
            <path d={`M${sx(1371)} ${TOP}v${bottomY - TOP}`} stroke="#f39228" strokeWidth="1.2" strokeDasharray="2 2" />
          </g>
        )}

        {/* U-turn openings: gap in the median, a pocket if built, a marker to grab */}
        {shown.map((o, i) => {
          const x = sx(o.s);
          const isNew = !baseOpenings.some((b) => Math.abs(b - o.s) < 15);
          const dragging = drag?.index === i && drag.moved;
          const bad = dragging && !drag.ok;
          const color = bad ? "#cf2f3d" : isNew ? MARK.newUturn : MARK.median;
          return (
            <g
              key={i}
              tabIndex={0}
              role="button"
              aria-label={`U-turn at ${Math.round(o.s)} m from Mehdipatnam${o.pocket ? ", with waiting pocket" : ""}. Arrow keys move it, Delete removes it, P toggles the pocket.`}
              onKeyDown={onKey(i)}
              onFocus={() => setFocusIdx(i)}
              onBlur={() => setFocusIdx(null)}
              className="outline-none"
            >
              <rect x={x - 3} y={medianY} width={6} height={MED} fill="#101316" />
              {o.pocket && <rect x={x - 11} y={medianY + 1} width={22} height={MED - 2} rx={1} fill="#4a5560" />}
              <circle cx={x} cy={medianY + MED / 2} r={focusIdx === i || dragging ? 9.5 : 7.5} fill="#101316" stroke={color} strokeWidth={2} />
              <path d={`M${x - 2.6} ${medianY + MED / 2 + 3}v-3a2.6 2.6 0 0 1 5.2 0v1.6`} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
              {dragging && (
                <text x={x} y={bottomY + 36} textAnchor="middle" className={cn("text-[11px] font-semibold num", bad ? "fill-[#ff7a7a]" : "fill-chalk")}>
                  {Math.round(o.s).toLocaleString("en-IN")} m
                </text>
              )}
            </g>
          );
        })}

        {/* spacing between U-turns: long gaps push riders to go wrong-side */}
        {gaps.map((g, i) => {
          const x0 = sx(g.to);
          const x1 = sx(g.from);
          const long = g.len > LONG_GAP;
          const wide = x1 - x0 > 40;
          return (
            <g key={i}>
              <path d={`M${x0 + 3} ${bottomY + 9}H${x1 - 3}`} stroke={long ? "#cf2f3d" : "#4a5560"} strokeWidth={long ? 2 : 1.2} />
              {wide && (
                <text x={(x0 + x1) / 2} y={bottomY + 22} textAnchor="middle" className={cn("text-[10.5px] num", long ? "fill-[#ff7a7a] font-semibold" : "fill-chalk-2")}>
                  {g.len >= 1000 ? `${(g.len / 1000).toFixed(1)} km` : `${Math.round(g.len)} m`}
                </text>
              )}
            </g>
          );
        })}

        {PLACES.map((p) => {
          const x = sx(p.s);
          const anchor = p.s === 0 ? "end" : p.s === L ? "start" : "middle";
          return (
            <text key={p.name} x={x} y={H - 6} textAnchor={anchor} className="fill-chalk-2 text-[11px] font-medium">
              {p.name}
            </text>
          );
        })}
      </svg>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.key}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: "spring", duration: 0.28, bounce: 0.1 }}
            className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 rounded-full bg-[#3a2226] px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap text-[#ffb3b3] shadow-[0_4px_16px_#0008]"
            role="status"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Where a new U-turn helps most: the middle of the longest gap that can take one. */
export function bestNewOpening(openings: number[]) {
  const pts = [0, ...[...openings].sort((a, b) => a - b), L];
  const gaps = pts.slice(1).map((p, i) => ({ a: pts[i], b: p })).sort((x, y) => y.b - y.a - (x.b - x.a));
  for (const g of gaps) {
    const mid = snap((g.a + g.b) / 2);
    for (let d = 0; d < (g.b - g.a) / 2 - 60; d += SNAP) {
      for (const s of [mid - d, mid + d]) if (!blockedReason(s) && s - g.a >= 60 && g.b - s >= 60) return s;
    }
  }
  return null;
}
