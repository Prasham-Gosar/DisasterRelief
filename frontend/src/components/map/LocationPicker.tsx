import { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import './fixLeafletIcons';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../lib/geo';
import { Button } from '../ui/Button';
import { MapPin, Crosshair } from 'lucide-react';

interface LatLng {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  value?: LatLng | null;
  onChange: (location: LatLng) => void;
  className?: string;
}

function ClickHandler({ onLocationSelect }: { onLocationSelect: (latlng: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export function LocationPicker({ value, onChange, className = '' }: LocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGeoError('Location permission denied. Please enable location access in your browser settings.');
            break;
          case err.POSITION_UNAVAILABLE:
            setGeoError('Location information is unavailable.');
            break;
          case err.TIMEOUT:
            setGeoError('Location request timed out.');
            break;
          default:
            setGeoError('An unknown error occurred while getting your location.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [onChange]);

  const defaultIcon = new L.Icon.Default();

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleUseCurrentLocation}
          loading={locating}
        >
          <Crosshair className="h-4 w-4" aria-hidden="true" />
          Use my current location
        </Button>
        {value && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
          </span>
        )}
      </div>

      {geoError && (
        <p className="text-xs text-danger-600" role="alert">
          {geoError}
        </p>
      )}

      <p className="text-xs text-gray-500">Click on the map to place or move the pin.</p>

      <div className="h-[300px] md:h-[400px] rounded-ui overflow-hidden border border-gray-200">
        <MapContainer
          center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
          zoom={value ? 15 : DEFAULT_ZOOM}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onLocationSelect={onChange} />
          {value && (
            <Marker position={[value.lat, value.lng]} icon={defaultIcon} />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
