import type { KeyboardEvent, ReactNode } from "react";
import type { StrataLayer } from "@strata/core";
import type { Step } from "@/model/model";
import { GROUP_COLOUR, GROUP_NAME, blocks, type Block } from "@/model/words";
import { text } from "@/text";

// One drawing size for both kinds of column, so a recorded and a proposed one compare by eye.
const W = 300, TOP = 10, H = 420, COL_X = 44, COL_W = 90, LABEL_X = COL_X + COL_W + 8;
const WATER = "#2f7fb8";

/** What both columns share: the depth ruler, the water line, and room for the layers. */
function Frame({ depth, marks, waterFt, label, children }: {
  depth: number; marks: number[]; waterFt?: number | null; label: string;
  children: (y: (feet: number) => number, labelY: (top: number, bottom: number) => number | null) => ReactNode;
}) {
  const y = (feet: number) => TOP + (feet / depth) * H;
  const ticks = [...new Set(marks)].filter((d) => d >= 0 && d <= depth).sort((a, b) => a - b);
  // Marks closer than a line of text keep their tick but only one of them is numbered.
  const numbered = ticks.filter((d, i) => i === 0 || i === ticks.length - 1 || y(d) - y(ticks[i - 1]) >= 11)
    .filter((d, i, kept) => i === kept.length - 1 || y(kept[i + 1]) - y(d) >= 11);
  const water = waterFt != null && waterFt >= 0 && waterFt <= depth ? waterFt : null;
  // A layer's name sits in the middle of the layer, moved clear of the water label, or left out
  // when the layer is too thin to hold it.
  const labelY = (top: number, bottom: number) => {
    const height = y(bottom) - y(top);
    if (height < 14) return null;
    const centre = y(top) + height / 2 + 4;
    if (water == null || Math.abs(centre - (y(water) - 4)) >= 13) return centre;
    const below = y(water) + 13;
    return below <= y(bottom) - 3 ? below : null;
  };
  return (
    <svg viewBox={`0 0 ${W} ${TOP + H + 10}`} width={W} role="img" aria-label={label} className="max-w-full text-[11px]">
      <defs>
        <pattern id="nothing-proposed" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-foreground)" strokeOpacity="0.35" />
        </pattern>
      </defs>
      {ticks.map((d) => <line key={d} x1={COL_X - 5} x2={COL_X} y1={y(d)} y2={y(d)} stroke="var(--muted-foreground)" />)}
      {numbered.map((d) => <text key={d} x={COL_X - 8} y={y(d) + 4} textAnchor="end" fill="var(--muted-foreground)">{Math.round(d)}</text>)}
      {children(y, labelY)}
      {water != null && (
        <>
          <line x1={COL_X - 5} x2={W - 4} y1={y(water)} y2={y(water)} stroke={WATER} strokeWidth="1.5" />
          <text x={W - 4} y={y(water) - 4} textAnchor="end" fill={WATER}>{text.waterAbout(Math.round(water))}</text>
        </>
      )}
    </svg>
  );
}

const onEnterOrSpace = (action: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    action();
  }
};

/**
 * A proposed column. It must never look measured: faded, with dashed edges; paler still where it
 * is only a rough guess; and left empty, hatched, where there is not enough data to propose anything.
 */
export function ProposedColumn({ column, waterFt, selected, onSelect }: {
  column: readonly Step[]; waterFt?: number | null; selected: { top: number; bottom: number } | null; onSelect: (block: Block) => void;
}) {
  const all = blocks(column);
  const depth = all[all.length - 1]?.bottom ?? 1;
  return (
    <Frame depth={depth} marks={[0, ...all.map((b) => b.bottom)]} waterFt={waterFt} label={text.proposedHere}>
      {(y, labelY) => all.map((b) => {
        const name = b.group ? GROUP_NAME[b.group] : text.levels.none;
        const at = labelY(b.top, b.bottom);
        const isSelected = selected?.top === b.top && selected.bottom === b.bottom;
        const box = { x: COL_X, y: y(b.top), width: COL_W, height: y(b.bottom) - y(b.top) };
        return (
          <g
            key={b.top} role="button" tabIndex={0} className="cursor-pointer outline-none [&:focus-visible>.outline]:opacity-100 [&:hover>.outline]:opacity-100"
            aria-label={text.blockLabel(name, text.levels[b.level], b.top, b.bottom)} aria-pressed={isSelected}
            onClick={() => onSelect(b)} onKeyDown={onEnterOrSpace(() => onSelect(b))}
          >
            {b.group ? (
              <rect {...box} fill={GROUP_COLOUR[b.group]} fillOpacity={b.level === "likely" ? 0.6 : 0.3}
                stroke="var(--foreground)" strokeOpacity="0.55" strokeDasharray={b.level === "likely" ? "6 4" : "1.5 4"} />
            ) : (
              <rect {...box} fill="url(#nothing-proposed)" />
            )}
            <rect {...box} className="outline" fill="none" stroke="var(--primary)" strokeWidth="2" opacity={isSelected ? 1 : 0} />
            {at != null && (
              <text x={LABEL_X} y={at} fill={b.group ? "var(--foreground)" : "var(--muted-foreground)"}>
                {name}{b.level === "rough" && <tspan fill="var(--muted-foreground)"> · {text.levels.rough.toLowerCase()}</tspan>}
              </text>
            )}
          </g>
        );
      })}
    </Frame>
  );
}

/** A recorded column: the borewell's own layers in their own colours, solid. Depths are feet. */
export function RecordedColumn({ strata, waterFt }: { strata: StrataLayer[]; waterFt?: number | null }) {
  const layers = [...strata].sort((a, b) => a.startDepth - b.startDepth).filter((l) => l.endDepth > l.startDepth);
  const depth = Math.max(1, ...layers.map((l) => l.endDepth));
  return (
    <Frame depth={depth} marks={[0, ...layers.flatMap((l) => [l.startDepth, l.endDepth])]} waterFt={waterFt} label={text.recordedLayers}>
      {(y, labelY) => layers.map((l) => {
        const at = labelY(l.startDepth, l.endDepth);
        return (
          <g key={l.id}>
            <rect x={COL_X} y={y(l.startDepth)} width={COL_W} height={y(l.endDepth) - y(l.startDepth)} fill={l.color} stroke="var(--foreground)" strokeOpacity="0.4" />
            {at != null && <text x={LABEL_X} y={at} fill="var(--foreground)">{l.material}</text>}
          </g>
        );
      })}
    </Frame>
  );
}
