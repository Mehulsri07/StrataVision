import type { ReactNode, Ref } from "react";
import { GROUPS } from "@/model/groups";
import { heightRange, type Section } from "@/model/section";
import { GROUP_COLOUR, GROUP_NAME, blocks } from "@/model/words";
import { text } from "@/text";

// Drawing size; the picture saved is the same.
const W = 1000, L = 64, R = 24, TOP = 96, PH = 380, KEY = 64;
const PW = W - L - R, H = TOP + PH + 30 + KEY;
const WATER = "#2f7fb8";
const HATCH = "url(#section-hatch)";

/** A round step for ruler marks so that about `count` of them span `range`. */
function niceStep(range: number, count: number) {
  const raw = range / count, p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
}

/** Points of a line that breaks where a value is missing. */
function brokenLine(points: ([number, number] | null)[]) {
  let d = "", open = false;
  for (const pt of points) {
    if (!pt) open = false;
    else {
      d += `${open ? "L" : "M"}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`;
      open = true;
    }
  }
  return d;
}

export const short = (id: string) => (id.length > 14 ? `${id.slice(0, 13)}…` : id);

/** The hatch for "not enough data", for each drawing that uses it. */
export const hatchDefs = (
  <pattern id="section-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-foreground)" strokeOpacity="0.45" />
  </pattern>
);

/**
 * The ground along a section, at a given scale: the model's columns, the ground and water lines,
 * the bends, and the borewells drawn solid. `x` takes km along the line, `y` feet above sea level,
 * and `bottom` is where a column with nobody in reach stops being hatched.
 */
export function SectionPlot({ s, x, y, bottom }: { s: Section; x: (km: number) => number; y: (ft: number) => number; bottom: number }) {
  const colW = (x(s.lengthKm) - x(0)) / Math.max(1, s.columns.length - 1);
  const cells = s.columns.flatMap((c, i) => {
    if (c.groundFt == null || !c.steps) return [];
    const g = c.groundFt, cx = x(c.km) - colW / 2;
    if (c.steps.length === 0) return [{ key: `${i}`, x: cx, top: y(g), bottom, group: null, level: "none" as const }];
    return blocks(c.steps).map((b) => ({ key: `${i}-${b.top}`, x: cx, top: y(g - b.top), bottom: y(g - b.bottom), group: b.group, level: b.level }));
  });
  return (
    <>
      {/* The model's columns. Each strength is faded as one layer, so neighbouring columns can
          overlap a little without seams. Nobody within reach: hatched from the ground down. */}
      {(["likely", "rough", "none"] as const).map((level) => (
        <g key={level} opacity={level === "likely" ? 0.6 : level === "rough" ? 0.3 : 1}>
          {cells.filter((c) => c.level === level).map((c) => (
            <rect key={c.key} x={c.x} y={c.top} width={colW + 0.5} height={c.bottom - c.top} fill={c.group ? GROUP_COLOUR[c.group] : HATCH} />
          ))}
        </g>
      ))}
      <path d={brokenLine(s.columns.map((c) => (c.groundFt == null ? null : [x(c.km), y(c.groundFt)])))} fill="none" stroke="var(--foreground)" strokeWidth="1.5" />
      <path d={brokenLine(s.columns.map((c) => (c.groundFt == null || c.waterFt == null ? null : [x(c.km), y(c.groundFt - c.waterFt)])))}
        fill="none" stroke={WATER} strokeWidth="1.5" strokeDasharray="6 4" />
      {s.bendsKm.map((k) => <line key={k} x1={x(k)} x2={x(k)} y1={y(Infinity)} y2={bottom} stroke="var(--muted-foreground)" strokeDasharray="2 4" />)}
      {/* The borewells: what was measured, solid. */}
      {s.borewells.map(({ p, alongKm }) => (
        <g key={p.id}>
          <title>{p.borewellId}</title>
          {p.runs.map((r, j) => (
            <rect key={j} x={x(alongKm) - 5} y={y(r.topFt)} width={10} height={y(r.bottomFt) - y(r.topFt)} fill={GROUP_COLOUR[r.group]} stroke="var(--foreground)" strokeWidth="0.75" />
          ))}
        </g>
      ))}
    </>
  );
}

/** Borewells at one spot, or almost, named once, so the names stay readable. */
export function named(s: Section, x: (km: number) => number) {
  const out: Section["borewells"] = [];
  for (const b of s.borewells) if (!out.length || x(b.alongKm) - x(out[out.length - 1].alongKm) >= 11) out.push(b);
  return out;
}

/**
 * A section through the model. Heights are feet above sea level, so layers line up by height
 * whatever the ground does. Borewells near the line are drawn solid, as measured; between them the
 * model's columns are faded (likely), paler (rough guess) or hatched (not enough data).
 */
export function SectionDrawing({ section: s, ref }: { section: Section; ref?: Ref<SVGSVGElement> }) {
  // The view only draws a section with something in it, so there is always a range.
  const { highFt, lowFt } = heightRange([s])!;
  // Borewells up to 50 m past either end belong to the line; they are drawn at its end.
  const x = (km: number) => L + (s.lengthKm ? (Math.min(Math.max(km, 0), s.lengthKm) / s.lengthKm) * PW : 0);
  const y = (ft: number) => TOP + ((highFt - Math.min(ft, highFt)) / (highFt - lowFt)) * PH;

  const hStep = niceStep(highFt - lowFt, 8);
  const heights: number[] = [];
  for (let h = Math.ceil(lowFt / hStep) * hStep; h <= highFt; h += hStep) heights.push(h);
  const kStep = niceStep(s.lengthKm || 1, 8);
  const kms: number[] = [];
  for (let k = 0; k <= s.lengthKm + 1e-9; k += kStep) kms.push(k);

  const key: [string, (kx: number) => ReactNode][] = [
    ...GROUPS.map((g): [string, (kx: number) => ReactNode] => [GROUP_NAME[g], (kx) => <rect x={kx} y={-9} width={14} height={10} fill={GROUP_COLOUR[g]} stroke="var(--foreground)" strokeOpacity="0.5" />]),
    [text.section.keyMeasured, (kx) => <rect x={kx + 3} y={-11} width={8} height={14} fill={GROUP_COLOUR.clay} stroke="var(--foreground)" />],
    [text.levels.likely, (kx) => <rect x={kx} y={-9} width={14} height={10} fill={GROUP_COLOUR.waterBearing} fillOpacity={0.6} />],
    [text.levels.rough, (kx) => <rect x={kx} y={-9} width={14} height={10} fill={GROUP_COLOUR.waterBearing} fillOpacity={0.3} />],
    [text.levels.none, (kx) => <rect x={kx} y={-9} width={14} height={10} fill={HATCH} stroke="var(--muted-foreground)" strokeOpacity="0.4" />],
    [text.section.keyWater, (kx) => <line x1={kx} x2={kx + 14} y1={-4} y2={-4} stroke={WATER} strokeWidth="1.5" strokeDasharray="4 3" />],
  ];
  // Two rows of key, laid out by a rough width per letter.
  const keyRows: { at: number; row: number; entry: (typeof key)[number] }[] = [];
  for (let i = 0, at = L, row = 0; i < key.length; i++) {
    const width = 20 + key[i][0].length * 7 + 20;
    if (at + width > W - R) [at, row] = [L, row + 1];
    keyRows.push({ at, row, entry: key[i] });
    at += width;
  }

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label={text.section.drawingLabel} fontSize={11} className="h-auto max-w-full">
      <defs>
        {hatchDefs}
        <clipPath id="section-plot"><rect x={L} y={0} width={PW} height={TOP + PH} /></clipPath>
      </defs>

      {/* Ruler: height above sea level, and distance along the line. */}
      {heights.map((h) => (
        <g key={h}>
          <line x1={L} x2={W - R} y1={y(h)} y2={y(h)} stroke="var(--muted-foreground)" strokeOpacity="0.15" />
          <text x={L - 6} y={y(h) + 4} textAnchor="end" fill="var(--muted-foreground)">{Math.round(h)}</text>
        </g>
      ))}
      <text transform={`translate(14 ${TOP + PH / 2}) rotate(-90)`} textAnchor="middle" fill="var(--muted-foreground)">{text.section.heightAxis}</text>
      {kms.map((k) => (
        <g key={k}>
          <line x1={x(k)} x2={x(k)} y1={TOP + PH} y2={TOP + PH + 5} stroke="var(--muted-foreground)" />
          <text x={x(k)} y={TOP + PH + 17} textAnchor="middle" fill="var(--muted-foreground)">{Number(k.toFixed(2))}</text>
        </g>
      ))}
      <text x={W - R} y={TOP + PH + 30} textAnchor="end" fill="var(--muted-foreground)">{text.section.kmAxis}</text>
      <line x1={L} x2={W - R} y1={TOP + PH} y2={TOP + PH} stroke="var(--muted-foreground)" />

      <g clipPath="url(#section-plot)"><SectionPlot s={s} x={x} y={y} bottom={TOP + PH} /></g>

      {named(s, x).map(({ p, alongKm }) => (
        <text key={p.id} transform={`translate(${x(alongKm) + 3} ${y(p.groundFt) - 4}) rotate(-90)`} fill="var(--foreground)" fontSize="10">{short(p.borewellId)}</text>
      ))}
      {s.bendsKm.map((k) => <text key={k} x={x(k)} y={TOP + PH - 4} textAnchor="middle" fill="var(--muted-foreground)">{text.section.bend}</text>)}
      <text x={L} y={14} fontWeight="600" fill="var(--foreground)" fontSize="13">A</text>
      <text x={W - R} y={14} fontWeight="600" textAnchor="end" fill="var(--foreground)" fontSize="13">A′</text>

      <g transform={`translate(0 ${TOP + PH + 52})`}>
        {keyRows.map(({ at, row, entry: [label, swatch] }) => (
          <g key={label} transform={`translate(0 ${row * 20})`}>
            {swatch(at)}
            <text x={at + 20} y={0} fill="var(--foreground)">{label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
