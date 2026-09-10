-- Cover the retained prior-program lineage foreign key reported by the database advisor.
create index if not exists ix_canonical_cutover_event_prior_program
  on public.canonical_cutover_event(prior_program_version_id);
