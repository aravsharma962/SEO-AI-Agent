-- Historical SERP rank tracking (Part F "ranking-change attribution").
-- src/modules/serp-check already verifies rank once per audit; this table
-- accumulates that over time — one row per rank check, whether it came
-- from a fresh audit run or a periodic cron re-check (audit_run_id is
-- null for the latter, since it isn't tied to any specific audit).
create table if not exists rank_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  audit_run_id uuid references audit_runs(id) on delete set null,
  target_keyword text not null,
  url text not null,
  observed_rank int,
  note text,
  checked_at timestamptz not null default now()
);

create index if not exists rank_history_client_id_idx on rank_history(client_id);
create index if not exists rank_history_url_keyword_idx on rank_history(url, target_keyword);
create index if not exists rank_history_checked_at_idx on rank_history(checked_at);

alter table rank_history enable row level security;

create policy "rank_history: members can select" on rank_history
  for select using (is_client_member(client_id));

-- Inserts happen via the service-role client only (pipeline.ts on a fresh
-- audit, the rank-check cron job on periodic re-checks) — same pattern as
-- audit_pages/audit_comparisons, which also have no client-facing insert
-- policy.
