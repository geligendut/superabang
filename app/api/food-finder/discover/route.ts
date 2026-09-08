import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { discoverRestaurantsWithGooglePlaces } from '@/src/providers/google-places';

function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_PUBLIC_CONFIG_MISSING');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

    const supabase = serverSupabase();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: 'AUTH_INVALID' }, { status: 401 });

    const body = await request.json() as { lat?:number; lng?:number; radiusMeters?:number; maxResults?:number };
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      return Response.json({ error: 'LOCATION_REQUIRED' }, { status: 400 });
    }

    const places = await discoverRestaurantsWithGooglePlaces({
      lat: body.lat, lng: body.lng,
      radiusMeters: body.radiusMeters ?? 2500,
      maxResults: body.maxResults ?? 10,
    });

    return Response.json({
      places,
      locationRetention: 'EPHEMERAL_REQUEST_ONLY',
      menuEvidenceStatus: 'NOT_INCLUDED_IN_DISCOVERY_PROVIDER',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: message === 'GOOGLE_PLACES_API_KEY_NOT_CONFIGURED' ? 503 : 500 });
  }
}
