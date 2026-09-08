'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/src/backend/supabase-browser';
import FoodFinderMap from './FoodFinderMap';
import {
  directionsUrl,
  rankFoodFinderCandidates,
  type RestaurantDiscoveryCandidate,
  type VerifiedMenuEvidence,
  type FoodFinderTrainingContext,
  type EvidenceConfidence,
  type MenuEvidenceSource,
} from '@/src/domain/food-finder';

type EvidenceDraft = {
  itemName: string;
  itemDescription: string;
  portionNote: string;
  suggestedModification: string;
  evidenceUrl: string;
  confidence: EvidenceConfidence;
  source: MenuEvidenceSource;
  meaningfulProtein: boolean;
  vegetablesOrFruit: boolean;
  practicalCarbSource: boolean;
  friedOrHeavy: boolean;
  portionControlEasy: boolean;
  verified: boolean;
};

const EMPTY_DRAFT: EvidenceDraft = {
  itemName: '', itemDescription: '', portionNote: '', suggestedModification: '', evidenceUrl: '',
  confidence: 'MEDIUM', source: 'USER_VERIFIED', meaningfulProtein: false, vegetablesOrFruit: false,
  practicalCarbSource: false, friedOrHeavy: false, portionControlEasy: false, verified: false,
};

function mapEvidenceRow(row: any): VerifiedMenuEvidence {
  return {
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
    source: row.source,
    signals: {
      meaningfulProtein: row.meaningful_protein,
      vegetablesOrFruit: row.vegetables_or_fruit,
      practicalCarbSource: row.practical_carb_source,
      friedOrHeavy: row.fried_or_heavy,
      portionControlEasy: row.portion_control_easy,
    },
  };
}

export default function FoodFinderPage() {
  const [context, setContext] = useState<FoodFinderTrainingContext>('UNSPECIFIED');
  const [places, setPlaces] = useState<RestaurantDiscoveryCandidate[]>([]);
  const [menuEvidence, setMenuEvidence] = useState<VerifiedMenuEvidence[]>([]);
  const [status, setStatus] = useState('Location has not been requested.');
  const [loading, setLoading] = useState(false);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EvidenceDraft>(EMPTY_DRAFT);
  const [evidenceStatus, setEvidenceStatus] = useState('');

  async function loadMenuEvidence(ids: string[]) {
    if (!ids.length) {
      setMenuEvidence([]);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.from('food_menu_evidence')
      .select('*')
      .in('provider_place_id', ids)
      .order('evidence_observed_at', { ascending: false });
    if (error) throw error;
    setMenuEvidence((data ?? []).map(mapEvidenceRow));
  }

  async function discover() {
    setLoading(true);
    setEditingPlaceId(null);
    setEvidenceStatus('');
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

      const nextPlaces = (payload.places ?? []) as RestaurantDiscoveryCandidate[];
      setPlaces(nextPlaces);
      await loadMenuEvidence(nextPlaces.map(p => p.placeId));
      setStatus('Discovery complete. Precise location was used for this request only and is not stored by Superabang.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function openEvidenceForm(placeId: string) {
    setEditingPlaceId(placeId);
    setDraft(EMPTY_DRAFT);
    setEvidenceStatus('');
  }

  async function saveEvidence(place: RestaurantDiscoveryCandidate) {
    setEvidenceStatus('');
    try {
      if (!draft.itemName.trim()) throw new Error('Item name is required.');
      if (!draft.evidenceUrl.trim()) throw new Error('Evidence URL is required.');
      try { new URL(draft.evidenceUrl.trim()); } catch { throw new Error('Evidence URL must be a valid http(s) URL.'); }
      if (!draft.verified) throw new Error('Confirm that you personally checked the cited evidence before saving.');

      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getSession();
      const user = auth.session?.user;
      if (!user) throw new Error('SIGN_IN_REQUIRED');

      const row = {
        id: crypto.randomUUID(),
        user_id: user.id,
        provider_place_id: place.placeId,
        restaurant_name: place.name,
        item_name: draft.itemName.trim(),
        item_description: draft.itemDescription.trim() || null,
        portion_note: draft.portionNote.trim() || null,
        suggested_modification: draft.suggestedModification.trim() || null,
        evidence_url: draft.evidenceUrl.trim(),
        evidence_observed_at: new Date().toISOString(),
        evidence_confidence: draft.confidence,
        meaningful_protein: draft.meaningfulProtein,
        vegetables_or_fruit: draft.vegetablesOrFruit,
        practical_carb_source: draft.practicalCarbSource,
        fried_or_heavy: draft.friedOrHeavy,
        portion_control_easy: draft.portionControlEasy,
        source: draft.source,
      };

      const { error } = await supabase.from('food_menu_evidence').insert(row);
      if (error) throw error;
      await loadMenuEvidence(places.map(p => p.placeId));
      setEditingPlaceId(null);
      setDraft(EMPTY_DRAFT);
      setEvidenceStatus(`Verified menu evidence saved for ${place.name}. Ranking refreshed.`);
    } catch (error) {
      setEvidenceStatus(error instanceof Error ? error.message : String(error));
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

    {evidenceStatus && <div className="card"><strong>Menu evidence</strong><p>{evidenceStatus}</p></div>}

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
        <div className="muted">Evidence: {candidate.item.source ?? 'USER_VERIFIED'} · {candidate.item.confidence}</div>
        <a href={candidate.item.evidenceUrl} target="_blank" rel="noreferrer">View evidence</a>
        <p className="muted">{candidate.rationale}</p>
      </> : <p className="muted">{candidate.rationale}</p>}

      <div className="row">
        <a href={directionsUrl(candidate.place)} target="_blank" rel="noreferrer">Directions</a>
        <button onClick={() => openEvidenceForm(candidate.place.placeId)}>Add verified menu evidence</button>
      </div>

      {editingPlaceId === candidate.place.placeId && <div className="card">
        <h3>Verified menu evidence</h3>
        <p className="muted">Attach only evidence you actually checked. This form does not infer menu facts from the restaurant name or Google Places discovery result.</p>
        <label>Item / order name<input value={draft.itemName} onChange={e => setDraft({...draft, itemName:e.target.value})} /></label>
        <label>Item description (optional)<input value={draft.itemDescription} onChange={e => setDraft({...draft, itemDescription:e.target.value})} /></label>
        <label>Portion note (optional)<input value={draft.portionNote} onChange={e => setDraft({...draft, portionNote:e.target.value})} /></label>
        <label>Suggested modification (optional)<input value={draft.suggestedModification} onChange={e => setDraft({...draft, suggestedModification:e.target.value})} /></label>
        <label>Evidence URL<input inputMode="url" autoCapitalize="none" value={draft.evidenceUrl} onChange={e => setDraft({...draft, evidenceUrl:e.target.value})} /></label>
        <label>Source
          <select value={draft.source} onChange={e => setDraft({...draft, source:e.target.value as MenuEvidenceSource})}>
            <option value="USER_VERIFIED">User verified</option>
            <option value="RESTAURANT_PUBLISHED">Restaurant published</option>
          </select>
        </label>
        <label>Evidence confidence
          <select value={draft.confidence} onChange={e => setDraft({...draft, confidence:e.target.value as EvidenceConfidence})}>
            <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
          </select>
        </label>
        <fieldset>
          <legend>Qualitative menu signals</legend>
          <label><input type="checkbox" checked={draft.meaningfulProtein} onChange={e => setDraft({...draft, meaningfulProtein:e.target.checked})} /> Meaningful protein</label>
          <label><input type="checkbox" checked={draft.vegetablesOrFruit} onChange={e => setDraft({...draft, vegetablesOrFruit:e.target.checked})} /> Vegetables / fruit</label>
          <label><input type="checkbox" checked={draft.practicalCarbSource} onChange={e => setDraft({...draft, practicalCarbSource:e.target.checked})} /> Practical carbohydrate source</label>
          <label><input type="checkbox" checked={draft.friedOrHeavy} onChange={e => setDraft({...draft, friedOrHeavy:e.target.checked})} /> Fried / heavy preparation</label>
          <label><input type="checkbox" checked={draft.portionControlEasy} onChange={e => setDraft({...draft, portionControlEasy:e.target.checked})} /> Portion control is practical</label>
        </fieldset>
        <label><input type="checkbox" checked={draft.verified} onChange={e => setDraft({...draft, verified:e.target.checked})} /> I personally checked the cited evidence and these fields reflect what it actually supports.</label>
        <div className="row">
          <button className="primary" onClick={() => saveEvidence(candidate.place)}>Save verified evidence</button>
          <button onClick={() => setEditingPlaceId(null)}>Cancel</button>
        </div>
      </div>}
    </div>)}

    <h2>Map</h2>
    <FoodFinderMap ranked={ranked} />
  </main>;
}
