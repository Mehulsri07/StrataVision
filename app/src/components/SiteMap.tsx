import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { SiteRecord } from "@/lib/api";

/** Centre of Lucknow, the pilot city. */
const CITY_CENTRE: LatLngExpression = [26.85, 80.95];

/** Borewells that have a location, which is all a map can show. */
export const located = (sites: SiteRecord[]) => sites.filter((s) => s.borewell.latitude != null && s.borewell.longitude != null);

/**
 * The borewells on OpenStreetMap's online tiles. Without internet the tiles are a plain background
 * and the pins still show.
 */
export function SiteMap({ sites, selectedId, onSelect }: {
  sites: SiteRecord[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const pins = useMemo(() => located(sites), [sites]);
  return (
    <MapContainer center={CITY_CENTRE} zoom={12} preferCanvas className="strata-map z-0 h-full w-full bg-map-land">
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <FitOnce pins={pins} />
      <ClearOnMapClick onClear={() => onSelect(null)} />
      {/* ponytail: no grouping, so borewells at exactly the same spot sit on top of each other and
          only the top one can be clicked. Group them (as StrataField does) if that gets in the way. */}
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

function ClearOnMapClick({ onClear }: { onClear: () => void }) {
  useMapEvents({ click: onClear });
  return null;
}
