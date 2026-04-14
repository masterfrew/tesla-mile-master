/**
 * Reverse geocoding using OpenStreetMap Nominatim (free, no API key needed).
 * Rate limit: max 1 request per second.
 * Returns a human-readable address string, or null on failure.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'KMTrack/1.0 (kmtrack.nl)';

export interface GeocodingResult {
  displayName: string;       // Full address
  shortName: string;         // City + road (compact)
  city: string | null;
  road: string | null;
  suburb: string | null;
  postcode: string | null;
  country: string | null;
}

export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<GeocodingResult | null> {
  try {
    const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[geocoding] Nominatim returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.error) {
      console.error(`[geocoding] Nominatim error: ${data.error}`);
      return null;
    }

    const addr = data.address || {};

    const city = addr.city || addr.town || addr.village || addr.municipality || null;
    const road = addr.road || addr.street || null;
    const suburb = addr.suburb || addr.neighbourhood || null;
    const postcode = addr.postcode || null;
    const country = addr.country || null;

    // Build a compact name: "Keizersgracht, Amsterdam" or "Amsterdam" if no road
    const parts: string[] = [];
    if (road) parts.push(road);
    if (suburb && !road) parts.push(suburb);
    if (city) parts.push(city);

    const shortName = parts.length > 0 ? parts.join(', ') : (data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`);

    return {
      displayName: data.display_name || shortName,
      shortName,
      city,
      road,
      suburb,
      postcode,
      country,
    };
  } catch (error) {
    console.error(`[geocoding] Error:`, error);
    return null;
  }
}
