import { useEffect, useMemo, useState } from "react";
import { ImageOverlay, Pane } from "react-leaflet";
import { kmBetween } from "@strata/core";
import { SiteMap } from "@/components/SiteMap";
import type { Records } from "@/lib/api";
import type { Model } from "@/lib/useModel";
import { WET_RAMP, cityArea, cityPoint, paint, type CityGrid, type CityMode } from "@/model/cityMap";
import { STEP_FT } from "@/model/constants";
import { GROUPS } from "@/model/groups";
import { GROUP_COLOUR, GROUP_NAME } from "@/model/words";
import { text } from "@/text";

/** The model painted over the whole city, in one of three modes. */
export function CityView({ records, model, onHowGood }: { records: Records; model: Model | "failed" | null; onHowGood: () => void }) {
  const ready = model && model !== "failed" ? model : null;
  const [grid, setGrid] = useState<CityGrid | "empty" | null>(null);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<CityMode>("ground");
  const [depthFt, setDepthFt] = useState(50);
  const t = text.city;

  // 10,000 columns take a few seconds, so they are worked out a few at a time between screen updates.
  // ponytail: on the main thread in batches; a Web Worker if records grow well past a thousand.
  const prepared = ready?.prepared, ground = ready?.grid;
  useEffect(() => {
    if (!prepared || !ground) return;
    const area = cityArea(prepared, ground);
    const points: CityGrid["points"] = [];
    let row = 0, timer = 0;
    const work = () => {
      // Nothing to map: said at once, and an old map is not left looking current.
      if (!area) return setGrid("empty");
      const until = performance.now() + 30;
      while (row < area.rows && performance.now() < until) {
        const lat = area.north - ((row + 0.5) * (area.north - area.south)) / area.rows;
        for (let col = 0; col < area.cols; col++) points.push(cityPoint(lat, area.west + ((col + 0.5) * (area.east - area.west)) / area.cols, prepared, ground));
        row++;
      }
      setProgress(row / area.rows);
      if (row < area.rows) timer = window.setTimeout(work, 0);
      else setGrid({ ...area, points });
    };
    timer = window.setTimeout(work, 0);
    return () => clearTimeout(timer);
  }, [prepared, ground]);

  const map = grid && grid !== "empty" ? grid : null;
  const deepestFt = useMemo(() => (map ? Math.max(STEP_FT, ...map.points.map((p) => (p?.codes.length ?? 0) * STEP_FT)) : STEP_FT), [map]);
  const depth = Math.min(depthFt, deepestFt - STEP_FT);
  const bounds = useMemo(() => (map ? ([[map.south, map.west], [map.north, map.east]] as [[number, number], [number, number]]) : null), [map]);
  const picture = useMemo(() => {
    if (!map) return null;
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [map.cols, map.rows];
    canvas.getContext("2d")!.putImageData(new ImageData(paint(map, mode, depth), map.cols, map.rows), 0, 0);
    return canvas.toDataURL();
  }, [map, mode, depth]);
  const cellM = map ? Math.round((kmBetween(map.south, map.west, map.south, map.east) / map.cols) * 1000) : 0;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1">
        <SiteMap sites={records.sites} selectedId={null} picked={null} onSelect={() => {}} onPick={() => {}}>
          {/* Under the borewell pins (the overlay pane is 400), above the streets. */}
          {bounds && picture && (
            <Pane name="city-map" style={{ zIndex: 350 }}>
              <ImageOverlay url={picture} bounds={bounds} className="[image-rendering:pixelated]" />
            </Pane>
          )}
        </SiteMap>
      </div>
      <aside className="w-[22rem] shrink-0 space-y-4 overflow-y-auto border-l p-4 text-sm">
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-medium">{t.modeLabel}</legend>
          {(["ground", "wet", "thin"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input type="radio" name="city-mode" checked={mode === m} onChange={() => setMode(m)} />
              {t.modes[m]}
            </label>
          ))}
        </fieldset>
        <p className="text-muted-foreground">{t.about[mode]}</p>
        {mode !== "wet" && map && (
          <label className="block space-y-1">
            <span>{t.depth(depth)}</span>
            <input type="range" className="w-full" min={0} max={deepestFt - STEP_FT} step={STEP_FT} value={depth} onChange={(e) => setDepthFt(Number(e.target.value))} />
          </label>
        )}
        {model === "failed" ? <p>{text.groundFailed}</p>
          : grid === "empty" ? <p>{t.empty}</p>
          : !grid || progress < 1 ? <p className="text-muted-foreground">{t.working(Math.round(progress * 100))}</p>
          : null}
        {map && <Key mode={mode} />}
        {map && <p className="text-muted-foreground">{t.squares(cellM)}</p>}
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
          <div className="flex justify-between text-muted-foreground">{WET_RAMP.map(([f], i) => <span key={f}>{f}{i === WET_RAMP.length - 1 ? "+" : ""}</span>)}</div>
          <p>{t.wetKey}</p>
        </li>
      )}
      {mode === "thin" && <li className="flex items-center gap-2">{swatch("#0d6883", 0.8)}{text.levels.likely}</li>}
      <li className="flex items-center gap-2 text-muted-foreground">{swatch(mode === "ground" ? GROUP_COLOUR.clay : mode === "wet" ? "rgb(46,102,179)" : "#0d6883", 0.35)}{t.paler}</li>
      <li className="flex items-center gap-2 text-muted-foreground">{t.clear[mode]}</li>
    </ul>
  );
}
