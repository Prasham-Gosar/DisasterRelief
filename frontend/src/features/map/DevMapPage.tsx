import { useState } from 'react';
import { LocationPicker } from '../../components/map/LocationPicker';

export function DevMapPage() {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <div className="py-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Location Picker Test</h1>
      <div className="max-w-2xl bg-white p-4 rounded-ui shadow-sm border border-gray-200">
        <LocationPicker
          value={loc}
          onChange={(newLoc) => {
            console.log('Location picked:', newLoc);
            setLoc(newLoc);
          }}
        />
        {loc && (
          <div className="mt-4 p-3 bg-gray-50 rounded-ui text-sm text-gray-700">
            <strong>Selected Coordinates:</strong><br />
            Lat: {loc.lat}<br />
            Lng: {loc.lng}
          </div>
        )}
      </div>
    </div>
  );
}
