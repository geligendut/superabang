import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankFoodFinderCandidates,
  haversineMeters,
  directionsUrl,
  type RestaurantDiscoveryCandidate,
  type VerifiedMenuEvidence,
} from '../src/domain/food-finder.ts';

function place(id: string, distanceMeters: number): RestaurantDiscoveryCandidate {
  return {
    provider: 'GOOGLE_PLACES',
    placeId: id,
    name: `Place ${id}`,
    address: null,
    lat: -6.2,
    lng: 106.8,
    distanceMeters,
  };
}

function menu(id: string, placeId: string, overrides: Partial<VerifiedMenuEvidence> = {}): VerifiedMenuEvidence {
  return {
    id,
    placeId,
    restaurantName: `Restaurant ${placeId}`,
    itemName: `Item ${id}`,
    itemDescription: null,
    portionNote: null,
    suggestedModification: null,
    evidenceUrl: 'https://example.com/menu',
    observedAt: new Date().toISOString(),
    confidence: 'HIGH',
    signals: {
      meaningfulProtein: true,
      vegetablesOrFruit: true,
      practicalCarbSource: false,
      friedOrHeavy: false,
      portionControlEasy: true,
    },
    ...overrides,
  };
}

test('restaurant without verified menu evidence is discovery-only', () => {
  const ranked = rankFoodFinderCandidates([place('a', 100)], [], 'REST_DAY');
  assert.equal(ranked[0].status, 'DISCOVERY_ONLY');
  assert.equal(ranked[0].item, undefined);
});

test('better nutrition fit outranks materially closer poorer fit', () => {
  const p1 = place('healthy-far', 1200);
  const p2 = place('heavy-near', 100);
  const m1 = menu('m1', 'healthy-far');
  const m2 = menu('m2', 'heavy-near', {
    signals: {
      meaningfulProtein: true,
      vegetablesOrFruit: false,
      practicalCarbSource: true,
      friedOrHeavy: true,
      portionControlEasy: false,
    },
  });
  const ranked = rankFoodFinderCandidates([p2, p1], [m1, m2], 'REST_DAY');
  assert.equal(ranked[0].place.placeId, 'healthy-far');
});

test('post-training context rewards practical carbohydrate source after nutrition fit', () => {
  const p = place('x', 500);
  const a = menu('protein-only', 'x', {
    confidence: 'MEDIUM',
    signals: {
      meaningfulProtein: true,
      vegetablesOrFruit: true,
      practicalCarbSource: false,
      friedOrHeavy: false,
      portionControlEasy: true,
    },
  });
  const b = menu('protein-carb', 'x', {
    signals: {
      meaningfulProtein: true,
      vegetablesOrFruit: true,
      practicalCarbSource: true,
      friedOrHeavy: false,
      portionControlEasy: true,
    },
  });
  const ranked = rankFoodFinderCandidates([p], [a, b], 'POST_TRAINING');
  assert.equal(ranked[0].item?.id, 'protein-carb');
});

test('directions handoff includes destination place id', () => {
  const url = directionsUrl(place('abc123', 100));
  assert.ok(url.includes('destination_place_id=abc123'));
});

test('haversine distance is deterministic and non-negative', () => {
  assert.equal(haversineMeters({lat:-6.2,lng:106.8},{lat:-6.2,lng:106.8}), 0);
  assert.ok(haversineMeters({lat:-6.2,lng:106.8},{lat:-6.21,lng:106.81}) > 0);
});
