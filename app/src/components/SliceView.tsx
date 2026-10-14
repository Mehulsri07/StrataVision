import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { METRES_TO_FEET } from "@strata/core";
import type { Slice } from "@/model/slice";
import { text } from "@/text";
import { SectionPlot, hatchDefs, named, short } from "./SectionDrawing";

/** How wide the block is drawn, in pixels, along its longer side on the map. */
const SIZE = 520;
const START = { turn: -25, tilt: -30 };
const LAND = "#e9e4d6";

/**
 * A slice of ground as a block that can be turned and tilted. Every side is a flat drawing of a
 * section, placed with CSS 3D transforms; only sides facing outwards are shown, so the inside of the
 * block never is. The top is the strip of ground with the borewells inside it as pins.
 */
export function SliceView({ slice, stretch }: { slice: Slice; stretch: number }) {
  const [view, setView] = useState(START);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const xs = slice.top.map((p) => p[0]), ys = slice.top.map((p) => p[1]);
  const [minE, maxE, minN, maxN] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pxPerKm = SIZE / Math.max(maxE - minE, maxN - minN, 0.01);
  // Feet to pixels at true scale, times the stretch.
  const pxPerFt = (pxPerKm / (1000 * METRES_TO_FEET)) * stretch;
  const height = (slice.highFt - slice.lowFt) * pxPerFt;
  const y = (ft: number) => (slice.highFt - Math.min(ft, slice.highFt)) * pxPerFt;
  /** Where a side's edge starts: at the ground, or at the bottom where the ground is not known. */
  const edge = (groundFt: number | null | undefined) => (groundFt == null ? height : y(groundFt));
  // The lid sits at the lowest ground along the sides, so hills rise above it as they do on the cuts.
  const lidFt = Math.min(...slice.faces.flatMap((f) => f.section.columns.map((c) => c.groundFt ?? Infinity)));
  // Screen x is east, screen z (towards the viewer) is south.
  const at = ([e, n]: [number, number]) => [e * pxPerKm, -n * pxPerKm] as const;
  const centre = { x: ((minE + maxE) / 2) * pxPerKm, y: height / 2, z: (-(minN + maxN) / 2) * pxPerKm };

  // The sides only change with the slice and the stretch, not while turning.
  const sides = useMemo(() => slice.faces.map((f, i) => {
    const [x0, z0] = at(f.from), [x1, z1] = at(f.to);
    const len = Math.hypot(x1 - x0, z1 - z0), s = f.section;
    const x = (km: number) => (s.lengthKm ? (Math.min(Math.max(km, 0), s.lengthKm) / s.lengthKm) * len : 0);
    return (
      <svg key={i} width={len} height={height} fontSize={11} className="absolute top-0 left-0 overflow-visible [backface-visibility:hidden]"
        style={{ transformOrigin: "0 0", transform: `translate3d(${x0}px, 0, ${z0}px) rotateY(${Math.atan2(z0 - z1, x1 - x0)}rad)` }}>
        <defs>{hatchDefs}</defs>
        <SectionPlot s={s} x={x} y={y} bottom={height} />
        {/* The block's edges below the ground; above it there is only air. */}
        <path d={`M0 ${edge(s.columns[0]?.groundFt)}V${height}H${len}V${edge(s.columns[s.columns.length - 1]?.groundFt)}`}
          fill="none" stroke="var(--foreground)" strokeOpacity="0.5" />
        {named(s, x).map(({ p, alongKm }) => (
          <text key={p.id} transform={`translate(${x(alongKm) + 3} ${y(p.groundFt) - 4}) rotate(-90)`} fill="var(--foreground)" fontSize="10">{short(p.borewellId)}</text>
        ))}
      </svg>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [slice, stretch]);

  const top = useMemo(() => {
    const u = (e: number) => (e - minE) * pxPerKm, v = (n: number) => (maxN - n) * pxPerKm;
    const line = slice.top.slice(0, slice.faces.filter((f) => f.kind === "front").length + 1);
    return (
      <svg width={u(maxE)} height={v(minN)} className="absolute top-0 left-0 overflow-visible [backface-visibility:hidden]"
        style={{ transformOrigin: "0 0", transform: `translate3d(${minE * pxPerKm}px, ${y(lidFt)}px, ${-maxN * pxPerKm}px) rotateX(90deg)` }}>
        <polygon points={slice.top.map(([e, n]) => `${u(e)},${v(n)}`).join(" ")} fill={LAND} fillOpacity="0.92" stroke="var(--foreground)" strokeOpacity="0.5" />
        <polyline points={line.map(([e, n]) => `${u(e)},${v(n)}`).join(" ")} fill="none" stroke="#16202a" strokeWidth="2.5" />
        <text x={u(line[0][0])} y={v(line[0][1]) - 6} fontSize="14" fontWeight="600" fill="#16202a">A</text>
        <text x={u(line[line.length - 1][0])} y={v(line[line.length - 1][1]) - 6} fontSize="14" fontWeight="600" fill="#16202a">A′</text>
        {slice.pins.map((p) => (
          <g key={p.id}>
            <circle cx={u(p.at[0])} cy={v(p.at[1])} r="5" fill="#0d6883" stroke="#ffffff" strokeWidth="1.5" />
            <text x={u(p.at[0]) + 7} y={v(p.at[1]) + 4} fontSize="11" fill="#16202a">{short(p.borewellId)}</text>
          </g>
        ))}
      </svg>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice, stretch]);

  const turnBy = (turn: number, tilt: number) => setView((v) => ({ turn: v.turn + turn, tilt: Math.max(-90, Math.min(0, v.tilt + tilt)) }));
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    turnBy((e.clientX - drag.current.x) * 0.4, -(e.clientY - drag.current.y) * 0.4);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key];
    if (!step) return;
    e.preventDefault();
    turnBy(step[0], step[1]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{text.slice.howTo}</span>
        <button type="button" className="text-primary underline underline-offset-2" onClick={() => setView(START)}>{text.slice.reset}</button>
      </div>
      <div
        role="img" aria-label={text.slice.label} tabIndex={0}
        className="relative h-[34rem] cursor-grab touch-none select-none overflow-hidden rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        style={{ perspective: "2200px" }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
      >
        <div className="absolute top-1/2 left-1/2 [transform-style:preserve-3d]"
          style={{ transform: `rotateX(${view.tilt}deg) rotateY(${view.turn}deg) translate3d(${-centre.x}px, ${-centre.y}px, ${-centre.z}px)` }}>
          {sides}
          {top}
        </div>
      </div>
    </div>
  );
}
