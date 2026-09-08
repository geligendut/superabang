# B10 Menu Evidence Dogfood

Status: IMPLEMENTATION CANDIDATE

Purpose: close the B10 acceptance gap between restaurant discovery and evidence-backed menu/order recommendation without fabricating menu facts.

## Behavior

- A discovery candidate remains `DISCOVERY_ONLY` until account-scoped verified menu evidence exists for the exact Google Place ID.
- Evidence entry is attached directly to a discovered candidate, so the Google Place ID is captured by the app rather than manually copied.
- Required: item/order name, evidence URL, explicit user verification checkbox.
- Provenance retained: source (`USER_VERIFIED` or `RESTAURANT_PUBLISHED`), observed timestamp, confidence, evidence URL, qualitative signals.
- Optional: item description, portion note, suggested modification.
- After save, evidence is reloaded under RLS and deterministic ranking is refreshed.
- Recommendation remains deterministic; no AI or menu inference is introduced.

## Dogfood target

Use a real discovered restaurant and evidence actually reviewed by the user. For Pagi Sore Saharjo, a public restaurant menu page currently lists items including Ayam Panggang, Ayam Pop, Sayur Singkong Rebus, Cah Buncis Ayam, Ikan Nila Dabu-Dabu and others. The user must still inspect the cited source before saving signals/portion/modification in Superabang.

## Boundary

This patch does not activate the Map view and does not change the current B10 ranking status model. Full B10 acceptance still requires Map activation over the same ranked candidate set.
