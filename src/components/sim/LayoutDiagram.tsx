// Where the U-turn openings sit in each layout, drawn to scale along the corridor.
// West (Tolichowki) on the left, as on a map.

interface Layout {
  label: string;
  openings: number[];
  note?: string;
  highlight?: boolean;
}

export function LayoutDiagram({ length, layouts, places }: { length: number; layouts: Layout[]; places: { s: number; name: string }[] }) {
  const W = 1000;
  const rowH = 46;
  const top = 26;
  const H = top + layouts.length * rowH + 6;
  const x = (s: number) => ((length - s) / length) * W;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Positions of median U-turn openings in each layout along the 2.7 km corridor">
        {places.map((p) => (
          <text key={p.name} x={Math.min(W - 4, Math.max(4, x(p.s)))} y={12} fontSize="12.5" fill="#4a5157" textAnchor={p.s < 60 ? "end" : p.s > length - 60 ? "start" : "middle"}>
            {p.name}
          </text>
        ))}
        {layouts.map((l, i) => {
          const y = top + i * rowH + 26;
          return (
            <g key={l.label}>
              <text x={0} y={y - 12} fontSize="13" fontWeight={l.highlight ? 600 : 500} fill="#14171a">
                {l.label}
                {l.note ? <tspan fill="#4a5157" fontWeight={400}>{`  ${l.note}`}</tspan> : null}
              </text>
              <rect x={0} y={y - 3} width={W} height={6} rx={3} fill={l.highlight ? "#14171a" : "#b9bdb3"} />
              {l.openings.map((s) => (
                <rect key={s} x={x(s) - 5} y={y - 8} width={10} height={16} rx={2} fill={l.highlight ? "#2d6cdf" : "#14171a"} />
              ))}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
