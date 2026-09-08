# B10 — Contextual Food Finder Foundation

Status: IMPLEMENTED / PENDING PROVIDER CONFIGURATION AND RUNTIME DOGFOOD

## Provider spike decision

Initial restaurant discovery provider: **Google Places API (New)**.

Current rationale:
- supported Nearby Search surface;
- current official pricing provides a free usage cap before paid volume;
- returns place ID, name, address and coordinates required for discovery and Directions handoff;
- server-side integration keeps the discovery API key out of browser code.

Foursquare was reviewed but not selected for the initial implementation because legacy V3 endpoints were deprecated in May 2026 and menu access remains associated with legacy V2/Premium surfaces, creating extra implementation/commercial uncertainty for a new build.

## Menu evidence boundary

Google Places discovery is NOT treated as menu evidence.

A restaurant becomes `RECOMMENDABLE` only when a separate verified menu-evidence record exists. Without such evidence it remains `DISCOVERY_ONLY`.

The app therefore does not invent:
- menu item,
- portion,
- modification,
- nutrition facts,
- operating status,
- availability.

## Ranking

Lexicographic priority:
1. nutrition fit;
2. context/menu suitability;
3. evidence confidence;
4. proximity as tie-breaker.

A materially better nutrition-fit candidate may outrank a closer poorer-fit restaurant.

## Location privacy

Precise location is requested only after explicit user action, sent to the authenticated discovery endpoint, and is not persisted by Superabang.

## List + Map

The List and future Map are designed over the same candidate set. This foundation exposes candidate coordinates but deliberately does not render a fake map. Browser map-provider activation is still required.

## Runtime prerequisites

Vercel server-only environment variable:
`GOOGLE_PLACES_API_KEY`

No service-role key is required.

Existing Health workflow remains canonical during dogfood.
