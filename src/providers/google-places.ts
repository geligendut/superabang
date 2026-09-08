import { haversineMeters, type RestaurantDiscoveryCandidate } from '../domain/food-finder.ts';

export interface GooglePlacesDiscoveryInput {
  lat: number; lng: number; radiusMeters: number; maxResults: number;
}

export async function discoverRestaurantsWithGooglePlaces(
  input: GooglePlacesDiscoveryInput,
): Promise<RestaurantDiscoveryCandidate[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY_NOT_CONFIGURED');

  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.websiteUri',
    },
    body: JSON.stringify({
      includedTypes: ['restaurant'],
      maxResultCount: Math.min(Math.max(input.maxResults, 1), 20),
      rankPreference: 'POPULARITY',
      locationRestriction: {
        circle: {
          center: { latitude: input.lat, longitude: input.lng },
          radius: Math.min(Math.max(input.radiusMeters, 100), 5000),
        },
      },
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GOOGLE_PLACES_ERROR_${response.status}:${body.slice(0,300)}`);
  }

  const payload = await response.json() as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      websiteUri?: string;
    }>;
  };

  return (payload.places ?? []).flatMap(place => {
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (!place.id || !place.displayName?.text || typeof lat !== 'number' || typeof lng !== 'number') return [];
    return [{
      provider: 'GOOGLE_PLACES' as const,
      placeId: place.id,
      name: place.displayName.text,
      address: place.formattedAddress ?? null,
      lat, lng,
      distanceMeters: haversineMeters({lat:input.lat,lng:input.lng},{lat,lng}),
      websiteUri: place.websiteUri ?? null,
    }];
  });
}
