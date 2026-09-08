# B7 — Training Progression Layer

Status: IMPLEMENTED / PROVISIONAL DOGFOOD

Purpose: turn completed workout evidence into deterministic next-exposure progression review without bypassing the M1 safety gate or silently modifying the current program.

Rules:
- BLOCK_PROGRESSION always blocks exercise progression.
- HOLD_LOAD always holds load.
- Missing working sets, missed reps, or working below prescribed load => REPEAT.
- RPE above the prescription ceiling => HOLD even if the global safety action is otherwise eligible.
- Only sessions that meet prescribed working load/reps/RPE with no safety block become PROGRESS_CANDIDATE.
- Verified equipment update: Olympic bar 20 kg and one pair of 0.5 kg microplates (2 plates total) are user-reported equipment facts.
- For B7, the smallest verified incremental barbell capability is therefore +1.0 kg total (+0.5 kg per side). When progression is otherwise eligible, the app may surface current target +1.0 kg as an equipment-feasible candidate.
- This does NOT mean +1.0 kg is automatically the correct programming progression. The progression magnitude rule remains PROVISIONAL and recommendations do not mutate the current program.
- Cable-stack exact increments are not configured, so the app intentionally does not invent a next stack load.
- Recommendations do not automatically mutate program_version or today's prescription.

Rule version: `b7-progression-0.1.0` / `PROVISIONAL`.
