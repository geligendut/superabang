# B11 — Program Change & Version Activation

Status: implementation candidate.

Invariants:
- maximum one CURRENT program version per user;
- BLOCK/HOLD cannot increase load;
- proposal creation does not mutate CURRENT;
- explicit activation supersedes prior CURRENT atomically;
- proposal is stale if its based-on version is no longer CURRENT;
- workout logging remains local-first and uses the prescription snapshot captured at session creation;
- app CURRENT remains dogfood-only; Health canonical cutover is not started.

Runtime dogfood:
1. Initialize synthetic dogfood version 1 if no CURRENT exists.
2. Select safety-stop exposure: expect NO_CHANGE and no proposal button.
3. Select eligible completed exposure: expect Bench Press 50 → 51 kg preview.
4. Create PLANNED version: CURRENT remains version 1.
5. Approve & activate: version 1 becomes SUPERSEDED; version 2 becomes CURRENT.
6. Open Today's workout: expect CURRENT version reference and 51 kg working sets.
7. Reopen prior history: prior prescribed snapshot remains unchanged.
