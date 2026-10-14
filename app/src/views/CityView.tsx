import { useEffect, useMemo, useState } from "react";
import { ImageOverlay } from "react-leaflet";
import { kmBetween } from "@strata/core";
import { Button } from "@/components/ui/button";
import { SiteMap } from "@/components/SiteMap";
import type { Records } from "@/lib/api";
import type { Model } from "@/lib/useModel";
import { WET_RAMP, cityArea, cityPoint, paint, type CityGrid, type CityMode } from "@/model/cityMap";
import { STEP_FT } from "@/model/constants";
import { GROUPS } from "@/model/groups";
import { GROUP_COLOUR, GROUP_NAME } from "@/model/words";
import { text } from "@/text";

/** Points along each side of the map. */
const N = 100;

/** The model painted over the whole city, in one of three modes. */
export function CityView({ records, model, onHowGood }: { records: Records; model: Model | "failed" | null; onHowGood: () => void }) {
  const ready = model && model !== "failed" ? model : null;
  const [grid, setGrid] = useState<CityGrid | null>(null);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<CityMode>("ground");
  const [depthFt, setDepthFt] = useState(50);
  const t = text.city;

  // 10,000 columns take a few seconds, so they are worked out a few at a time between screen updates.
  // ponytail: on the main thread in batches; a Web Worker if records grow well past a thousand.
  const prepared = ready?.prepared, ground = ready?.grid;
  useEffect(() => {
    if (!prepared || !ground) return;
    const area = cityArea(prepared);
    if (!area) return;
    const points: CityGrid["points"] = [];
    let row = 0, timer = 0;
    const work = () => {
      const until = performance.now() + 30;
      while (row < N && performance.now() < until) {
        const lat = area.north - ((row + 0.5) * (area.north - area.south)) / N;
        for (let col = 0; col < N; col++) points.push(cityPoint(lat, area.west + ((col + 0.5) * (area.east - area.west)) / N, prepared, ground));
        row++;
      }
      setProgress(row / N);
      if (row < N) timer = window.setTimeout(work, 0);
      else setGrid({ ...area, cols: N, rows: N, points });
    };
    timer = window.setTimeout(work, 0);
    return () => clearTimeout(timer);
  }, [prepared, ground]);

  const deepestFt = grid ? Math.max(STEP_FT, ...grid.points.map((p) => (p?.codes.length ?? 0) * STEP_FT)) : STEP_FT;
  const depth = Math.min(depthFt, deepestFt - STEP_FT);
  const picture = useMemo(() => {
    if (!grid) return null;
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [grid.cols, grid.rows];
    canvas.getContext("2d")!.putImageData(new ImageData(paint(grid, mode, depth), grid.cols, grid.rows), 0, 0);
    return canvas.toDataURL();
  }, [grid, mode, depth]);
  const cellM = grid ? Math.round((kmBetween(grid.south, grid.west, grid.south, grid.east) / grid.cols) * 1000) : 0;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1">
        <SiteMap sites={records.sites} selectedId={null} picked={null} onSelect={() => {}} onPick={() => {}}>
          {grid && picture && (
            <ImageOverlay url={picture} bounds={[[grid.south, grid.west], [grid.north, grid.east]]} className="[image-rendering:pixelated]" />
          )}
        </SiteMap>
      </div>
      <aside className="w-[22rem] shrink-0 space-y-4 overflow-y-auto border-l p-4 text-sm">
        <div className="flex flex-col gap-1" role="radiogroup" aria-label={t.modeLabel}>
          {(["ground", "wet", "thin"] as const).map((m) => (
            <Button key={m} variant={mode === m ? "secondary" : "ghost"} size="sm" className="justify-start" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
              {t.modes[m]}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground">{t.about[mode]}</p>
        {mode !== "wet" && (
          <label className="block space-y-1">
            <span>{t.depth(depth)}</span>
            <input type="range" className="w-full" min={0} max={deepestFt - STEP_FT} step={STEP_FT} value={depth} onChange={(e) => setDepthFt(Number(e.target.value))} />
          </label>
        )}
        {model === "failed" ? <p>{text.groundFailed}</p>
          : !grid || progress < 1 ? <p className="text-muted-foreground">{t.working(Math.round(progress * 100))}</p>
          : null}
        <Key mode={mode} />
        {grid && <p className="text-muted-foreground">{t.squares(cellM)}</p>}
        <p className="text-muted-foreground">{text.quality.fixed}</p>
        <button type="button" className="text-primary underline underline-offset-2" onClick={onHowGood}>{text.howGood}</button>
      </aside>
    </div>
  );
}

function Key({ mode }: { mode: CityMode }) {
  const t = text.city;
  const swatch = (colour: string, alpha: number) => <span className="inline-block size-3.5 shrink-0 rounded-sm border" style={{ background: colour, opacity: alpha }} aria-hidden="true" />;
  return (
    <ul className="space-y-1">
      {mode === "ground" && GROUPS.map((g) => <li key={g} className="flex items-center gap-2">{swatch(GROUP_COLOUR[g], 0.8)}{GROUP_NAME[g]}</li>)}
      {mode === "wet" && (
        <li className="space-y-1">
          <div className="h-3 rounded-sm" aria-hidden="true" style={{ background: `linear-gradient(to right, ${WET_RAMP.map(([, c]) => `rgb(${c.join(",")})`).join(",")})` }} />
          <div className="flex justify-between text-muted-foreground">{WET_RAMP.map(([f]) => <span key={f}>{f}</span>)}</div>
          <p>{t.wetKey}</p>
        </li>
      )}
      {mode === "thin" && <li className="flex items-center gap-2">{swatch("#0d6883", 0.8)}{text.levels.likely}</li>}
      <li className="flex items-center gap-2 text-muted-foreground">{t.paler}</li>
      <li className="flex items-center gap-2 text-muted-foreground">{t.clear[mode]}</li>
    </ul>
  );
}
