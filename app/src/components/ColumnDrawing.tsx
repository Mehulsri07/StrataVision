import type { KeyboardEvent, ReactNode } from "react";
import type { StrataLayer } from "@strata/core";
import type { Step } from "@/model/model";
import { GROUP_COLOUR, GROUP_NAME, blocks, type Block } from "@/model/words";
import { text } from "@/text";

// One drawing size for both kinds of column, so a recorded and a proposed one compare by eye.
const W = 300, TOP = 10, H = 420, COL_X = 44, COL_W = 90, LABEL_X = COL_X + COL_W + 8;
const WATER = "#2f7fb8";

/** A water level to draw: expected (worked out, so dashed) or measured (solid, with its year if known). */
export type Water = { feet: number; expected: true } | { feet: number; expected: false; year: string | null };

/** What both columns share: the depth ruler, the water line, and room for the layers. */
function Frame({ depth, marks, water: given, label, clickable = false, children }: {
  depth: number; marks: number[]; water?: Water | null; label: string; clickable?: boolean;
  children: (y: (feet: number) => number, labelY: (top: number, bottom: number) => number | null) => ReactNode;
}) {
  const y = (feet: number) => TOP + (feet / depth) * H;
  const ticks = [...new Set(marks)].filter((d) => d >= 0 && d <= depth).sort((a, b) => a - b);
  // Marks closer than a line of text keep their tick but only one of them is numbered.
  const numbered = ticks.filter((d, i) => i === 0 || i === ticks.length - 1 || y(d) - y(ticks[i - 1]) >= 11)
    .filter((d, i, kept) => i === kept.length - 1 || y(kept[i + 1]) - y(d) >= 11);
  const water = given && given.feet >= 0 && given.feet <= depth ? given : null;
  // A layer's name sits in the middle of the layer, moved clear of the water label, or left out
  // when the layer is too thin to hold it.
  const labelY = (top: number, bottom: number) => {
    const height = y(bottom) - y(top);
    if (height < 14) return null;
    const centre = y(top) + height / 2 + 4;
    if (!water || Math.abs(centre - (y(water.feet) - 4)) >= 13) return centre;
    const below = y(water.feet) + 13;
    return below <= y(bottom) - 3 ? below : null;
  };
  return (
    // A group, not an image, when its layers can be clicked: inside an image they would be hidden from screen readers.
    <svg viewBox={`0 0 ${W} ${TOP + H + 10}`} width={W} role={clickable ? "group" : "img"} aria-label={label} className="max-w-full text-[11px]">
      {ticks.map((d) => <line key={d} x1={COL_X - 5} x2={COL_X} y1={y(d)} y2={y(d)} stroke="var(--muted-foreground)" />)}
      {numbered.map((d) => <text key={d} x={COL_X - 8} y={y(d) + 4} textAnchor="end" fill="var(--muted-foreground)">{Math.round(d)}</text>)}
      {children(y, labelY)}
      {water && (
        <>
          <line x1={COL_X - 5} x2={W - 4} y1={y(water.feet)} y2={y(water.feet)} stroke={WATER} strokeWidth="1.5" strokeDasharray={water.expected ? "6 4" : undefined} />
          <text x={W - 4} y={y(water.feet) - 4} textAnchor="end" fill={WATER}>
            {water.expected ? text.waterExpectedShort(Math.round(water.feet)) : text.waterMeasured(Math.round(water.feet), water.year)}
          </text>
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

/** The hatch for "nothing is proposed here". Drawn once per page; see `NothingProposedPattern`. */
export const NOTHING_PROPOSED = "url(#nothing-proposed)";
export function NothingProposedPattern() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <pattern id="nothing-proposed" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-foreground)" strokeOpacity="0.45" />
        </pattern>
      </defs>
    </svg>
  );
}

/**
 * A proposed column. It must never look measured: faded, with dashed edges; paler still where it
 * is only a rough guess; and left empty, hatched, where there is not enough data to propose anything.
 * Its water level, being worked out too, is a dashed line.
 */
export function ProposedColumn({ column, waterFt, selected, onSelect }: {
  column: readonly Step[]; waterFt?: number | null; selected: Block | null; onSelect: (block: Block) => void;
}) {
  const all = blocks(column);
  const depth = all[all.length - 1]?.bottom ?? 1;
  return (
    <Frame depth={depth} marks={[0, ...all.map((b) => b.bottom)]} water={waterFt != null ? { feet: waterFt, expected: true } : null} label={text.proposedHere} clickable>
      {(y, labelY) => all.map((b) => {
        const name = b.group ? GROUP_NAME[b.group] : text.levels.none;
        const at = labelY(b.top, b.bottom);
        const isSelected = selected?.top === b.top && selected.bottom === b.bottom;
        const box = { x: COL_X, y: y(b.top), width: COL_W, height: y(b.bottom) - y(b.top) };
        return (
          <g
            key={b.top} role="button" tabIndex={0} className="cursor-pointer outline-none [&:focus-visible>.reach]:opacity-100 [&:hover>.reach]:opacity-60"
            aria-label={text.blockLabel(name, text.levels[b.level], b.top, b.bottom)} aria-pressed={isSelected}
            onClick={() => onSelect(b)} onKeyDown={onEnterOrSpace(() => onSelect(b))}
          >
            {b.group ? (
              <rect {...box} fill={GROUP_COLOUR[b.group]} fillOpacity={b.level === "likely" ? 0.6 : 0.3}
                stroke="var(--foreground)" strokeOpacity="0.55" strokeDasharray={b.level === "likely" ? "6 4" : "1.5 4"} />
            ) : (
              <rect {...box} fill={NOTHING_PROPOSED} stroke="var(--muted-foreground)" strokeOpacity="0.3" strokeDasharray="1.5 4" />
            )}
            {/* Selected: a solid frame. Reached by keyboard or mouse but not selected: a dashed one. */}
            {isSelected
              ? <rect {...box} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
              : <rect {...box} className="reach" fill="none" stroke="var(--primary)" strokeWidth="2" strokeDasharray="3 3" opacity="0" />}
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
export function RecordedColumn({ strata, water }: { strata: StrataLayer[]; water?: { feet: number; year: string | null } | null }) {
  const layers = [...strata].sort((a, b) => a.startDepth - b.startDepth).filter((l) => l.endDepth > l.startDepth);
  const depth = Math.max(1, ...layers.map((l) => l.endDepth));
  return (
    <Frame depth={depth} marks={[0, ...layers.flatMap((l) => [l.startDepth, l.endDepth])]} water={water ? { ...water, expected: false } : null} label={text.recordedLayers}>
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
