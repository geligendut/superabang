# B9 — Contextual Nutrition Decisioning

Status: IMPLEMENTED / PROVISIONAL DOGFOOD

Purpose: generate qualitative next-meal guidance from explicit training context and account-scoped meal evidence while preserving uncertainty and provenance.

Rule version: `b9-contextual-nutrition-0.1.0` / `PROVISIONAL`.

Current scope:
- training context is explicitly selected by the user;
- current-day meal evidence is read from `nutrition_meal`;
- missing nutrition values remain unknown;
- no calorie target or macro target is generated;
- no statement of deficiency is made from missing values;
- recommendation provenance is stored in the existing `recommendation_snapshot`;
- evidence references point to the meal rows used;
- generated recommendation is not automatically accepted or performed;
- medical constraints are not yet applied to the B9 rule;
- synthetic workout history is deliberately not used to infer real training context.

Context priorities:
- Rest day: protein, produce/fiber, appropriate energy density and portions.
- Pre-training: practical carbohydrate + protein; avoid excessive fat/fiber close to training if it impairs comfort.
- Post-training: protein + carbohydrate according to session demand, hydration, no unrestricted-eating logic.
- Recovery day: protein, food quality, sufficient energy without forcing surplus.
- Unspecified: conservative protein/produce/portion/hydration guidance.

Food Finder and restaurant/menu ranking remain a later stage.
