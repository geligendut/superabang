# B6 Longitudinal Trend Layer

Status: DOGFOOD IMPLEMENTATION

## Decision

Body measurements remain factual observations. Superabang exposes two separate concepts:

1. latest-vs-prior observation change (direct comparison); and
2. longitudinal trajectory estimate (descriptive estimate).

A trajectory estimate is withheld until the metric has at least 3 valid observations spanning at least 7 days. Weight and waist are evaluated independently; missing values are never inferred.

When sufficient, the weekly trajectory is an ordinary least-squares slope across all available observations for that metric, expressed per 7 days. It is explicitly descriptive only: it is not a target, diagnosis, clinical threshold, or automatic training/nutrition decision.

This prevents a single measurement or a short same-week cluster from being presented as a meaningful trajectory.
