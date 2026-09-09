-- Competitor / page change monitoring agent. Tracks the same (client,
-- keyword, url) set that rank_history already tracks (both the client's
-- own page and competitor pages fall out of that set symmetrically), so
-- this alerts on unexpected changes to your own site too, not just
-- competitor moves.

-- One row per tracked page, upserted each check — only the latest
-- snapshot is kept (this is a diff baseline, not a full history).
create table if not exists page_snapshots (
  client_id uuid not null references clients(id) on delete cascade,
  target_keyword text not null,
  url text not null,
  content_hash text not null,
  page_text text, -- truncated snapshot kept only to feed the next diff
  captured_at timestamptz not null default now(),
  primary key (client_id, target_keyword, url)
);

-- Append-only log of detected, SEO-relevant changes (see
-- src/modules/competitor-watch — the significance judgment is Claude's,
-- not a raw diff, since most byte-level changes on a real page are noise:
-- ads, timestamps, unrelated dynamic content).
create table if not exists page_changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  target_keyword text not null,
  url text not null,
  summary text not null,
  seo_relevant boolean not null,
  notable_additions jsonb,
  notable_removals jsonb,
  detected_at timestamptz not null default now()
);

create index if not exists page_changes_client_id_idx on page_changes(client_id);
create index if not exists page_changes_url_keyword_idx on page_changes(url, target_keyword);

alter table page_snapshots enable row level security;
alter table page_changes enable row level security;

create policy "page_snapshots: members can select" on page_snapshots
  for select using (is_client_member(client_id));

create policy "page_changes: members can select" on page_changes
  for select using (is_client_member(client_id));

-- Writes happen via the service-role client only (the competitor-watch
-- cron job), same pattern as rank_history/audit_pages/audit_comparisons.
