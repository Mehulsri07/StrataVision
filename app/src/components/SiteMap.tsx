import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, type ReactNode } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { SiteRecord } from "@/lib/api";

/** Centre of Lucknow, the pilot city. */
const CITY_CENTRE: LatLngExpression = [26.85, 80.95];

/** Borewells that have a location, which is all a map can show. */
export const located = (sites: SiteRecord[]) => sites.filter((s) => s.borewell.latitude != null && s.borewell.longitude != null);

/**
 * The borewells on OpenStreetMap's online tiles. Without internet the tiles are a plain background
 * and the pins still show. Clicking a pin selects that borewell; clicking anywhere else picks the spot.
 */
export function SiteMap({ sites, selectedId, picked, onSelect, onPick, children }: {
  sites: SiteRecord[];
  selectedId: string | null;
  picked: [number, number] | null;
  onSelect: (id: string) => void;
  onPick: (latitude: number, longitude: number) => void;
  /** Anything else to draw on the map, such as a section line. */
  children?: ReactNode;
}) {
  const pins = useMemo(() => located(sites), [sites]);
  return (
    <MapContainer center={CITY_CENTRE} zoom={12} preferCanvas className="strata-map z-0 h-full w-full cursor-crosshair bg-map-land">
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <FitOnce pins={pins} />
      <KeepSize />
      <PickOnMapClick onPick={onPick} />
      {/* ponytail: no grouping, so borewells at exactly the same spot sit on top of each other and
          only the top one can be clicked; the side panel then offers the others. Group the pins
          (as StrataField does) if that is not enough. */}
      {pins.map(({ borewell: b }) => {
        const selected = b.id === selectedId;
        return (
          <CircleMarker
            key={b.id}
            center={[b.latitude!, b.longitude!]}
            radius={selected ? 9 : 6}
            pathOptions={{ color: "#ffffff", weight: selected ? 3 : 1.5, fillColor: "#0d6883", fillOpacity: selected ? 1 : 0.85 }}
            bubblingMouseEvents={false}
            eventHandlers={{ click: () => onSelect(b.id) }}
          >
            <Tooltip>{b.borewellId}</Tooltip>
          </CircleMarker>
        );
      })}
      {/* The picked spot: an open, dashed ring, so it cannot be taken for a borewell. */}
      {picked && <CircleMarker center={picked} radius={11} interactive={false} pathOptions={{ color: "#16202a", weight: 2, dashArray: "4 4", fill: false }} />}
      {children}
    </MapContainer>
  );
}

/** Frames the borewells the first time there are any; later reloads leave the view where the user put it. */
function FitOnce({ pins }: { pins: SiteRecord[] }) {
  const map = useMap();
  const any = pins.length > 0;
  useEffect(() => {
    if (!any) return;
    const bounds: LatLngBoundsExpression = pins.map((s) => [s.borewell.latitude!, s.borewell.longitude!]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [any, map]);
  return null;
}

/**
 * Leaflet remembers how big the map was. While Data quality is showing the map is hidden (no size
 * at all), so it is measured again whenever its box changes, or it would come back blank or shifted.
 */
function KeepSize() {
  const map = useMap();
  useEffect(() => {
    const watcher = new ResizeObserver(() => map.invalidateSize());
    watcher.observe(map.getContainer());
    return () => watcher.disconnect();
  }, [map]);
  return null;
}

function PickOnMapClick({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}
