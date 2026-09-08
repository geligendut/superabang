# B8 — Nutrition Foundation

Status: IMPLEMENTED / PENDING DEPLOYMENT

Purpose: establish account-scoped manual meal logging without creating false precision or false complete-day nutrition totals.

Invariants:
- A meal can be marked PARTIAL or COMPLETE.
- Nutrition values are optional and remain nullable.
- Entered nutrition values require an explicit basis and confidence.
- UNKNOWN basis cannot carry nutrition values or confidence.
- Missing nutrition values remain unknown; they are never coerced to zero.
- The UI shows a **logged subtotal**, not a daily total.
- A partial meal or incomplete day is not silently promoted to complete intake.
- Source is MANUAL for B8.
- No calorie target, macro target, meal recommendation, or automated training adjustment is introduced in B8.
- Current Health workflow remains authoritative; app DB is still dogfood operational data, not canonical health record.

This foundation intentionally precedes contextual nutrition recommendations and Food Finder.
