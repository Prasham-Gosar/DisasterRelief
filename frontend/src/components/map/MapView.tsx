import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import './fixLeafletIcons';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../lib/geo';

export interface MapMarker {
  id: string | number;
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  popup?: string;
  customPopup?: ReactNode;
  customIcon?: L.DivIcon | L.Icon;
}

interface MapViewProps {
  markers?: MapMarker[];
  center?: [number, number];
  zoom?: number;
  fitBounds?: boolean;
  fitBoundsOnce?: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
  className?: string;
}

function createColorIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 24px; height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
}

function FitBoundsComponent({
  markers,
  fitBoundsOnce = false,
}: {
  markers: MapMarker[];
  fitBoundsOnce?: boolean;
}) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (markers.length === 0) return;
    if (fitBoundsOnce && hasFittedRef.current) return;
    const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    hasFittedRef.current = true;
  }, [markers, map, fitBoundsOnce]);

  return null;
}

export function MapView({
  markers = [],
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  fitBounds = false,
  fitBoundsOnce = false,
  onMarkerClick,
  className = '',
}: MapViewProps) {
  const defaultIcon = useMemo(() => new L.Icon.Default(), []);

  return (
    <div
      className={`relative z-0 isolate h-[400px] md:h-[500px] rounded-ui overflow-hidden border border-gray-200 ${className}`}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {(fitBounds || fitBoundsOnce) && markers.length > 0 && (
          <FitBoundsComponent markers={markers} fitBoundsOnce={fitBoundsOnce} />
        )}

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={marker.customIcon ?? (marker.color ? createColorIcon(marker.color) : defaultIcon)}
            eventHandlers={
              onMarkerClick
                ? { click: () => onMarkerClick(marker) }
                : undefined
            }
          >
            {(marker.customPopup || marker.popup || marker.label) && (
              <Popup>
                {marker.customPopup ? (
                  marker.customPopup
                ) : (
                  <>
                    {marker.label && <strong>{marker.label}</strong>}
                    {marker.popup && <p className="mt-1 text-sm">{marker.popup}</p>}
                  </>
                )}
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
