import { useMemo, useState } from "react";
import type { Borewell } from "@strata/core";
import { ProposedColumn, RecordedColumn } from "@/components/ColumnDrawing";
import { SiteMap, located } from "@/components/SiteMap";
import type { Records, SiteRecord } from "@/lib/api";
import type { Model } from "@/lib/useModel";
import { predictColumn, type Step } from "@/model/model";
import { GROUP_COLOUR, distanceInWords, sharesInWords, waterHere } from "@/model/words";
import { text } from "@/text";

type Chosen = { borewell: string } | { spot: [number, number] } | null;

/** The map with its side panel: what was recorded at a borewell, or what is proposed at any other spot. */
export function MapView({ records, model, onHowGood }: { records: Records; model: Model | "failed" | null; onHowGood: () => void }) {
  const { sites } = records;
  const [chosen, setChosen] = useState<Chosen>(null);

  const shown = located(sites).length;
  // A borewell deleted in StrataField since it was selected is simply no longer selected.
  const site = chosen && "borewell" in chosen ? sites.find((s) => s.borewell.id === chosen.borewell) : undefined;
  const spot = chosen && "spot" in chosen ? chosen.spot : null;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1">
        <SiteMap sites={sites} selectedId={site?.borewell.id ?? null} picked={spot} onSelect={(id) => setChosen({ borewell: id })} onPick={(lat, lon) => setChosen({ spot: [lat, lon] })} />
      </div>
      <aside className="w-[22rem] shrink-0 space-y-4 overflow-y-auto border-l p-4 text-sm">
        <div>
          <p className="font-medium">{text.onMap(shown)}</p>
          {sites.length > shown && <p className="text-muted-foreground">{text.notShown(sites.length - shown)}</p>}
        </div>
        <div className="space-y-3 border-t pt-4">
          {site ? <Recorded site={site} />
            // Keyed by the spot, so a layer selected at one spot is not carried to the next.
            : spot ? <Proposed key={spot.join()} spot={spot} model={model} borewells={sites.map((s) => s.borewell)} onHowGood={onHowGood} />
            : <p className="text-muted-foreground">{text.pickHint}</p>}
        </div>
      </aside>
    </div>
  );
}

function Recorded({ site: { borewell: b, strata } }: { site: SiteRecord }) {
  return (
    <>
      <h2 className="text-base font-semibold">{b.borewellId}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{text.area}</dt><dd>{b.area || text.notRecorded}</dd>
        <dt className="text-muted-foreground">{text.depth}</dt><dd>{b.totalDepth != null ? `${b.totalDepth} ${b.depthUnit}` : text.notRecorded}</dd>
        <dt className="text-muted-foreground">{text.drilled}</dt><dd>{b.date || text.notRecorded}</dd>
      </dl>
      <h3 className="font-medium">{text.recordedLayers}</h3>
      {strata.length > 0 ? <RecordedColumn strata={strata} waterFt={b.waterLevel} /> : <p className="text-muted-foreground">{text.noLayers}</p>}
      <p className="text-muted-foreground">{text.openInStrataField}</p>
    </>
  );
}

function Proposed({ spot, model, borewells, onHowGood }: { spot: [number, number]; model: Model | "failed" | null; borewells: Borewell[]; onHowGood: () => void }) {
  const ready = model && model !== "failed" ? model : null;
  // Worked out again when the records change, so a reload shows the new answer for the same spot.
  const column = useMemo(() => (ready ? predictColumn(spot[0], spot[1], ready.prepared, ready.grid) : null), [spot, ready]);
  const water = useMemo(() => waterHere(spot[0], spot[1], borewells), [spot, borewells]);
  const [picked, setPicked] = useState<{ top: number; bottom: number } | null>(null);

  const heading = <h2 className="text-base font-semibold">{text.proposedHere}</h2>;
  const howGood = <button type="button" className="text-primary underline underline-offset-2" onClick={onHowGood}>{text.howGood}</button>;
  if (model === "failed") return <>{heading}<p>{text.groundFailed}</p></>;
  if (!ready) return <>{heading}<p className="text-muted-foreground">{text.readingGround}</p></>;
  if (!column || !column.some((s) => s.likely)) return <>{heading}<p>{text.notEnoughHere}</p>{howGood}</>;

  const behind = new Map<string, number>();
  for (const step of column) for (const s of step.sources) behind.set(s.id, s.km);
  return (
    <>
      {heading}
      <p>{text.fromBorewells(behind.size, distanceInWords(Math.min(...behind.values())))}</p>
      <p>{water ? text.waterExpected(Math.round(water.feet), water.since) : text.noWater}</p>
      <ProposedColumn column={column} waterFt={water?.feet} selected={picked} onSelect={(b) => setPicked({ top: b.top, bottom: b.bottom })} />
      <ul className="space-y-1 text-muted-foreground">
        <li className="flex items-center gap-2"><Swatch opacity={0.6} dash="6 4" />{text.levelMeaning.likely}</li>
        <li className="flex items-center gap-2"><Swatch opacity={0.3} dash="1.5 4" />{text.levelMeaning.rough}</li>
        <li className="flex items-center gap-2"><Swatch />{text.levelMeaning.none}</li>
      </ul>
      {picked ? <BlockDetails column={column} top={picked.top} bottom={picked.bottom} /> : <p className="text-muted-foreground">{text.clickLayer}</p>}
      {howGood}
    </>
  );
}

/** What a selected stretch of the column is made of, and the borewells it was worked out from. */
function BlockDetails({ column, top, bottom }: { column: readonly Step[]; top: number; bottom: number }) {
  const steps = column.filter((s) => s.top >= top && s.bottom <= bottom);
  const step = steps[Math.floor(steps.length / 2)];
  if (!step) return null; // the records changed and this stretch is gone
  const sources = step.sources.slice(0, 8);
  return (
    <div className="space-y-1 rounded-md border p-3">
      <p className="font-medium">{text.depths(top, bottom)}</p>
      <p>{step.likely && step.shares ? sharesInWords(step.shares) : text.levels.none}</p>
      <p className="text-muted-foreground">{text.levelMeaning[step.confidence]}</p>
      {sources.length > 0 && (
        <>
          <p className="pt-1 text-muted-foreground">{text.workedOutFrom}</p>
          <ul>
            {sources.map((s) => <li key={s.id}>{s.borewellId} · {distanceInWords(s.km)}</li>)}
            {step.sources.length > sources.length && <li className="text-muted-foreground">{text.andMore(step.sources.length - sources.length)}</li>}
          </ul>
        </>
      )}
    </div>
  );
}

/** A small sample of how a level is drawn, for the key under the column. */
function Swatch({ opacity, dash }: { opacity?: number; dash?: string }) {
  return (
    <svg width="18" height="14" className="shrink-0" aria-hidden="true">
      <defs>
        <pattern id="swatch-nothing" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--muted-foreground)" strokeOpacity="0.5" />
        </pattern>
      </defs>
      {opacity
        ? <rect x="1" y="1" width="16" height="12" fill={GROUP_COLOUR.waterBearing} fillOpacity={opacity} stroke="var(--foreground)" strokeOpacity="0.55" strokeDasharray={dash} />
        : <rect x="1" y="1" width="16" height="12" fill="url(#swatch-nothing)" />}
    </svg>
  );
}
