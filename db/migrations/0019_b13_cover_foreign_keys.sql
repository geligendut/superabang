-- Cover foreign keys used by reconciliation cleanup and program lineage checks.

create index if not exists ix_canonical_reconciliation_batch_user
  on public.canonical_reconciliation_batch(user_id);
create index if not exists ix_canonical_reconciliation_item_batch
  on public.canonical_reconciliation_item(batch_id);
create index if not exists ix_canonical_reconciliation_item_user
  on public.canonical_reconciliation_item(user_id);

create index if not exists ix_program_version_based_on
  on public.program_version(based_on_version_id);
create index if not exists ix_program_version_source_session
  on public.program_version(source_session_id);
create index if not exists ix_program_version_source_recommendation
  on public.program_version(source_recommendation_id);
