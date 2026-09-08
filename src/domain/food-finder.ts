export type FoodFinderTrainingContext =
  | 'REST_DAY' | 'PRE_TRAINING' | 'POST_TRAINING' | 'RECOVERY_DAY' | 'UNSPECIFIED';

export type EvidenceConfidence = 'LOW'|'MEDIUM'|'HIGH';
export type MenuEvidenceSource = 'USER_VERIFIED'|'RESTAURANT_PUBLISHED';

export interface RestaurantDiscoveryCandidate {
  provider: 'GOOGLE_PLACES';
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distanceMeters: number | null;
  websiteUri?: string | null;
}

export interface VerifiedMenuEvidence {
  id: string;
  placeId: string;
  restaurantName: string;
  itemName: string;
  itemDescription?: string | null;
  portionNote?: string | null;
  suggestedModification?: string | null;
  evidenceUrl: string;
  observedAt: string;
  confidence: EvidenceConfidence;
  source?: MenuEvidenceSource;
  signals: {
    meaningfulProtein: boolean;
    vegetablesOrFruit: boolean;
    practicalCarbSource: boolean;
    friedOrHeavy: boolean;
    portionControlEasy: boolean;
  };
}

export interface RankedFoodCandidate {
  place: RestaurantDiscoveryCandidate;
  status: 'RECOMMENDABLE'|'DISCOVERY_ONLY';
  item?: VerifiedMenuEvidence;
  nutritionFit: number;
  contextFit: number;
  evidenceScore: number;
  rationale: string;
}

function evScore(c: EvidenceConfidence): number { return c === 'HIGH' ? 2 : c === 'MEDIUM' ? 1 : 0; }

function nutritionFit(item: VerifiedMenuEvidence): number {
  let score = 0;
  if (item.signals.meaningfulProtein) score += 2;
  if (item.signals.vegetablesOrFruit) score += 1;
  if (item.signals.portionControlEasy) score += 1;
  if (item.signals.friedOrHeavy) score -= 2;
  return score;
}

function contextFit(item: VerifiedMenuEvidence, context: FoodFinderTrainingContext): number {
  let score = 0;
  if (context === 'PRE_TRAINING' || context === 'POST_TRAINING' || context === 'RECOVERY_DAY') {
    if (item.signals.meaningfulProtein) score += 1;
    if (item.signals.practicalCarbSource) score += 1;
  }
  if (context === 'REST_DAY') {
    if (item.signals.portionControlEasy) score += 1;
    if (item.signals.friedOrHeavy) score -= 1;
  }
  return score;
}

/**
 * Lexicographic ranking preserves nutrition/context priority over proximity.
 * Proximity is only a tie-breaker.
 */
export function rankFoodFinderCandidates(
  places: RestaurantDiscoveryCandidate[],
  menuEvidence: VerifiedMenuEvidence[],
  context: FoodFinderTrainingContext,
): RankedFoodCandidate[] {
  const evidenceByPlace = new Map<string, VerifiedMenuEvidence[]>();
  for (const item of menuEvidence) {
    const list = evidenceByPlace.get(item.placeId) ?? [];
    list.push(item);
    evidenceByPlace.set(item.placeId, list);
  }

  return places.map(place => {
    const items = evidenceByPlace.get(place.placeId) ?? [];
    if (!items.length) {
      return {
        place, status: 'DISCOVERY_ONLY' as const,
        nutritionFit: -999, contextFit: -999, evidenceScore: -999,
        rationale: 'Restaurant discovered, but no verified menu evidence is available. No order recommendation is produced.',
      };
    }

    const best = items.map(item => ({
      item, nutrition: nutritionFit(item), context: contextFit(item, context), evidence: evScore(item.confidence),
    })).sort((a,b) => b.nutrition-a.nutrition || b.context-a.context || b.evidence-a.evidence)[0];

    const modification = best.item.suggestedModification
      ? ` Modification: ${best.item.suggestedModification}.` : '';

    return {
      place, status: 'RECOMMENDABLE' as const, item: best.item,
      nutritionFit: best.nutrition, contextFit: best.context, evidenceScore: best.evidence,
      rationale: `Verified menu evidence supports ${best.item.itemName} as the strongest currently evidenced option for this context.${modification}`,
    };
  }).sort((a,b) => {
    if (a.status !== b.status) return a.status === 'RECOMMENDABLE' ? -1 : 1;
    if (a.status === 'RECOMMENDABLE' && b.status === 'RECOMMENDABLE') {
      return b.nutritionFit-a.nutritionFit || b.contextFit-a.contextFit || b.evidenceScore-a.evidenceScore ||
        (a.place.distanceMeters ?? Number.MAX_SAFE_INTEGER)-(b.place.distanceMeters ?? Number.MAX_SAFE_INTEGER);
    }
    return (a.place.distanceMeters ?? Number.MAX_SAFE_INTEGER)-(b.place.distanceMeters ?? Number.MAX_SAFE_INTEGER);
  });
}

export function directionsUrl(place: RestaurantDiscoveryCandidate): string {
  const params = new URLSearchParams({
    api: '1', destination: `${place.lat},${place.lng}`, destination_place_id: place.placeId,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function haversineMeters(origin:{lat:number;lng:number}, destination:{lat:number;lng:number}): number {
  const R = 6371000;
  const toRad = (deg:number) => deg*Math.PI/180;
  const dLat = toRad(destination.lat-origin.lat);
  const dLng = toRad(destination.lng-origin.lng);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(origin.lat))*Math.cos(toRad(destination.lat))*Math.sin(dLng/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}
