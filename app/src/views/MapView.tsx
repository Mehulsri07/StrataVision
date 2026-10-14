import { useMemo, useState } from "react";
import { kmBetween, type Borewell } from "@strata/core";
import { NOTHING_PROPOSED, NothingProposedPattern, ProposedColumn, RecordedColumn } from "@/components/ColumnDrawing";
import { SiteMap, located } from "@/components/SiteMap";
import type { Records, SiteRecord } from "@/lib/api";
import type { Model } from "@/lib/useModel";
import { nearbyWells, suggestDrilling, type Suggestion } from "@/model/drilling";
import { predictColumn } from "@/model/model";
import { GROUP_COLOUR, blocks, distanceInWords, sharesInWords, summary, waterHere, type Block } from "@/model/words";
import { text } from "@/text";

type Chosen = { borewell: string } | { spot: [number, number] } | null;

/** Borewells closer than this are at the same spot on the map: their pins lie on top of each other. */
const SAME_PIN_KM = 0.005;

/** The map with its side panel: what was recorded at a borewell, or what is proposed at any other spot. */
export function MapView({ records, model, onHowGood }: { records: Records; model: Model | "failed" | null; onHowGood: () => void }) {
  const { sites } = records;
  const [chosen, setChosen] = useState<Chosen>(null);
  const borewells = useMemo(() => sites.map((s) => s.borewell), [sites]);

  const shown = located(sites).length;
  // A borewell deleted in StrataField since it was selected is simply no longer selected.
  const site = chosen && "borewell" in chosen ? sites.find((s) => s.borewell.id === chosen.borewell) : undefined;
  const spot = chosen && "spot" in chosen ? chosen.spot : null;
  return (
    <div className="flex min-h-0 flex-1">
      <NothingProposedPattern />
      <div className="min-w-0 flex-1">
        <SiteMap sites={sites} selectedId={site?.borewell.id ?? null} picked={spot} onSelect={(id) => setChosen({ borewell: id })} onPick={(lat, lon) => setChosen({ spot: [lat, lon] })} />
      </div>
      <aside className="w-[22rem] shrink-0 space-y-4 overflow-y-auto border-l p-4 text-sm">
        <div>
          <p className="font-medium">{text.onMap(shown)}</p>
          {sites.length > shown && <p className="text-muted-foreground">{text.notShown(sites.length - shown)}</p>}
        </div>
        <div className="space-y-3 border-t pt-4">
          {site ? <Recorded site={site} sites={sites} onSelect={(id) => setChosen({ borewell: id })} />
            // Keyed by the spot, so a layer selected at one spot is not carried to the next.
            : spot ? <Proposed key={spot.join()} spot={spot} model={model} sites={sites} borewells={borewells} onHowGood={onHowGood} />
            : <p className="text-muted-foreground">{text.pickHint}</p>}
        </div>
      </aside>
    </div>
  );
}

function Recorded({ site: { borewell: b, strata }, sites, onSelect }: { site: SiteRecord; sites: SiteRecord[]; onSelect: (id: string) => void }) {
  // Pins at one spot lie on top of each other and only the top one can be clicked, so the others are offered here.
  const here = b.latitude == null || b.longitude == null ? [] : located(sites).filter((s) => kmBetween(b.latitude!, b.longitude!, s.borewell.latitude!, s.borewell.longitude!) <= SAME_PIN_KM);
  return (
    <>
      {here.length > 1 && (
        <div className="space-y-1 rounded-md border p-3">
          <p className="text-muted-foreground">{text.atThisSpot(here.length)}</p>
          <ul className="flex flex-wrap gap-1">
            {here.map((s) => (
              <li key={s.borewell.id}>
                <button type="button" onClick={() => onSelect(s.borewell.id)} aria-pressed={s.borewell.id === b.id}
                  className={`rounded px-2 py-0.5 ${s.borewell.id === b.id ? "bg-secondary font-medium" : "text-primary underline underline-offset-2"}`}>
                  {s.borewell.borewellId}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h2 className="text-base font-semibold">{b.borewellId}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{text.area}</dt><dd>{b.area || text.notRecorded}</dd>
        <dt className="text-muted-foreground">{text.depth}</dt><dd>{b.totalDepth != null ? `${b.totalDepth} ${b.depthUnit}` : text.notRecorded}</dd>
        <dt className="text-muted-foreground">{text.drilled}</dt><dd>{b.date || text.notRecorded}</dd>
      </dl>
      <h3 className="font-medium">{text.recordedLayers}</h3>
      {strata.length > 0
        ? <RecordedColumn strata={strata} water={b.waterLevel != null ? { feet: b.waterLevel, year: b.waterLevelOn?.slice(0, 4) || null } : null} />
        : <p className="text-muted-foreground">{text.noLayers}</p>}
      <p className="text-muted-foreground">{text.openInStrataField}</p>
    </>
  );
}

function Proposed({ spot, model, sites, borewells, onHowGood }: { spot: [number, number]; model: Model | "failed" | null; sites: SiteRecord[]; borewells: Borewell[]; onHowGood: () => void }) {
  const ready = model && model !== "failed" ? model : null;
  // Worked out again when the records change, so a reload shows the new answer for the same spot.
  const column = useMemo(() => (ready ? predictColumn(spot[0], spot[1], ready.prepared, ready.grid) : null), [spot, ready]);
  const water = useMemo(() => waterHere(spot[0], spot[1], borewells), [spot, borewells]);
  const nearby = useMemo(() => (ready ? nearbyWells(spot[0], spot[1], sites, ready.grid) : []), [spot, sites, ready]);
  const [picked, setPicked] = useState<{ top: number; bottom: number } | null>(null);

  const heading = <h2 className="text-base font-semibold">{text.proposedHere}</h2>;
  const howGood = <button type="button" className="text-primary underline underline-offset-2" onClick={onHowGood}>{text.howGood}</button>;
  const waterLine = <p>{water ? text.waterExpected(Math.round(water.feet), distanceInWords(water.nearestKm), water.since) : text.noWater}</p>;
  if (model === "failed") return <>{heading}<p>{text.groundFailed}</p></>;
  if (!ready) return <>{heading}<p className="text-muted-foreground">{text.readingGround}</p></>;
  // With no layers to propose, what was done nearby is still worth seeing.
  const doneNearby = nearby.length > 0 && <Drilling s={suggestDrilling(column ?? [], water, nearby)!} />;
  // Outside the ground-height data nothing can be placed by height, whatever borewells are near.
  if (!column) return <>{heading}<p>{text.noGroundHere}</p>{waterLine}{doneNearby}{howGood}</>;
  if (!column.some((s) => s.likely)) return <>{heading}<p>{text.notEnoughHere}</p>{waterLine}{doneNearby}{howGood}</>;

  // Only the borewells behind what is actually proposed, not those behind stretches left empty.
  const behind = new Map<string, number>();
  for (const step of column) if (step.likely) for (const s of step.sources) behind.set(s.id, s.km);
  // The selected stretch, if it still exists: after a reload the layers may have moved.
  const selected = picked ? blocks(column).find((b) => b.top === picked.top && b.bottom === picked.bottom) ?? null : null;
  const suggestion = suggestDrilling(column, water, nearby);
  return (
    <>
      {heading}
      <p>{text.fromBorewells(behind.size, distanceInWords(Math.min(...behind.values())))}</p>
      {waterLine}
      <ProposedColumn column={column} waterFt={water?.feet} selected={selected} onSelect={(b) => setPicked({ top: b.top, bottom: b.bottom })}
        nearbySlotted={nearby.map((n) => n.slotted)} suggestedSlotted={suggestion?.proposal?.slotted} />
      <ul className="space-y-1 text-muted-foreground">
        <li className="flex items-center gap-2"><Swatch opacity={0.6} dash="6 4" />{text.levelMeaning.likely}</li>
        <li className="flex items-center gap-2"><Swatch opacity={0.3} dash="1.5 4" />{text.levelMeaning.rough}</li>
        <li className="flex items-center gap-2"><Swatch />{text.levelMeaning.none}</li>
        {nearby.some((n) => n.slotted.length) && <li className="flex items-center gap-2"><PipeSwatch />{text.drilling.keyNearby}</li>}
        {suggestion?.proposal && <li className="flex items-center gap-2"><PipeSwatch suggested />{text.drilling.keySuggested}</li>}
      </ul>
      {selected ? <BlockDetails block={selected} /> : <p className="text-muted-foreground">{text.clickLayer}</p>}
      {suggestion && <Drilling s={suggestion} />}
      {howGood}
    </>
  );
}

/** What a selected stretch of the column is made of, and the borewells it was worked out from. */
function BlockDetails({ block }: { block: Block }) {
  const { shares, sources } = summary(block);
  const first = sources.slice(0, 8);
  return (
    <div className="space-y-1 rounded-md border p-3">
      <p className="font-medium">{text.depths(block.top, block.bottom)}</p>
      <p>{shares ? sharesInWords(shares) : text.levels.none}</p>
      <p className="text-muted-foreground">{text.levelMeaning[block.level]}</p>
      {first.length > 0 && (
        <>
          <p className="pt-1 text-muted-foreground">{text.workedOutFrom}</p>
          <ul>
            {first.map((s) => <li key={s.id}>{s.borewellId} · {distanceInWords(s.km)}</li>)}
            {sources.length > first.length && <li className="text-muted-foreground">{text.andMore(sources.length - first.length)}</li>}
          </ul>
        </>
      )}
    </div>
  );
}

/** Both halves of the drilling suggestion, always together, so the suggestion can be weighed against what was done. */
function Drilling({ s }: { s: Suggestion }) {
  const t = text.drilling, ft = (n: number) => Math.round(n);
  return (
    <section className="space-y-2 rounded-md border p-3">
      <h3 className="font-semibold">{t.title}</h3>
      <p className="text-muted-foreground">{t.note}</p>
      <h4 className="pt-1 font-medium">{t.doneNearby}</h4>
      {s.drilled && <p>{t.drilled(ft(s.drilled.low), ft(s.drilled.middle), ft(s.drilled.high))}</p>}
      {s.pump && <p>{t.pump(ft(s.pump.low), ft(s.pump.middle), ft(s.pump.high))}</p>}
      <ul className="text-muted-foreground">
        {s.nearby.map((n) => <li key={n.id}>{t.well(n.borewellId, distanceInWords(n.km), n.drilledFt != null ? ft(n.drilledFt) : null)}</li>)}
      </ul>
      <h4 className="pt-1 font-medium">{t.suggest}</h4>
      {s.proposal ? (
        <>
          <p>{t.water(ft(s.proposal.waterFt))}</p>
          <ul>{s.proposal.slotted.map((p) => <li key={p.top}>{t.slotted(ft(p.top), ft(p.bottom), text.levels[p.level])}</li>)}</ul>
          <p className="font-medium">{t.drillTo(ft(s.proposal.drillToFt), s.proposal.slotted[s.proposal.slotted.length - 1].level === "rough")}</p>
          <p className="text-muted-foreground">{t.drillToNote[s.proposal.limit]}</p>
        </>
      ) : <p>{t[s.noProposal ?? "noWaterBearing"]}</p>}
    </section>
  );
}

function PipeSwatch({ suggested = false }: { suggested?: boolean }) {
  return (
    <svg width="18" height="14" className="shrink-0" aria-hidden="true">
      <line x1="9" x2="9" y1="1" y2="13" stroke="#2f7fb8" strokeWidth={suggested ? 4 : 2} strokeDasharray={suggested ? "5 3" : undefined} />
    </svg>
  );
}

/** A small sample of how a level is drawn, for the key under the column. */
function Swatch({ opacity, dash }: { opacity?: number; dash?: string }) {
  return (
    <svg width="18" height="14" className="shrink-0" aria-hidden="true">
      {opacity
        ? <rect x="1" y="1" width="16" height="12" fill={GROUP_COLOUR.waterBearing} fillOpacity={opacity} stroke="var(--foreground)" strokeOpacity="0.55" strokeDasharray={dash} />
        : <rect x="1" y="1" width="16" height="12" fill={NOTHING_PROPOSED} stroke="var(--muted-foreground)" strokeOpacity="0.3" strokeDasharray="1.5 4" />}
    </svg>
  );
}
