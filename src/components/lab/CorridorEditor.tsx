"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DEFAULT_GREEN, editableSignals, greenOf, type Corridor, type Design } from "@/sim/scenario";
import { MARK } from "@/components/sim/SimCanvas";
import { cn } from "@/lib/utils";

const LANE = 7;
const TOP = 26;
const LONG_GAP = 600; // beyond this, riders start going wrong-side rather than detour
const SNAP = 10;
const HIT_PX = 18;

export type EditMode = "uturn" | "pocket";

/** Roads heading west are drawn with their start on the right, as on a map. */
export const flipOf = (c: Pick<Corridor, "heading">) => /west/.test(c.heading[0] ?? "");

interface Props {
  design: Design;
  onChange: (d: Design) => void;
  corridor: Corridor;
  mode: EditMode;
}

const snap = (s: number) => Math.round(s / SNAP) * SNAP;

export function CorridorEditor({ design, onChange, corridor: c, mode }: Props) {
  const L = c.length;
  const flip = flipOf(c);
  // the carriageway whose traffic moves right on screen is drawn on top, keeping left
  const UP: 0 | 1 = flip ? 1 : 0;
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

  const sx = (s: number) => (flip ? (L - s) / L : s / L) * W;
  const sOfX = (x: number) => Math.min(L, Math.max(0, flip ? L - (x / W) * L : (x / W) * L));
  const span = (a: number, b: number) => [Math.min(sx(a), sx(b)), Math.abs(sx(b) - sx(a))] as const;
  const say = (text: string) => setToast({ text, key: Date.now() });
  const blockedReason = (s: number) => c.blocked.find((z) => s >= z.from && s <= z.to)?.why ?? null;

  const openings = useMemo(() => [...design.openings].sort((a, b) => a.s - b.s), [design.openings]);
  const shown = openings.map((o, i) => (drag && drag.index === i && drag.moved ? { ...o, s: drag.s } : o));
  const maxLanes = Math.max(...c.model.lanes.flatMap((l) => [l.w, l.e]));

  const lanes = (side: 0 | 1, s: number) => {
    if (design.fullLanes) return side === 0 ? Math.max(...c.model.lanes.map((l) => l.w)) : Math.max(...c.model.lanes.map((l) => l.e));
    const seg = c.model.lanes.find((l) => s >= l.from && s < l.to) ?? c.model.lanes[c.model.lanes.length - 1];
    return side === 0 ? seg.w : seg.e;
  };
  const rows = Math.min(4, maxLanes);
  const LW = rows > 3 ? 5.5 : LANE;
  const medianY = TOP + rows * LW;
  const MED = 6;
  const lowerY = medianY + MED;
  const bottomY = lowerY + rows * LW;
  const edgeY = (side: 0 | 1, s: number, inset = 0) => (side === UP ? medianY - (lanes(side, s) - inset) * LW : lowerY + (lanes(side, s) - inset) * LW);

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
      const toLeft = e.key === "ArrowLeft";
      const ds = (toLeft === flip ? SNAP : -SNAP) * (e.shiftKey ? 5 : 1);
      const s = Math.min(L, Math.max(0, o.s + ds));
      if (!blockedReason(s)) setOpenings(openings.map((x, j) => (j === i ? { ...x, s } : { ...x })));
      else say(`Can't build here: ${blockedReason(s)}`);
    } else if (e.key.toLowerCase() === "p") {
      setOpenings(openings.map((x, j) => (j === i ? { ...x, pocket: !x.pocket } : { ...x })));
    }
  };

  const gaps = useMemo(() => {
    const pts = [0, ...shown.map((o) => o.s), L];
    return pts.slice(1).map((p, i) => ({ from: pts[i], to: p, len: p - pts[i] }));
  }, [shown, L]);

  const ow = design.oneWay;
  const movesRight = (cw: 0 | 1) => (flip ? cw === 1 : cw === 0);
  const arrows = [];
  for (let s = 150; s < L; s += 300) {
    for (const side of [0, 1] as const) {
      const right = ow === null ? side === UP : movesRight(ow);
      const y = side === UP ? medianY - (lanes(side, s) * LW) / 2 : lowerY + (lanes(side, s) * LW) / 2;
      const x = sx(s);
      const d = right ? 1 : -1;
      arrows.push(<path key={`${s}-${side}`} d={`M${x + 5 * d} ${y}L${x - 2 * d} ${y - 3.2}L${x - 2 * d} ${y + 3.2}Z`} fill="#ffffff40" />);
    }
  }

  // signal labels: name and green share where there is room, the share alone where signals crowd
  const signals = editableSignals(c);
  const sigLabels = useMemo(() => {
    const placed: { s: number; text: string; x: number; anchor: "middle" }[] = [];
    const sorted = [...signals].sort((a, b) => sx(a.s) - sx(b.s));
    let right = -Infinity;
    for (const sg of sorted) {
      const x = sx(sg.s);
      const g = Math.round(greenOf(design, sg.name!) * 100);
      const full = `${sg.name} ${g}%`;
      const short = `${g}%`;
      const fits = (t: string) => {
        const w = t.length * 5.6;
        const left = Math.max(0, Math.min(W - w, x - w / 2));
        return left > right + 6 ? left : null;
      };
      const text = fits(full) != null ? full : fits(short) != null ? short : null;
      if (!text) continue; // too crowded to label: the slider below names it
      const left = fits(text)!;
      const w = text.length * 5.6;
      placed.push({ s: sg.s, text, x: left + w / 2, anchor: "middle" });
      right = left + w;
    }
    return placed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, design.greens, W, flip, L]);

  const drops = c.model.lanes.slice(1).map((l) => l.from);
  const H = bottomY + 52;
  const leftEnd = c.places.find((p) => p.s === (flip ? L : 0));
  const rightEnd = c.places.find((p) => p.s === (flip ? 0 : L));
  const fromName = c.places.find((p) => p.s === 0)?.name ?? "the start";

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
        {/* carriageways, stepped where lanes change */}
        {[0, 1].map((side) => {
          const pts: string[] = [];
          for (let s = 0; s <= L; s += 20) pts.push(`${sx(s)},${edgeY(side as 0 | 1, s)}`);
          const base = side === UP ? medianY : lowerY;
          return <polygon key={side} points={`${sx(0)},${base} ${pts.join(" ")} ${sx(L)},${base}`} fill="#262c31" />;
        })}
        {design.busLane &&
          [0, 1].map((side) => {
            if (ow !== null && side !== ow) return null;
            const outer: string[] = [];
            const inner: string[] = [];
            for (let s = 0; s <= L; s += 20) outer.push(`${sx(s)},${edgeY(side as 0 | 1, s)}`);
            for (let s = L; s >= 0; s -= 20) inner.push(`${sx(s)},${edgeY(side as 0 | 1, s, 1)}`);
            return <polygon key={`bl${side}`} points={[...outer, ...inner].join(" ")} fill={MARK.busLane} />;
          })}
        {arrows}
        {design.enforcement && (
          <g stroke={MARK.rail} strokeWidth="1.2" strokeDasharray="1.5 3">
            <path d={`M0 ${TOP - 3}H${W}`} />
            <path d={`M0 ${bottomY + 3}H${W}`} />
          </g>
        )}

        {/* median where the road is divided, a dashed centre line where it is not */}
        <path d={`M0 ${medianY + MED / 2}H${W}`} stroke="#eceee9" strokeOpacity={0.5} strokeWidth={1.2} strokeDasharray="6 5" />
        {c.medians.map((m, i) => {
          const [x, w] = span(m.from, Math.min(L, m.to));
          return <rect key={i} x={x} y={medianY + 1.5} width={w} height={MED - 3} fill={MARK.median} opacity={0.85} />;
        })}
        {c.blocked
          .filter((z) => !z.why.startsWith("No median"))
          .map((z, i) => {
            const [x, w] = span(Math.max(0, z.from), Math.min(L, z.to));
            return <rect key={i} x={x} y={medianY + 1.5} width={Math.max(1.5, w)} height={MED - 3} fill="url(#blocked)" />;
          })}
        <defs>
          <pattern id="blocked" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#3a2226" />
            <path d="M0 0v4" stroke="#cf2f3d" strokeWidth="1.6" />
          </pattern>
        </defs>

        {/* bus stops */}
        {c.model.busStops.map((b, i) => {
          const side = (ow ?? b.cw) as 0 | 1;
          const bay = design.busBays && c.bayStops.includes(b.s);
          const y = side === UP ? edgeY(side, b.s) - 5 : edgeY(side, b.s) + 1;
          return <rect key={i} x={sx(b.s) - (bay ? 6 : 2)} y={y} width={bay ? 12 : 4} height={4} rx={1} fill="#f39228" />;
        })}

        {/* signals and their green share */}
        {c.model.signals
          .filter((sig) => sig.cw === undefined)
          .map((sig) => (
            <rect key={sig.s} x={sx(sig.s) - 1.2} y={TOP} width={2.4} height={bottomY - TOP} fill="#29a36a" />
          ))}
        {sigLabels.map((l) => (
          <text key={l.s} x={l.x} y={TOP - 8} textAnchor={l.anchor} className="fill-chalk-2 text-[10.5px] font-medium num">
            {l.text.replace(/\d+%$/, "")}
            <tspan className={cn(Math.abs(greenOf(design, signals.find((sg) => sg.s === l.s)!.name!) - DEFAULT_GREEN) > 0.01 ? "fill-sign-bright" : "fill-chalk")}>
              {l.text.match(/\d+%$/)?.[0]}
            </tspan>
          </text>
        ))}
        {!design.fullLanes &&
          drops.map((s) => <path key={s} d={`M${sx(s)} ${TOP}v${bottomY - TOP}`} stroke="#f39228" strokeWidth="1.2" strokeDasharray="2 2" />)}

        {/* U-turn openings: gap in the median, a pocket if built, a marker to grab */}
        {shown.map((o, i) => {
          const x = sx(o.s);
          const isNew = !c.openings.some((b) => Math.abs(b - o.s) < 15);
          const dragging = drag?.index === i && drag.moved;
          const bad = dragging && !drag.ok;
          const color = bad ? "#cf2f3d" : isNew ? MARK.newUturn : MARK.median;
          return (
            <g
              key={i}
              tabIndex={0}
              role="button"
              aria-label={`U-turn ${Math.round(o.s)} m from ${fromName}${o.pocket ? ", with waiting pocket" : ""}. Arrow keys move it, Delete removes it, P toggles the pocket.`}
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
          const [x0, w] = span(g.from, g.to);
          const long = g.len > LONG_GAP;
          return (
            <g key={i}>
              <path d={`M${x0 + 3} ${bottomY + 9}H${x0 + w - 3}`} stroke={long ? "#cf2f3d" : "#4a5560"} strokeWidth={long ? 2 : 1.2} />
              {w > 40 && (
                <text x={x0 + w / 2} y={bottomY + 22} textAnchor="middle" className={cn("text-[10.5px] num", long ? "fill-[#ff7a7a] font-semibold" : "fill-chalk-2")}>
                  {g.len >= 1000 ? `${(g.len / 1000).toFixed(1)} km` : `${Math.round(g.len)} m`}
                </text>
              )}
            </g>
          );
        })}

        {leftEnd && (
          <text x={0} y={H - 6} textAnchor="start" className="fill-chalk-2 text-[11px] font-medium">
            {leftEnd.name}
          </text>
        )}
        {rightEnd && (
          <text x={W} y={H - 6} textAnchor="end" className="fill-chalk-2 text-[11px] font-medium">
            {rightEnd.name}
          </text>
        )}
      </svg>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.key}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: "spring", duration: 0.28, bounce: 0.1 }}
            className="pointer-events-none absolute top-0 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-[#3a2226] px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap text-[#ffb3b3] shadow-[0_4px_16px_#0008]"
            role="status"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
