import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Map, Maximize2, Minimize2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface TripLocation {
  id: string;
  reading_date: string;
  daily_km: number;
  latitude: number;
  longitude: number;
  vehicle_name: string;
  location_name?: string;
}

interface TripsMapProps {
  locations: TripLocation[];
}

// Component to fit bounds when locations change
const FitBounds: React.FC<{ locations: TripLocation[] }> = ({ locations }) => {
  const map = useMap();

  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(
        locations.map(loc => [loc.latitude, loc.longitude])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [locations, map]);

  return null;
};

export const TripsMap: React.FC<TripsMapProps> = ({ locations }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Default center (Netherlands)
  const defaultCenter: [number, number] = [52.1326, 5.2913];
  
  // Get center from locations if available
  const center: [number, number] = locations.length > 0
    ? [locations[0].latitude, locations[0].longitude]
    : defaultCenter;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (locations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Kaart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            <p>Geen locatiegegevens beschikbaar</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={isExpanded ? 'fixed inset-4 z-50' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Map className="h-5 w-5" />
            Kaart ({locations.length} locaties)
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className={`rounded-b-lg overflow-hidden ${isExpanded ? 'h-[calc(100vh-8rem)]' : 'h-64 md:h-80'}`}>
          <MapContainer
            center={center}
            zoom={10}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds locations={locations} />
            {locations.map((location) => (
              <Marker
                key={location.id}
                position={[location.latitude, location.longitude]}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-medium">{formatDate(location.reading_date)}</p>
                    <p className="text-muted-foreground">{location.vehicle_name}</p>
                    {location.daily_km > 0 && (
                      <p className="text-primary font-medium">{location.daily_km} km gereden</p>
                    )}
                    {location.location_name && (
                      <p className="text-xs text-muted-foreground">{location.location_name}</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </CardContent>
    </Card>
  );
};
