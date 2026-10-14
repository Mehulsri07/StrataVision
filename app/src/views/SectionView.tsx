import { useMemo, useRef, useState } from "react";
import { CircleMarker, Polygon, Polyline, Tooltip } from "react-leaflet";
import { corridorPolygons, type LatLon } from "@strata/core";
import { Button } from "@/components/ui/button";
import { SectionDrawing } from "@/components/SectionDrawing";
import { SiteMap } from "@/components/SiteMap";
import type { Records } from "@/lib/api";
import type { Model } from "@/lib/useModel";
import { sectionAlong } from "@/model/section";
import { text } from "@/text";

const WIDTHS = [0.25, 0.5, 1, 2];
const LINE = "#16202a";

/** Draw a line on the map; the ground along it is drawn underneath, and can be saved. */
export function SectionView({ records, model }: { records: Records; model: Model | "failed" | null }) {
  const { sites } = records;
  const [path, setPath] = useState<LatLon[]>([]);
  const [widthKm, setWidthKm] = useState(0.5);
  const [note, setNote] = useState<string | null>(null);
  const drawing = useRef<SVGSVGElement>(null);
  const t = text.section;

  const ready = model && model !== "failed" ? model : null;
  const borewells = useMemo(() => sites.map((s) => s.borewell), [sites]);
  const section = useMemo(() => (ready && path.length >= 2 ? sectionAlong(path, widthKm, ready.prepared, ready.grid, borewells) : null), [ready, path, widthKm, borewells]);
  const anything = section && (section.borewells.length > 0 || section.columns.some((c) => c.steps?.length));

  const add = (point: LatLon) => {
    setPath((p) => [...p, point]);
    setNote(null);
  };

  const save = async (kind: "png" | "pdf") => {
    if (!drawing.current || !section) return;
    try {
      const { onePagePdf, printableSvg, saveFile, svgToPng } = await import("@/lib/saving");
      const png = await svgToPng(printableSvg(drawing.current.outerHTML), 2);
      const lines = [t.length(section.lengthKm, path.length - 2), t.nearby(section.nearby, t.widthOption(widthKm))];
      const bytes = kind === "png" ? png.bytes : await onePagePdf(t.pdfTitle, lines, png, [t.pdfKey, text.quality.fixed]);
      const saved = await saveFile(`Section.${kind}`, kind, bytes);
      if (saved) setNote(t.saved(saved));
    } catch (e) {
      setNote(`${t.saveFailed} ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 basis-1/2">
        <div className="min-w-0 flex-1">
          <SiteMap sites={sites} selectedId={null} picked={null}
            onSelect={(id) => {
              const b = sites.find((s) => s.borewell.id === id)?.borewell;
              if (b?.latitude != null && b.longitude != null) add([b.latitude, b.longitude]);
            }}
            onPick={(lat, lon) => add([lat, lon])}>
            {path.length >= 2 && corridorPolygons(path, widthKm).map((poly, i) => (
              <Polygon key={i} positions={poly} interactive={false} pathOptions={{ color: LINE, weight: 0, fillOpacity: 0.08 }} />
            ))}
            {path.length >= 2 && <Polyline positions={path} interactive={false} pathOptions={{ color: LINE, weight: 2.5 }} />}
            {path.map((p, i) => (
              <CircleMarker key={`${i}-${p.join()}`} center={p} radius={5} interactive={false} pathOptions={{ color: LINE, weight: 2, fillColor: "#ffffff", fillOpacity: 1 }}>
                {(i === 0 || (i === path.length - 1 && path.length > 1)) && <Tooltip permanent direction="top" offset={[0, -6]}>{i === 0 ? "A" : "A′"}</Tooltip>}
              </CircleMarker>
            ))}
          </SiteMap>
        </div>
        <aside className="w-[22rem] shrink-0 space-y-3 overflow-y-auto border-l p-4 text-sm">
          <p className="text-muted-foreground">{path.length === 1 ? t.needTwo : t.hint}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={path.length === 0} onClick={() => setPath((p) => p.slice(0, -1))}>{t.undo}</Button>
            <Button variant="outline" size="sm" disabled={path.length === 0} onClick={() => setPath([])}>{t.clear}</Button>
          </div>
          <label className="flex items-center gap-2">
            {t.width}
            <select className="rounded-md border bg-background px-2 py-1" value={widthKm} onChange={(e) => setWidthKm(Number(e.target.value))}>
              {WIDTHS.map((w) => <option key={w} value={w}>{t.widthOption(w)}</option>)}
            </select>
          </label>
          {section && (
            <div className="space-y-1 border-t pt-3">
              <p>{t.length(section.lengthKm, path.length - 2)}</p>
              <p>{t.nearby(section.nearby, t.widthOption(widthKm))}</p>
              {section.borewells.length < section.nearby && <p className="text-muted-foreground">{t.thinned(section.borewells.length)}</p>}
            </div>
          )}
          {anything && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => save("png")}>{t.savePicture}</Button>
              <Button variant="outline" size="sm" onClick={() => save("pdf")}>{t.savePdf}</Button>
            </div>
          )}
          {note && <p className="text-muted-foreground break-all">{note}</p>}
        </aside>
      </div>
      <div className="min-h-0 flex-1 overflow-auto border-t p-4">
        {model === "failed" ? <p>{text.groundFailed}</p>
          : !ready ? <p className="text-muted-foreground">{text.readingGround}</p>
          : !section ? null
          : anything ? <SectionDrawing section={section} ref={drawing} />
          : <p>{t.nothing}</p>}
      </div>
    </div>
  );
}
