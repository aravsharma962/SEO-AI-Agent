-- SEO AI Agent — initial schema
-- Mirrors the multi-tenant client_id / RLS pattern used on AiSend.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- join table: which auth.users can access which client (agency users may
-- belong to multiple clients; client users belong to one).
create table if not exists client_members (
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member', -- owner | member
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Audit pipeline (Part B4)
-- ---------------------------------------------------------------------------

-- one row per audit request
create table if not exists audit_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  target_keyword text not null,
  location text,
  industry text,
  page_type text,
  status text not null default 'pending', -- pending | running | complete | failed
  error text,
  search_intent jsonb, -- { primary, secondary, reasoning } — A8 Step 1
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists audit_runs_client_id_idx on audit_runs(client_id);
create index if not exists audit_runs_status_idx on audit_runs(status);

-- one row per page in the audit (client page + competitor pages)
create table if not exists audit_pages (
  id uuid primary key default gen_random_uuid(),
  audit_run_id uuid not null references audit_runs(id) on delete cascade,
  url text not null,
  observed_rank int,
  on_page jsonb,
  content jsonb,
  entities jsonb,
  entity_relationships jsonb,
  eeat jsonb,
  experience jsonb,
  local jsonb,
  schema_data jsonb,
  social_metadata jsonb,
  technical jsonb,
  internal_links jsonb,
  authority jsonb,
  sentiment jsonb,
  scores jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists audit_pages_audit_run_id_idx on audit_pages(audit_run_id);

-- comparison + recommendations output (one row per audit_run)
create table if not exists audit_comparisons (
  id uuid primary key default gen_random_uuid(),
  audit_run_id uuid not null references audit_runs(id) on delete cascade,
  page_advantages jsonb,
  content_gaps jsonb,
  semantic_gaps jsonb,
  technical_gaps jsonb,
  authority_gaps jsonb,
  ranking_hypothesis jsonb,
  recommendations jsonb,
  current_scores jsonb,
  projected_scores jsonb,
  confidence jsonb,
  missing_data jsonb,
  created_at timestamptz not null default now(),
  unique (audit_run_id)
);

-- per-run API usage tracking (Part C: DataForSEO is pay-per-query)
create table if not exists audit_usage (
  id uuid primary key default gen_random_uuid(),
  audit_run_id uuid not null references audit_runs(id) on delete cascade,
  provider text not null, -- anthropic | dataforseo
  operation text not null, -- e.g. entity_extraction, backlinks_summary
  units numeric,
  cost_usd numeric,
  created_at timestamptz not null default now()
);

create index if not exists audit_usage_audit_run_id_idx on audit_usage(audit_run_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table clients enable row level security;
alter table client_members enable row level security;
alter table audit_runs enable row level security;
alter table audit_pages enable row level security;
alter table audit_comparisons enable row level security;
alter table audit_usage enable row level security;

create or replace function is_client_member(target_client_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from client_members
    where client_id = target_client_id
      and user_id = auth.uid()
  );
$$;

create policy "clients: members can select" on clients
  for select using (is_client_member(id));

create policy "client_members: members can select own rows" on client_members
  for select using (user_id = auth.uid());

create policy "audit_runs: members can select" on audit_runs
  for select using (is_client_member(client_id));

create policy "audit_runs: members can insert" on audit_runs
  for insert with check (is_client_member(client_id));

create policy "audit_runs: members can update" on audit_runs
  for update using (is_client_member(client_id));

create policy "audit_pages: members can select" on audit_pages
  for select using (
    exists (
      select 1 from audit_runs
      where audit_runs.id = audit_pages.audit_run_id
        and is_client_member(audit_runs.client_id)
    )
  );

create policy "audit_comparisons: members can select" on audit_comparisons
  for select using (
    exists (
      select 1 from audit_runs
      where audit_runs.id = audit_comparisons.audit_run_id
        and is_client_member(audit_runs.client_id)
    )
  );

create policy "audit_usage: members can select" on audit_usage
  for select using (
    exists (
      select 1 from audit_runs
      where audit_runs.id = audit_usage.audit_run_id
        and is_client_member(audit_runs.client_id)
    )
  );

-- Note: audit_pages / audit_comparisons / audit_usage inserts and updates are
-- performed by the pipeline worker using the service_role key (bypasses RLS),
-- never directly by client-facing API routes using the anon key.
