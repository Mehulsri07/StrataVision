import { useEffect, useRef, useState } from "react";
import { DomEvent } from "leaflet";
import { useMap } from "react-leaflet";
import { findPlace, type Place } from "@/lib/api";
import { text } from "@/text";

/**
 * A box on the map to find a place in Lucknow by name; choosing one moves the map there. Searches
 * only on Enter, as OpenStreetMap's place finder asks (no searching while typing).
 */
export function PlaceSearch() {
  const map = useMap();
  const box = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Place[] | "searching" | "failed" | null>(null);
  const t = text.search;

  // Clicks and scrolling here are not clicks on the map.
  useEffect(() => {
    if (!box.current) return;
    DomEvent.disableClickPropagation(box.current);
    DomEvent.disableScrollPropagation(box.current);
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    setFound("searching");
    try {
      setFound(await findPlace(query.trim()));
    } catch {
      setFound("failed");
    }
  };
  const go = (p: Place) => {
    map.flyTo([p.latitude, p.longitude], 15);
    setFound(null);
  };

  return (
    <form ref={box} role="search" className="absolute top-2.5 right-2.5 z-[1000] w-72 rounded-md border bg-background text-sm shadow"
      onSubmit={(e) => { e.preventDefault(); void search(); }}>
      <input type="search" value={query} placeholder={t.placeholder} aria-label={t.placeholder} className="w-full rounded-md px-3 py-1.5 outline-none"
        onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setFound(null)} />
      {found === "searching" && <p className="border-t px-3 py-1.5 text-muted-foreground">{t.searching}</p>}
      {found === "failed" && <p className="border-t px-3 py-1.5">{t.failed}</p>}
      {Array.isArray(found) && (found.length === 0 ? <p className="border-t px-3 py-1.5">{t.none}</p> : (
        <ul className="border-t">
          {found.map((p) => (
            <li key={`${p.latitude},${p.longitude}`}>
              {/* The first parts of the name are enough to tell places apart; the rest is the city and state. */}
              <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => go(p)}>{p.name.split(", ").slice(0, 3).join(", ")}</button>
            </li>
          ))}
        </ul>
      ))}
    </form>
  );
}
