'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';
import {
  directionsUrl,
  rankFoodFinderCandidates,
  type RestaurantDiscoveryCandidate,
  type VerifiedMenuEvidence,
  type FoodFinderTrainingContext,
} from '@/src/domain/food-finder';

export default function FoodFinderPage() {
  const [context, setContext] = useState<FoodFinderTrainingContext>('UNSPECIFIED');
  const [places, setPlaces] = useState<RestaurantDiscoveryCandidate[]>([]);
  const [menuEvidence, setMenuEvidence] = useState<VerifiedMenuEvidence[]>([]);
  const [status, setStatus] = useState('Location has not been requested.');
  const [loading, setLoading] = useState(false);

  async function discover() {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;
      if (!token) throw new Error('SIGN_IN_REQUIRED');

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          maximumAge: 0,
          timeout: 10000,
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      const response = await fetch('/api/food-finder/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat, lng, radiusMeters: 2500, maxResults: 10 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'DISCOVERY_FAILED');

      setPlaces(payload.places ?? []);

      const ids = (payload.places ?? []).map((p: RestaurantDiscoveryCandidate) => p.placeId);
      if (ids.length) {
        const { data, error } = await supabase.from('food_menu_evidence')
          .select('*')
          .in('provider_place_id', ids)
          .order('evidence_observed_at', { ascending: false });
        if (error) throw error;
        setMenuEvidence((data ?? []).map(row => ({
          id: row.id,
          placeId: row.provider_place_id,
          restaurantName: row.restaurant_name,
          itemName: row.item_name,
          itemDescription: row.item_description,
          portionNote: row.portion_note,
          suggestedModification: row.suggested_modification,
          evidenceUrl: row.evidence_url,
          observedAt: row.evidence_observed_at,
          confidence: row.evidence_confidence,
          signals: {
            meaningfulProtein: row.meaningful_protein,
            vegetablesOrFruit: row.vegetables_or_fruit,
            practicalCarbSource: row.practical_carb_source,
            friedOrHeavy: row.fried_or_heavy,
            portionControlEasy: row.portion_control_easy,
          },
        })));
      } else {
        setMenuEvidence([]);
      }

      setStatus('Discovery complete. Precise location was used for this request only and is not stored by Superabang.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  const ranked = rankFoodFinderCandidates(places, menuEvidence, context);

  return <main>
    <div className="row"><Link href="/">← Home</Link><Link href="/nutrition/decision">Contextual nutrition</Link></div>
    <h1>Food Finder</h1>
    <p className="muted">
      B10 foundation: real restaurant discovery plus menu-evidence-gated ranking. A restaurant is not promoted to an order recommendation unless verified menu evidence exists.
    </p>

    <div className="card">
      <h2>Context & location</h2>
      <label>Training context
        <select value={context} onChange={e => setContext(e.target.value as FoodFinderTrainingContext)}>
          <option value="UNSPECIFIED">Unspecified</option>
          <option value="REST_DAY">Rest day</option>
          <option value="PRE_TRAINING">Pre-training</option>
          <option value="POST_TRAINING">Post-training</option>
          <option value="RECOVERY_DAY">Recovery day</option>
        </select>
      </label>
      <p className="muted">Location is requested only when you tap Discover nearby. Superabang does not persist location history.</p>
      <button className="primary" onClick={discover} disabled={loading}>{loading ? 'Discovering…' : 'Discover nearby restaurants'}</button>
      <p className="muted">{status}</p>
    </div>

    <div className="card">
      <h2>Provider readiness</h2>
      <p>Discovery provider: Google Places API (New), server-side key only.</p>
      <p>Menu evidence: user-reviewed or restaurant-published evidence stored separately.</p>
      <p className="muted">No menu item, operating status, nutrition fact, or availability is invented when evidence is absent.</p>
    </div>

    <h2>List</h2>
    {ranked.length === 0 && <div className="card">No candidates loaded yet.</div>}
    {ranked.map((candidate, index) => <div className="card" key={candidate.place.placeId}>
      <strong>{index + 1}. {candidate.place.name}</strong>
      <div>{candidate.place.distanceMeters === null ? 'Distance unavailable' : `${candidate.place.distanceMeters} m`}</div>
      {candidate.place.address && <div className="muted">{candidate.place.address}</div>}
      <p><strong>{candidate.status}</strong></p>
      {candidate.item ? <>
        <div>Order: <strong>{candidate.item.itemName}</strong></div>
        {candidate.item.portionNote && <div>Portion: {candidate.item.portionNote}</div>}
        {candidate.item.suggestedModification && <div>Modification: {candidate.item.suggestedModification}</div>}
        <p className="muted">{candidate.rationale}</p>
      </> : <p className="muted">{candidate.rationale}</p>}
      <a href={directionsUrl(candidate.place)} target="_blank" rel="noreferrer">Directions</a>
    </div>)}

    <h2>Map</h2>
    <div className="card">
      <p><strong>Map provider not activated in B10 foundation.</strong></p>
      <p className="muted">The same candidate coordinates are available for the map layer, but no fake map or mismatched candidate set is rendered. Browser map-provider activation is a separate operational step.</p>
      {ranked.map((c, i) => <div key={c.place.placeId}>{i+1}. {c.place.name} · {c.place.lat.toFixed(5)}, {c.place.lng.toFixed(5)}</div>)}
    </div>
  </main>;
}
