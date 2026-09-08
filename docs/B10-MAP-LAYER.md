# B10 Map Layer

Status: IMPLEMENTED / PENDING BROWSER PROVIDER CONFIGURATION & RUNTIME DOGFOOD

## Decision
Use Google Maps JavaScript API for the browser map while retaining Google Places API (New) as the server-side discovery provider.

Security boundary:
- `GOOGLE_PLACES_API_KEY`: server-side Vercel secret, restricted to Places API (New).
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`: browser-visible key, restricted by HTTP referrer to the Superabang production origin and restricted to Maps JavaScript API.
- Do not reuse the server Places key in the browser.

## Invariants
- Map receives the exact `ranked` array rendered by the List.
- Map performs no restaurant discovery/search of its own.
- Pin labels 1..N match List rank 1..N.
- Context changes and verified menu evidence recompute the same deterministic ranking used by both surfaces.
- Marker info shows only already-supported candidate/evidence state; it does not invent menu facts or availability.
- Precise user location is not persisted or passed to the map component after discovery; the map renders restaurant candidate coordinates only.

## Runtime configuration
Enable Maps JavaScript API in the Google Cloud project and create a separate browser API key.
Set Vercel environment variable:
`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`

For production, restrict the browser key to HTTP referrer:
`https://superabang.vercel.app/*`
and API restriction:
`Maps JavaScript API`.

A new Vercel deployment is required after adding/changing a NEXT_PUBLIC environment variable.
